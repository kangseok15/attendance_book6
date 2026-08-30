/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot, 
  enableIndexedDbPersistence 
} from 'firebase/firestore';
import { Student, AttendanceRecord } from '../types/attendance';

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
        // Multiple tabs open, persistence can only be enabled in one tab at a time.
        console.warn('[Firebase] Multiple tabs open, offline persistence disabled for secondary tab.');
      } else if (err.code === 'unimplemented') {
        // The current browser does not support all of the features required to enable persistence
        console.warn('[Firebase] Current browser does not support offline persistence.');
      }
    });
  } catch (e) {
    // Ignore persistence errors
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
 * 출결 상태 직접 저장 헬퍼
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
