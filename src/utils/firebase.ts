import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import { Student, AttendanceRecord, SessionType, AttendanceStatus, UserRole } from '../types/attendance';

// Static configuration for Firebase Firestore
const FIREBASE_CONFIG = {
  projectId: "gen-lang-client-0599812612",
  appId: "1:299496730867:web:ef5f7496bd2ee66758c786",
  apiKey: "AIzaSyATYPng8QJmIKhLf0z5KmodCFeiuoD6rnE",
  authDomain: "gen-lang-client-0599812612.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-v105-49d53857-4972-49af-84e8-775100137ac9",
  storageBucket: "gen-lang-client-0599812612.firebasestorage.app",
  messagingSenderId: "299496730867",
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let isInitialized = false;

export function getFirebaseDb(): Firestore | null {
  if (db) return db;
  initFirebase();
  return db;
}

export function initFirebase(): { app: FirebaseApp; db: Firestore } | null {
  if (isInitialized && db && app) {
    return { app, db };
  }

  try {
    if (getApps().length > 0) {
      app = getApp();
    } else {
      app = initializeApp(FIREBASE_CONFIG);
    }

    if (FIREBASE_CONFIG.firestoreDatabaseId && FIREBASE_CONFIG.firestoreDatabaseId !== '(default)') {
      db = getFirestore(app, FIREBASE_CONFIG.firestoreDatabaseId);
    } else {
      db = getFirestore(app);
    }

    isInitialized = true;
    return { app, db };
  } catch (err) {
    console.warn('[Firebase] Init deferred or error:', err);
    return null;
  }
}

// Document reference for Master State
const MASTER_DOC_PATH = 'attendance_master/current_state';

export interface FirestoreMasterState {
  records: Record<string, AttendanceRecord>;
  students: Student[];
  lastModified: number;
  version: number;
  lastUpdatedBy?: string;
}

/**
 * Fetch master attendance & student state directly from Firestore
 */
export async function fetchFirestoreAttendanceState(): Promise<FirestoreMasterState | null> {
  const firestore = getFirebaseDb();
  if (!firestore) return null;

  try {
    const docRef = doc(firestore, 'attendance_master', 'current_state');
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        records: (data.records as Record<string, AttendanceRecord>) || {},
        students: (data.students as Student[]) || [],
        lastModified: data.lastModified || Date.now(),
        version: data.version || 1,
        lastUpdatedBy: data.lastUpdatedBy || 'firestore',
      };
    }
    return null;
  } catch (error) {
    console.warn('[Firebase] fetchFirestoreAttendanceState failed:', error);
    return null;
  }
}

/**
 * Subscribe to real-time changes in Firestore Master State
 * Enables multi-kiosk instant sync (< 0.5s) across all tablets & PCs
 */
export function subscribeToFirestoreAttendanceState(
  callback: (state: FirestoreMasterState) => void
): Unsubscribe | null {
  const firestore = getFirebaseDb();
  if (!firestore) return null;

  try {
    const docRef = doc(firestore, 'attendance_master', 'current_state');
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          callback({
            records: (data.records as Record<string, AttendanceRecord>) || {},
            students: (data.students as Student[]) || [],
            lastModified: data.lastModified || Date.now(),
            version: data.version || 1,
            lastUpdatedBy: data.lastUpdatedBy,
          });
        }
      },
      (error) => {
        console.warn('[Firebase] Firestore onSnapshot subscription error:', error);
      }
    );
    return unsubscribe;
  } catch (err) {
    console.error('[Firebase] Failed to subscribe to master state:', err);
    return null;
  }
}

/**
 * Save single record update to Firestore
 * Multi-kiosk safe: merges the single record into the master document
 */
export async function saveRecordToFirestore(
  studentId: string,
  session: SessionType,
  dateStr: string,
  status: AttendanceStatus,
  reason?: string,
  checkInTime?: string,
  userRole: UserRole = 'student'
): Promise<boolean> {
  if (userRole === 'teacher') return false;
  const firestore = getFirebaseDb();
  if (!firestore) return false;

  try {
    const docRef = doc(firestore, 'attendance_master', 'current_state');
    const recordKey = `${studentId}_${session}_${dateStr}`;
    const cleanReason = reason && reason.trim() !== '' ? reason.trim() : null;

    const recordData: AttendanceRecord = {
      status,
      reason: cleanReason || undefined,
      checkInTime: checkInTime || (status === 'PRESENT' ? new Date().toTimeString().slice(0, 5) : undefined),
    };

    // Use updateDoc with dot notation to atomically update only this student's record without touching other records
    try {
      await updateDoc(docRef, {
        [`records.${recordKey}`]: recordData,
        lastModified: Date.now(),
        lastUpdatedBy: `${userRole}_${studentId}`,
      });
    } catch (updateErr: any) {
      // Document might not exist yet; initialize with setDoc
      await setDoc(
        docRef,
        {
          records: {
            [recordKey]: recordData,
          },
          students: [],
          lastModified: Date.now(),
          version: 1,
          lastUpdatedBy: `${userRole}_${studentId}`,
        },
        { merge: true }
      );
    }

    return true;
  } catch (err) {
    console.error('[Firebase] saveRecordToFirestore error:', err);
    return false;
  }
}

/**
 * Save batch updates to Firestore
 */
export async function saveBatchToFirestore(
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
  if (userRole === 'teacher') return false;
  const firestore = getFirebaseDb();
  if (!firestore) return false;

  try {
    const docRef = doc(firestore, 'attendance_master', 'current_state');
    const updateMap: Record<string, any> = {};

    updates.forEach((u) => {
      const recordKey = `${u.studentId}_${u.session}_${u.dateStr}`;
      updateMap[`records.${recordKey}`] = {
        status: u.status,
        reason: u.reason && u.reason.trim() !== '' ? u.reason.trim() : undefined,
        checkInTime: u.checkInTime || (u.status === 'PRESENT' ? new Date().toTimeString().slice(0, 5) : undefined),
      };
    });

    updateMap.lastModified = Date.now();
    updateMap.lastUpdatedBy = `${userRole}_batch`;

    await updateDoc(docRef, updateMap);
    return true;
  } catch (err) {
    console.error('[Firebase] saveBatchToFirestore error:', err);
    return false;
  }
}

/**
 * Save full state (students & records) to Firestore during restore
 */
export async function saveFullRestoreToFirestore(
  records: Record<string, AttendanceRecord>,
  students: Student[],
  userRole: UserRole = 'admin'
): Promise<boolean> {
  if (userRole === 'teacher' || userRole === 'teacher_mobile') return false;
  const firestore = getFirebaseDb();
  if (!firestore) return false;

  try {
    const docRef = doc(firestore, 'attendance_master', 'current_state');
    await setDoc(docRef, {
      records: records || {},
      students: students || [],
      lastModified: Date.now(),
      version: 1,
      lastUpdatedBy: `${userRole}_full_restore`,
    });
    return true;
  } catch (err) {
    console.error('[Firebase] saveFullRestoreToFirestore error:', err);
    return false;
  }
}

/**
 * Save student roster to Firestore
 */
export async function saveStudentsToFirestore(
  students: Student[],
  userRole: UserRole = 'admin'
): Promise<boolean> {
  if (userRole === 'teacher') return false;
  const firestore = getFirebaseDb();
  if (!firestore) return false;

  try {
    const docRef = doc(firestore, 'attendance_master', 'current_state');
    await setDoc(
      docRef,
      {
        students: students || [],
        lastModified: Date.now(),
        lastUpdatedBy: `${userRole}_students_update`,
      },
      { merge: true }
    );
    return true;
  } catch (err) {
    console.error('[Firebase] saveStudentsToFirestore error:', err);
    return false;
  }
}

/**
 * Save backup snapshot to Firestore cloud collection
 */
export async function saveBackupToFirestore(
  reason: string,
  records: Record<string, AttendanceRecord>,
  students: Student[]
): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore) return false;

  try {
    const backupId = `cloud_bk_${Date.now()}`;
    const backupRef = doc(firestore, 'firestore_backups', backupId);

    await setDoc(backupRef, {
      id: backupId,
      reason,
      recordsCount: Object.keys(records || {}).length,
      studentsCount: (students || []).length,
      createdAt: new Date().toISOString(),
      timestamp: Date.now(),
      records: records || {},
      students: students || [],
    });
    return true;
  } catch (err) {
    console.error('[Firebase] saveBackupToFirestore error:', err);
    return false;
  }
}

/**
 * Fetch list of cloud backups stored in Firestore
 */
export async function fetchFirestoreBackupsList(): Promise<any[]> {
  const firestore = getFirebaseDb();
  if (!firestore) return [];

  try {
    const backupsCol = collection(firestore, 'firestore_backups');
    const q = query(backupsCol, orderBy('timestamp', 'desc'), limit(15));
    const querySnapshot = await getDocs(q);

    const backups: any[] = [];
    querySnapshot.forEach((doc) => {
      backups.push(doc.data());
    });
    return backups;
  } catch (err) {
    console.warn('[Firebase] fetchFirestoreBackupsList error:', err);
    return [];
  }
}
