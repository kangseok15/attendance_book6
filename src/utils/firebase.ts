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
 * master_state 전체 records 동기화 (삭제/비우기/전체X 100% 완벽 동기화)
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

    await setDoc(masterRef, {
      students: studentsToSave,
      records: newRecords,
      updatedAt: Date.now()
    });
    return true;
  } catch (e) {
    console.error('[Firebase] syncMasterRecordsToFirestore error:', e);
    return false;
  }
}

/**
 * Firestore 전체 출결 상태 1회 가져오기 (apiSync.ts 빌드 호환용)
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
      existingRecords[key] = {
        status,
        ...(reason ? { reason } : {}),
        ...(checkInTime ? { checkInTime } : {})
      };
    }

    await syncMasterRecordsToFirestore(existingRecords, data.students);
    return true;
  } catch (e) {
    console.error('[Firebase] saveRecordToFirestore error:', e);
    return false;
  }
}

/**
 * 일괄 출결 저장 (전체 X 채우기, 전체 되돌리기 등)
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
        existingRecords[key] = {
          status: u.status,
          ...(u.reason ? { reason: u.reason } : {}),
          ...(u.checkInTime ? { checkInTime: u.checkInTime } : {})
        };
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
