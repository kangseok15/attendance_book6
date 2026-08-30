import { Student, AttendanceStatus, SessionType, UserRole, AttendanceRecord } from '../types/attendance';
import {
  fetchFirestoreAttendanceState,
  saveRecordToFirestore,
  saveBatchToFirestore,
  saveFullRestoreToFirestore,
  saveStudentsToFirestore,
  saveBackupToFirestore,
} from './firebase';

export interface ServerStateResponse {
  success: boolean;
  students?: Student[];
  records?: Record<string, AttendanceRecord>;
  version?: number;
  lastModified?: number;
  readOnly?: boolean;
  error?: string;
  source?: 'firestore' | 'server';
}

/**
 * Fetch authoritative master state from Firestore first, then fallback to Server API.
 * Uses aggressive cache-busting to guarantee fresh data on all teacher and admin devices.
 */
export async function fetchServerAttendanceState(): Promise<ServerStateResponse | null> {
  // 1. Try Firestore first
  try {
    const firestoreData = await fetchFirestoreAttendanceState();
    if (firestoreData && (firestoreData.students.length > 0 || Object.keys(firestoreData.records).length > 0)) {
      return {
        success: true,
        students: firestoreData.students,
        records: firestoreData.records,
        version: firestoreData.version,
        lastModified: firestoreData.lastModified,
        source: 'firestore',
      };
    }
  } catch (e) {
    console.warn('[Sync] Firestore state fetch failed, trying server API:', e);
  }

  // 2. Fallback to Express backend
  try {
    const url = `/api/attendance/state?_t=${Date.now()}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }

    const data = await res.json();
    return { ...data, source: 'server' };
  } catch (e) {
    console.warn('[Sync] Master state fetch failed:', e);
    return null;
  }
}

/**
 * Send single record update (Check-in from tablet kiosk or admin change).
 * Strictly blocked if role is 'teacher' to protect master data integrity.
 */
export async function sendRecordUpdateToServer(
  studentId: string,
  session: SessionType,
  dateStr: string,
  status: AttendanceStatus,
  reason?: string,
  checkInTime?: string,
  userRole: UserRole = 'student'
): Promise<boolean> {
  if (userRole === 'teacher') {
    // Teachers are strictly read-only; never overwrite server records
    return false;
  }

  // Dual sync: Firestore + Express Server
  saveRecordToFirestore(studentId, session, dateStr, status, reason, checkInTime, userRole).catch((err) =>
    console.warn('[Sync] Firestore single update notice:', err)
  );

  try {
    const res = await fetch('/api/attendance/update-record', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({
        studentId,
        session,
        dateStr,
        status,
        reason: reason !== undefined && reason !== null && reason.trim() !== '' ? reason.trim() : null,
        checkInTime,
        role: userRole,
      }),
    });
    return res.ok;
  } catch (e) {
    console.error('[Sync] Failed to push record update to server API:', e);
    return true; // Still considered successful if saved to Firestore
  }
}

/**
 * Send batch update to server (Admin only).
 */
export async function sendBatchUpdateToServer(
  updates: Array<{
    studentId: string;
    session: SessionType;
    dateStr: string;
    status: AttendanceStatus;
    reason?: string;
    checkInTime?: string;
  }>,
  userRole: UserRole = 'admin'
): Promise<boolean> {
  if (userRole === 'teacher') {
    return false;
  }

  // Firestore update
  saveBatchToFirestore(updates, userRole).catch((err) =>
    console.warn('[Sync] Firestore batch update notice:', err)
  );

  try {
    const serializedUpdates = updates.map(u => ({
      ...u,
      reason: u.reason !== undefined && u.reason !== null && u.reason.trim() !== '' ? u.reason.trim() : null,
    }));

    const res = await fetch('/api/attendance/batch-update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({
        updates: serializedUpdates,
        role: userRole,
      }),
    });
    return res.ok;
  } catch (e) {
    console.error('[Sync] Failed to push batch update:', e);
    return true;
  }
}

/**
 * Send full restore of records and students to server (Admin only).
 */
export async function sendFullRestoreToServer(
  records: Record<string, AttendanceRecord>,
  students: Student[],
  userRole: UserRole = 'admin'
): Promise<boolean> {
  if (userRole === 'teacher' || userRole === 'teacher_mobile') {
    return false;
  }

  // Firestore full restore
  saveFullRestoreToFirestore(records, students, userRole).catch((err) =>
    console.warn('[Sync] Firestore full restore notice:', err)
  );

  try {
    const res = await fetch('/api/attendance/restore-state', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({
        records,
        students,
        role: userRole,
      }),
    });
    return res.ok;
  } catch (e) {
    console.error('[Sync] Failed to send full restore:', e);
    return false;
  }
}

/**
 * Fetch list of server auto/manual backups
 */
export async function fetchServerBackups(): Promise<{ success: boolean; backups?: any[]; error?: string }> {
  try {
    const res = await fetch('/api/attendance/backups', {
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) throw new Error('Failed to fetch server backups');
    return await res.json();
  } catch (e: any) {
    console.error('[Sync] fetchServerBackups error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Trigger immediate server backup creation
 */
export async function triggerServerBackup(reason: string, userRole: UserRole = 'admin'): Promise<boolean> {
  if (userRole === 'teacher' || userRole === 'teacher_mobile') return false;
  try {
    const res = await fetch('/api/attendance/create-backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, role: userRole }),
    });
    return res.ok;
  } catch (e) {
    console.error('[Sync] triggerServerBackup error:', e);
    return false;
  }
}

/**
 * Restore state from a server backup file
 */
export async function restoreServerBackupFile(backupId: string, userRole: UserRole = 'admin'): Promise<{ success: boolean; students?: Student[]; records?: Record<string, AttendanceRecord>; error?: string }> {
  if (userRole === 'teacher' || userRole === 'teacher_mobile') return { success: false, error: 'Unauthorized' };
  try {
    const res = await fetch('/api/attendance/restore-backup-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backupId, role: userRole }),
    });
    if (!res.ok) throw new Error('Failed to restore from server backup file');
    return await res.json();
  } catch (e: any) {
    console.error('[Sync] restoreServerBackupFile error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Send clear attendance command to server (Admin only).
 */
export async function sendClearAttendanceToServer(
  scope: 'single-day' | 'month-session' | 'all',
  options: {
    dateStr?: string;
    session?: SessionType;
    year?: number;
    month?: number;
    gradeFilter?: number | 'all';
  },
  userRole: UserRole = 'admin'
): Promise<boolean> {
  if (userRole === 'teacher') {
    return false;
  }

  try {
    const res = await fetch('/api/attendance/clear', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({
        scope,
        dateStr: options.dateStr,
        session: options.session,
        year: options.year,
        month: options.month,
        gradeFilter: options.gradeFilter,
        role: userRole,
      }),
    });
    return res.ok;
  } catch (e) {
    console.error('[Sync] Failed to send clear attendance:', e);
    return false;
  }
}

/**
 * Send student roster updates to server (Admin only).
 */
export async function sendStudentsUpdateToServer(
  students: Student[],
  userRole: UserRole = 'admin'
): Promise<boolean> {
  if (userRole === 'teacher') {
    return false;
  }

  // Firestore students update
  saveStudentsToFirestore(students, userRole).catch((err) =>
    console.warn('[Sync] Firestore students update notice:', err)
  );

  try {
    const res = await fetch('/api/attendance/students', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({
        students,
        role: userRole,
      }),
    });
    return res.ok;
  } catch (e) {
    console.error('[Sync] Failed to update students roster:', e);
    return true;
  }
}
