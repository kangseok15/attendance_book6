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
 * 단일 출결 저장 (전체 records 보존 및 실시간 master_state 동기화)
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
    const monthKey = `records_${dateParts[0]}_${dateParts[1]}`;

    const recordData: Record<string, any> = { status };
    if (reason !== undefined) recordData.reason = reason;
    if (checkInTime !== undefined) recordData.checkInTime = checkInTime;

    // 월별 보관용 문서
    await setDoc(doc(db, 'attendance', monthKey), { [key]: recordData }, { merge: true });

    // 실시간 master_state 문서 갱신
    const masterRef = doc(db, 'attendance', 'master_state');
    const masterSnap = await getDoc(masterRef);
    const existingRecords = masterSnap.exists() ? (masterSnap.data().records || {}) : {};
    existingRecords[key] = recordData;

    await setDoc(masterRef, { records: existingRecords }, { merge: true });
    return true;
  } catch (e) {
    console.error('[Firebase] saveRecordToFirestore error:', e);
    return false;
  }
}

/**
 * 일괄 출결 저장 (전체 X 채우기, 전체 비우기 등 실시간 master_state 완벽 동기화)
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

    // 월별 보관용 문서
    await setDoc(doc(db, 'attendance', monthKey), batchData, { merge: true });

    // master_state 전체 records에 병합하여 즉시 브로드캐스팅
    const masterRef = doc(db, 'attendance', 'master_state');
    const masterSnap = await getDoc(masterRef);
    const existingRecords = masterSnap.exists() ? (masterSnap.data().records || {}) : {};
    
    Object.assign(existingRecords, batchData);

    await setDoc(masterRef, { records: existingRecords }, { merge: true });
    return true;
  } catch (e) {
    console.error('[Firebase] saveBatchToFirestore error:', e);
    return false;
  }
}

export async function saveStudentsToFirestore(students: Student[]) {
  try {
    await setDoc(doc(db, 'attendance', 'students'), { list: students });
    await setDoc(doc(db, 'attendance', 'master_state'), { students }, { merge: true });
    return true;
  } catch (e) {
    console.error('[Firebase] saveStudentsToFirestore error:', e);
    return false;
  }
}
