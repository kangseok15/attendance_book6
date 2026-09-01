/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  getDoc,
  setDoc, 
  onSnapshot, 
  enableIndexedDbPersistence 
} from 'firebase/firestore';
import { Student, AttendanceRecord, AttendanceStatus, SessionType } from '../types/attendance';

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyBj5SCdMoc5TRzmhYAwqxHaEGhtvOmVUrE",
  authDomain: "attendance-book-9d28e.firebaseapp.com",
  projectId: "attendance-book-9d28e",
  storageBucket: "attendance-book-9d28e.firebasestorage.app",
  messagingSenderId: "576981296217",
  appId: "1:576981296217:web:dfcbab31e008e527be7d48"
};

export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);

if (typeof window !== 'undefined') {
  try {
    enableIndexedDbPersistence(db).catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn('[Firebase] Multiple tabs open, offline persistence disabled for secondary tab.');
      } else if (err.code === 'unimplemented') {
        console.warn('[Firebase] Current browser does not support offline persistence.');
      }
    });
  } catch (e) {
    // Ignore persistence errors
  }
}

/**
 * master_state 전체 records 동기화 (undefined 자동 정제 -> Firestore 100% 저장 보장)
 */
export async function syncMasterRecordsToFirestore(
  newRecords: Record<string, AttendanceRecord>, 
  studentsList?: Student[]
) {
  try {
    const masterRef = doc(db, 'attendance', 'master_state');
    const snap = await getDoc(masterRef);
    const existingData = snap.exists() ? snap.data() : {};
    const studentsToSave = (studentsList && studentsList.length > 0) 
      ? studentsList 
      : (existingData.students || []);

    // 🔥 Firestore undefined 직렬화 에러 원천 차단
    const cleanRecords = JSON.parse(JSON.stringify(newRecords || {}));
    const cleanStudents = JSON.parse(JSON.stringify(studentsToSave || []));

    await setDoc(masterRef, {
      students: cleanStudents,
      records: cleanRecords,
      updatedAt: Date.now()
    });
    return true;
  } catch (e) {
    console.error('[Firebase] syncMasterRecordsToFirestore error:', e);
    return false;
  }
}

/**
 * Firestore 전체 출결 상태 1회 가져오기
 */
export async function fetchFirestoreAttendanceState() {
  try {
    const masterRef = doc(db, 'attendance', 'master_state');
    const docSnap = await getDoc(masterRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        success: true,
        students: data.students || [],
        records: data.records || {}
      };
    }
    return { success: true, students: [], records: {} };
  } catch (e) {
    console.error('[Firebase] fetchFirestoreAttendanceState error:', e);
    return { success: false, error: e };
  }
}

/**
 * 단일 출결 저장
 */
export async function saveRecordToFirestore(
  studentId: string,
  session: SessionType,
  dateStr: string,
  status: AttendanceStatus,
  reason?: string,
  checkInTime?: string
) {
  try {
    const key = `${studentId}_${session}_${dateStr}`;
    const masterRef = doc(db, 'attendance', 'master_state');
    const masterSnap = await getDoc(masterRef);
    const data = masterSnap.exists() ? masterSnap.data() : {};
    const existingRecords = { ...(data.records || {}) };

    if (status === 'NONE') {
      delete existingRecords[key];
    } else {
      const recordItem: AttendanceRecord = { status };
      if (reason && reason.trim() !== '') recordItem.reason = reason.trim();
      if (checkInTime && checkInTime.trim() !== '') recordItem.checkInTime = checkInTime.trim();
      existingRecords[key] = recordItem;
    }

    await syncMasterRecordsToFirestore(existingRecords, data.students);
    return true;
  } catch (e) {
    console.error('[Firebase] saveRecordToFirestore error:', e);
    return false;
  }
}

/**
 * 일괄 출결 저장
 */
export async function saveBatchToFirestore(
  updates: Array<{
    studentId: string;
    session: SessionType;
    dateStr: string;
    status: AttendanceStatus;
    reason?: string;
    checkInTime?: string;
  }>
) {
  try {
    if (!updates || updates.length === 0) return true;

    const masterRef = doc(db, 'attendance', 'master_state');
    const masterSnap = await getDoc(masterRef);
    const data = masterSnap.exists() ? masterSnap.data() : {};
    const existingRecords = { ...(data.records || {}) };

    updates.forEach(u => {
      const key = `${u.studentId}_${u.session}_${u.dateStr}`;
      if (u.status === 'NONE') {
        delete existingRecords[key];
      } else {
        const recordItem: AttendanceRecord = { status: u.status };
        if (u.reason && u.reason.trim() !== '') recordItem.reason = u.reason.trim();
        if (u.checkInTime && u.checkInTime.trim() !== '') recordItem.checkInTime = u.checkInTime.trim();
        existingRecords[key] = recordItem;
      }
    });

    await syncMasterRecordsToFirestore(existingRecords, data.students);
    return true;
  } catch (e) {
    console.error('[Firebase] saveBatchToFirestore error:', e);
    return false;
  }
}

/**
 * Firestore 학생 명단 저장
 */
export async function saveStudentsToFirestore(students: Student[]) {
  try {
    const docRef = doc(db, 'attendance', 'students');
    await setDoc(docRef, { list: students });

    const masterRef = doc(db, 'attendance', 'master_state');
    const snap = await getDoc(masterRef);
    const existingRecords = snap.exists() ? (snap.data().records || {}) : {};

    await setDoc(masterRef, {
      students,
      records: existingRecords,
      updatedAt: Date.now()
    });
    return true;
  } catch (e) {
    console.error('[Firebase] saveStudentsToFirestore error:', e);
    return false;
  }
}

/**
 * 백업 저장
 */
export async function saveBackupToFirestore(name: string, payload: any) {
  try {
    const docRef = doc(db, 'attendance_backups', `backup_${Date.now()}`);
    await setDoc(docRef, {
      name,
      payload: JSON.parse(JSON.stringify(payload)),
      createdAt: Date.now()
    });
    return true;
  } catch (e) {
    console.error('[Firebase] saveBackupToFirestore error:', e);
    return false;
  }
}

/**
 * 전체 복원
 */
export async function saveFullRestoreToFirestore(
  records: Record<string, AttendanceRecord>,
  students?: Student[]
) {
  try {
    return await syncMasterRecordsToFirestore(records, students);
  } catch (e) {
    console.error('[Firebase] saveFullRestoreToFirestore error:', e);
    return false;
  }
}

/**
 * 실시간 구독 리스너
 */
export function subscribeToFirestoreAttendanceState(
  callback: (state: { students?: Student[]; records?: Record<string, AttendanceRecord> }) => void
) {
  try {
    const docRef = doc(db, 'attendance', 'master_state');
    return onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        callback({
          students: data.students,
          records: data.records
        });
      }
    }, (error) => {
      console.warn('[Firebase] Firestore subscribe error:', error);
    });
  } catch (e) {
    console.warn('[Firebase] Listener registration failed:', e);
    return () => {};
  }
}

/**
 * 출결 비우기
 */
export async function clearFirestoreAttendanceState(
  type: 'single-day' | 'month-session' | 'all',
  payload?: any
) {
  try {
    const masterRef = doc(db, 'attendance', 'master_state');
    const docSnap = await getDoc(masterRef);
    if (!docSnap.exists()) return true;

    const data = docSnap.data();
    const currentRecords = { ...(data.records || {}) };

    if (type === 'single-day' && payload?.dateStr && payload?.session) {
      Object.keys(currentRecords).forEach(key => {
        if (key.endsWith(`_${payload.session}_${payload.dateStr}`)) {
          delete currentRecords[key];
        }
      });
    } else if (type === 'month-session' && payload?.year && payload?.month && payload?.session) {
      const prefix = `${payload.year}-${String(payload.month).padStart(2, '0')}`;
      Object.keys(currentRecords).forEach(key => {
        const parts = key.split('_');
        if (parts.length >= 3 && parts[1] === payload.session && parts[2].startsWith(prefix)) {
          delete currentRecords[key];
        }
      });
    } else if (type === 'all') {
      return await syncMasterRecordsToFirestore({}, data.students);
    }

    return await syncMasterRecordsToFirestore(currentRecords, data.students);
  } catch (e) {
    console.error('[Firebase] clearFirestoreAttendanceState error:', e);
    return false;
  }
}

/**
 * master_state 직접 저장
 */
export async function saveFirestoreMasterState(
  records: Record<string, AttendanceRecord>,
  students?: Student[]
) {
  return await syncMasterRecordsToFirestore(records, students);
}
