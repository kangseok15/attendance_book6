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
import { Student, AttendanceRecord, AttendanceStatus, SessionType, UserRole } from '../types/attendance';

// Firebase Config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDummyKeyForFallback",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "soongshin-attendance.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "soongshin-attendance",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "soongshin-attendance.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:123456789:web:abcdef"
};

// Initialize Firebase App & Firestore
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);

// Enable Offline Persistence safely
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
 * Firestore 단일 출결 기록 저장
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
    const dateParts = dateStr.split('-');
    const year = dateParts[0];
    const month = dateParts[1];
    const monthKey = `records_${year}_${month}`;

    const recordData: Record<string, any> = { status };
    if (reason !== undefined) recordData.reason = reason;
    if (checkInTime !== undefined) recordData.checkInTime = checkInTime;

    const docRef = doc(db, 'attendance', monthKey);
    await setDoc(docRef, { [key]: recordData }, { merge: true });

    // master_state에도 백업 기록
    const masterRef = doc(db, 'attendance', 'master_state');
    await setDoc(masterRef, { records: { [key]: recordData } }, { merge: true });
    return true;
  } catch (e) {
    console.error('[Firebase] saveRecordToFirestore error:', e);
    return false;
  }
}

/**
 * Firestore 일괄 출결 기록 저장
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
    const batchData: Record<string, any> = {};

    updates.forEach(u => {
      const key = `${u.studentId}_${u.session}_${u.dateStr}`;
      const rec: Record<string, any> = { status: u.status };
      if (u.reason !== undefined) rec.reason = u.reason;
      if (u.checkInTime !== undefined) rec.checkInTime = u.checkInTime;
      batchData[key] = rec;
    });

    const sampleDate = updates[0].dateStr.split('-');
    const monthKey = `records_${sampleDate[0]}_${sampleDate[1]}`;

    const docRef = doc(db, 'attendance', monthKey);
    await setDoc(docRef, batchData, { merge: true });

    const masterRef = doc(db, 'attendance', 'master_state');
    await setDoc(masterRef, { records: batchData }, { merge: true });
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
    await setDoc(masterRef, { students }, { merge: true });
    return true;
  } catch (e) {
    console.error('[Firebase] saveStudentsToFirestore error:', e);
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
 * 실시간 출결 상태 구독 리스너
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
 * 데이터 전체 복원 (Full Restore)
 */
export async function saveFullRestoreToFirestore(
  records: Record<string, AttendanceRecord>,
  students?: Student[]
) {
  try {
    const masterRef = doc(db, 'attendance', 'master_state');
    const updateData: any = { records };
    if (students && students.length > 0) {
      updateData.students = students;
    }
    await setDoc(masterRef, updateData);

    if (students && students.length > 0) {
      const studentsRef = doc(db, 'attendance', 'students');
      await setDoc(studentsRef, { list: students });
    }
    return true;
  } catch (e) {
    console.error('[Firebase] saveFullRestoreToFirestore error:', e);
    return false;
  }
}

/**
 * 출결 비우기/초기화 (Clear State)
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
      await setDoc(masterRef, { records: {} }, { merge: true });
      return true;
    }

    await setDoc(masterRef, { records: currentRecords }, { merge: true });
    return true;
  } catch (e) {
    console.error('[Firebase] clearFirestoreAttendanceState error:', e);
    return false;
  }
}

/**
 * 출결 상태 직접 전체 저장
 */
export async function saveFirestoreMasterState(
  records: Record<string, AttendanceRecord>,
  students?: Student[]
) {
  try {
    const docRef = doc(db, 'attendance', 'master_state');
    const updateData: any = { records };
    if (students && students.length > 0) {
      updateData.students = students;
    }
    await setDoc(docRef, updateData, { merge: true });
    return true;
  } catch (e) {
    console.error('[Firebase] Save master state error:', e);
    return false;
  }
}
