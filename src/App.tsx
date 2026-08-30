/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Student, 
  SessionType, 
  DayConfig, 
  AttendanceStatus, 
  AttendanceRecord,
  UserRole,
  SchoolEvent,
  Grade3ExclusionConfig
} from './types/attendance';
import { 
  generateMonthDays 
} from './data/initialData';
import { 
  loadStudents, 
  saveStudents, 
  loadAttendanceRecords, 
  saveAttendanceRecords,
  loadUserRole,
  saveUserRole,
  loadSchoolEvents,
  saveSchoolEvents,
  loadIncludeWednesdaysInNight,
  saveIncludeWednesdaysInNight,
  loadGrade3Exclusion,
  saveGrade3Exclusion,
  getAcademicYear,
  saveSnapshot
} from './utils/storage';
import { Header, ViewTab } from './components/Header';
import { MonthlyGridView } from './components/MonthlyGridView';
import { DailyCheckinView } from './components/DailyCheckinView';
import { StudentRosterView } from './components/StudentRosterView';
import { AnalyticsView } from './components/AnalyticsView';
import { ParentNotificationModal } from './components/ParentNotificationModal';
import { GoogleSheetsExportModal } from './components/GoogleSheetsExportModal';
import { MonthConfigModal } from './components/MonthConfigModal';
import { RoleAuthModal } from './components/RoleAuthModal';
import { ClearAttendanceModal } from './components/ClearAttendanceModal';
import { DataRecoveryModal } from './components/DataRecoveryModal';
import { KioskAttendanceView } from './components/KioskAttendanceView';
import { TeacherMobileView } from './components/TeacherMobileView';
import { SchoolLogo } from './components/SchoolLogo';
import { GraduationCap, Sparkles } from 'lucide-react';
import { 
  getRecordKey, 
  isStudentExcluded, 
  isStudentExcludedOnDate, 
  sortStudents, 
  getBestActiveDate, 
  getTodayOrClosestActiveDate, 
  getAutoSessionByCurrentTime 
} from './utils/attendanceHelpers';

// Firebase Firestore 직접 연동
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './utils/firebase';

// undefined 방지 헬퍼
const sanitizeForFirestore = (record: AttendanceRecord): Record<string, any> => {
  const sanitized: Record<string, any> = {
    status: record.status
  };
  if (record.reason !== undefined && record.reason !== null) {
    sanitized.reason = record.reason;
  }
  if (record.checkInTime !== undefined && record.checkInTime !== null) {
    sanitized.checkInTime = record.checkInTime;
  }
  return sanitized;
};

export default function App() {
  const getInitialRole = (): UserRole => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlRole = params.get('role');
      if (urlRole === 'admin' || urlRole === 'teacher' || urlRole === 'teacher_mobile' || urlRole === 'student') {
        return urlRole as UserRole;
      }
      const hash = window.location.hash.replace(/^#/, '');
      if (hash === 'admin' || hash === 'teacher' || hash === 'teacher_mobile' || hash === 'student') {
        return hash as UserRole;
      }
      const hashParams = new URLSearchParams(hash);
      const hashRole = hashParams.get('role');
      if (hashRole === 'admin' || hashRole === 'teacher' || hashRole === 'teacher_mobile' || hashRole === 'student') {
        return hashRole as UserRole;
      }
    }
    return loadUserRole();
  };

  const getInitialTab = (role: UserRole): ViewTab => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam === 'kiosk' || tabParam === 'daily' || tabParam === 'students' || tabParam === 'analytics' || tabParam === 'monthly' || tabParam === 'mobile_teacher') {
        return tabParam as ViewTab;
      }
      if (params.get('kiosk') === 'true' || window.location.hash.includes('kiosk')) {
        return 'kiosk';
      }
    }
    if (role === 'student') return 'kiosk';
    if (role === 'teacher_mobile') return 'mobile_teacher';
    return 'monthly';
  };

  const [userRole, setUserRole] = useState<UserRole>(() => getInitialRole());
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [targetRoleToSwitch, setTargetRoleToSwitch] = useState<UserRole>(userRole);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.get('role') !== userRole) {
        url.searchParams.set('role', userRole);
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [userRole]);

  useEffect(() => {
    const handleUrlChange = () => {
      const params = new URLSearchParams(window.location.search);
      let urlRole = params.get('role');
      if (!urlRole) {
        const hash = window.location.hash.replace(/^#/, '');
        if (hash === 'admin' || hash === 'teacher' || hash === 'teacher_mobile' || hash === 'student') {
          urlRole = hash;
        } else {
          const hashParams = new URLSearchParams(hash);
          urlRole = hashParams.get('role');
        }
      }

      if (urlRole === 'admin' || urlRole === 'teacher' || urlRole === 'teacher_mobile' || urlRole === 'student') {
        const r = urlRole as UserRole;
        setUserRole(r);
        saveUserRole(r);
        if (r === 'student') {
          setActiveTab('kiosk');
        } else if (r === 'teacher_mobile') {
          setActiveTab('mobile_teacher');
        }
      }
    };
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, []);

  const [activeTab, setActiveTab] = useState<ViewTab>(() => getInitialTab(getInitialRole()));
  const [session, setSession] = useState<SessionType>('morning');
  const [year, setYear] = useState<number>(2026);
  const [month, setMonth] = useState<number>(8);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.get('tab') !== activeTab) {
        url.searchParams.set('tab', activeTab);
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'kiosk') {
      const autoSession = getAutoSessionByCurrentTime();
      setSession(autoSession);
      const interval = setInterval(() => {
        setSession(getAutoSessionByCurrentTime());
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  const [students, setStudents] = useState<Student[]>(() => loadStudents());
  const [records, setRecords] = useState<Record<string, AttendanceRecord>>(() => 
    loadAttendanceRecords()
  );

  const [schoolEvents, setSchoolEvents] = useState<SchoolEvent[]>(() => loadSchoolEvents());
  const [includeWednesdaysInNight, setIncludeWednesdaysInNight] = useState<boolean>(() => loadIncludeWednesdaysInNight());
  const [grade3Exclusion, setGrade3Exclusion] = useState<Grade3ExclusionConfig>(() => loadGrade3Exclusion());

  const [lastSyncedTime, setLastSyncedTime] = useState<string>(() => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}:${String(n.getSeconds()).padStart(2, '0')}`;
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);

  // 🔥 Firestore 실시간 양방향 동기화 리스너 (학생 명단 + 해당 연/월 출석 기록)
  useEffect(() => {
    // 1. 학생 명단 실시간 수신
    const unsubStudents = onSnapshot(doc(db, 'attendance', 'students'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (Array.isArray(data.list) && data.list.length > 0) {
          setStudents(data.list);
          saveStudents(data.list);
        }
      }
    });

    // 2. 출석 기록 실시간 수신
    const monthKey = `records_${year}_${String(month).padStart(2, '0')}`;
    const unsubRecords = onSnapshot(doc(db, 'attendance', monthKey), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Record<string, AttendanceRecord>;
        setRecords(prev => {
          const merged = { ...prev, ...data };
          saveAttendanceRecords(merged);
          return merged;
        });
      }
      const now = new Date();
      setLastSyncedTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`);
    });

    return () => {
      unsubStudents();
      unsubRecords();
    };
  }, [year, month]);

  const handleRoleChange = (newRole: UserRole) => {
    setUserRole(newRole);
    saveUserRole(newRole);

    if (newRole === 'student') {
      setSession(getAutoSessionByCurrentTime());
      setActiveTab('kiosk');
    } else if (newRole === 'teacher_mobile') {
      setActiveTab('mobile_teacher');
      if (activeDays.length > 0) {
        setSelectedDateStr(getTodayOrClosestActiveDate(activeDays));
      }
    } else if (newRole === 'teacher') {
      if (activeTab === 'daily' || activeTab === 'students' || activeTab === 'kiosk' || activeTab === 'mobile_teacher') {
        setActiveTab('monthly');
      }
    } else if (newRole === 'admin') {
      if (activeTab === 'kiosk' || activeTab === 'mobile_teacher') {
        setActiveTab('monthly');
      }
    }
  };

  const handleOpenRoleModal = () => {
    setTargetRoleToSwitch(userRole);
    setIsRoleModalOpen(true);
  };

  const handleUpdateStudents = async (newStudents: Student[]) => {
    const sorted = sortStudents(newStudents, [3, 2, 1], true);
    setStudents(sorted);
    saveStudents(sorted);
    try {
      await setDoc(doc(db, 'attendance', 'students'), { list: sorted });
    } catch (e) {
      console.error('Firestore 학생 업데이트 실패:', e);
    }
  };

  const handleUpdateGrade3Exclusion = (newConfig: Grade3ExclusionConfig) => {
    setGrade3Exclusion(newConfig);
    saveGrade3Exclusion(newConfig);
  };

  const [daysConfig, setDaysConfig] = useState<{
    morning: DayConfig[];
    night: DayConfig[];
  }>(() => {
    const initEvents = loadSchoolEvents();
    const initWed = loadIncludeWednesdaysInNight();
    return {
      morning: generateMonthDays(2026, 8, 'morning', [19, 20, 21, 24, 25, 26, 27, 28, 31], initEvents, initWed),
      night: generateMonthDays(2026, 8, 'night', [20, 21, 24, 25, 27, 28, 31], initEvents, initWed),
    };
  });

  const allDaysInMonth = daysConfig[session] || [];
  const activeDays = useMemo(() => {
    return allDaysInMonth.filter(d => d.enabled);
  }, [allDaysInMonth]);

  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => {
    const initMorningActive = generateMonthDays(2026, 8, 'morning', [19, 20, 21, 24, 25, 26, 27, 28, 31]).filter(d => d.enabled);
    return getTodayOrClosestActiveDate(initMorningActive, 2026, 8);
  });

  useEffect(() => {
    if (activeDays.length > 0) {
      const isCurrentActive = activeDays.some(d => d.dateStr === selectedDateStr);
      if (!isCurrentActive) {
        setSelectedDateStr(getTodayOrClosestActiveDate(activeDays, year, month));
      }
    }
  }, [session, activeDays, year, month, selectedDateStr]);

  const handleTabChange = (tab: ViewTab) => {
    setActiveTab(tab);
    if ((tab === 'daily' || tab === 'mobile_teacher') && activeDays.length > 0) {
      setSelectedDateStr(getTodayOrClosestActiveDate(activeDays, year, month));
    }
  };

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isMonthConfigModalOpen, setIsMonthConfigModalOpen] = useState(false);
  const [isClearAttendanceModalOpen, setIsClearAttendanceModalOpen] = useState(false);
  const [isDataRecoveryModalOpen, setIsDataRecoveryModalOpen] = useState(false);
  const [parentModalData, setParentModalData] = useState<{
    isOpen: boolean;
    dateStr: string;
    list: { student: Student; status: AttendanceStatus; reason?: string }[];
  }>({
    isOpen: false,
    dateStr: '2026-08-19',
    list: [],
  });

  const handleSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setStudents(loadStudents());
      setRecords(loadAttendanceRecords());
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      setLastSyncedTime(timeStr);
      setIsSyncing(false);
      setSyncToast(`클라우드 최신 출결 데이터로 동기화 완료 (${timeStr})`);
      setTimeout(() => setSyncToast(null), 3000);
    }, 300);
  };

  const handleSetYearMonth = (newYear: number, newMonth: number) => {
    setYear(newYear);
    setMonth(newMonth);

    const newMorningDays = (newMonth === 8 && newYear === 2026)
      ? generateMonthDays(newYear, newMonth, 'morning', [19, 20, 21, 24, 25, 26, 27, 28, 31], schoolEvents, includeWednesdaysInNight)
      : generateMonthDays(newYear, newMonth, 'morning', undefined, schoolEvents, includeWednesdaysInNight);

    const newNightDays = (newMonth === 8 && newYear === 2026)
      ? generateMonthDays(newYear, newMonth, 'night', [20, 21, 24, 25, 27, 28, 31], schoolEvents, includeWednesdaysInNight)
      : generateMonthDays(newYear, newMonth, 'night', undefined, schoolEvents, includeWednesdaysInNight);

    setDaysConfig({
      morning: newMorningDays,
      night: newNightDays,
    });

    const activeForCurrent = (session === 'morning' ? newMorningDays : newNightDays).filter(d => d.enabled);
    if (activeForCurrent.length > 0) {
      setSelectedDateStr(getTodayOrClosestActiveDate(activeForCurrent, newYear, newMonth));
    }
  };

  const handleAddSchoolEvent = (eventData: Omit<SchoolEvent, 'id'>) => {
    const newEvent: SchoolEvent = {
      ...eventData,
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    };
    const updated = [...schoolEvents, newEvent];
    setSchoolEvents(updated);
    saveSchoolEvents(updated);

    const newMorningDays = generateMonthDays(year, month, 'morning', undefined, updated, includeWednesdaysInNight);
    const newNightDays = generateMonthDays(year, month, 'night', undefined, updated, includeWednesdaysInNight);
    setDaysConfig({
      morning: newMorningDays,
      night: newNightDays,
    });
  };

  const handleDeleteSchoolEvent = (id: string) => {
    const updated = schoolEvents.filter(e => e.id !== id);
    setSchoolEvents(updated);
    saveSchoolEvents(updated);

    const newMorningDays = generateMonthDays(year, month, 'morning', undefined, updated, includeWednesdaysInNight);
    const newNightDays = generateMonthDays(year, month, 'night', undefined, updated, includeWednesdaysInNight);
    setDaysConfig({
      morning: newMorningDays,
      night: newNightDays,
    });
  };

  const handleToggleWednesdayNight = (include: boolean) => {
    setIncludeWednesdaysInNight(include);
    saveIncludeWednesdaysInNight(include);

    const newMorningDays = generateMonthDays(year, month, 'morning', undefined, schoolEvents, include);
    const newNightDays = generateMonthDays(year, month, 'night', undefined, schoolEvents, include);
    setDaysConfig({
      morning: newMorningDays,
      night: newNightDays,
    });
  };

  const handleResetPastYearEvents = () => {
    const currentAcademicYear = getAcademicYear(year, month);
    const updated = schoolEvents.filter(e => {
      const parts = e.dateStr.split('-');
      const eY = parseInt(parts[0], 10);
      const eM = parseInt(parts[1], 10);
      const eventAcademicYear = eM >= 3 ? eY : eY - 1;
      return eventAcademicYear >= currentAcademicYear;
    });

    setSchoolEvents(updated);
    saveSchoolEvents(updated);

    const newMorningDays = generateMonthDays(year, month, 'morning', undefined, updated, includeWednesdaysInNight);
    const newNightDays = generateMonthDays(year, month, 'night', undefined, updated, includeWednesdaysInNight);
    setDaysConfig({
      morning: newMorningDays,
      night: newNightDays,
    });

    setSyncToast('📅 이전 학년도 학교 행사가 정리되었습니다. (출결 기록은 100% 보존됩니다.)');
    setTimeout(() => setSyncToast(null), 3500);
  };

  const handleResetAllEvents = () => {
    const updated: SchoolEvent[] = [];
    setSchoolEvents(updated);
    saveSchoolEvents(updated);

    const newMorningDays = generateMonthDays(year, month, 'morning', undefined, updated, includeWednesdaysInNight);
    const newNightDays = generateMonthDays(year, month, 'night', undefined, updated, includeWednesdaysInNight);
    setDaysConfig({
      morning: newMorningDays,
      night: newNightDays,
    });

    setSyncToast('📅 학교 행사 목록이 초기화되었습니다.');
    setTimeout(() => setSyncToast(null), 3500);
  };

  // 🔥 단일 출결 수정 (핸드폰/PC 즉시 Firestore 클라우드 실시간 전송)
  const handleUpdateRecord = async (
    studentId: string,
    dateStr: string,
    status: AttendanceStatus,
    reason?: string,
    checkInTime?: string
  ) => {
    const key = getRecordKey(studentId, session, dateStr);
    const now = new Date();
    const currentTimestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    let finalCheckInTime: string | undefined = undefined;
    if (status !== 'NONE') {
      finalCheckInTime = checkInTime !== undefined 
        ? checkInTime 
        : (records[key]?.checkInTime || currentTimestamp);
    }

    let finalReason: string | undefined = undefined;
    if (typeof reason === 'string' && reason.trim() !== '') {
      finalReason = reason.trim();
    }

    const updatedRecord: AttendanceRecord = {
      status,
      reason: finalReason,
      checkInTime: finalCheckInTime,
    };

    setRecords(prev => {
      const updated = {
        ...prev,
        [key]: updatedRecord,
      };
      saveAttendanceRecords(updated);
      return updated;
    });

    // Firestore에 직접 저장
    const monthKey = `records_${year}_${String(month).padStart(2, '0')}`;
    try {
      const firestoreSafeData = sanitizeForFirestore(updatedRecord);
      await setDoc(doc(db, 'attendance', monthKey), { [key]: firestoreSafeData }, { merge: true });
    } catch (e) {
      console.error('Firestore 출석 기록 저장 실패:', e);
    }
  };

  // 🔥 일괄 출결 처리 (Firestore 실시간 전송)
  const handleBatchUpdateDay = async (
    dateStr: string,
    status: AttendanceStatus,
    gradeFilter?: number
  ) => {
    const now = new Date();
    const currentTimestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const changedBatch: Record<string, any> = {};

    setRecords(prev => {
      const updated = { ...prev };
      students
        .filter(st => st.active && !isStudentExcluded(st, session, dateStr) && (gradeFilter === undefined || st.grade === gradeFilter))
        .forEach(st => {
          const key = getRecordKey(st.id, session, dateStr);
          const recCheckIn = status !== 'NONE' ? (prev[key]?.checkInTime || currentTimestamp) : undefined;
          const recVal: AttendanceRecord = {
            status,
            reason: undefined,
            checkInTime: recCheckIn,
          };
          updated[key] = recVal;
          changedBatch[key] = sanitizeForFirestore(recVal);
        });
      saveAttendanceRecords(updated);
      return updated;
    });

    const monthKey = `records_${year}_${String(month).padStart(2, '0')}`;
    try {
      await setDoc(doc(db, 'attendance', monthKey), changedBatch, { merge: true });
    } catch (e) {
      console.error('Firestore 일괄 기록 실패:', e);
    }
  };

  const [lastFilledDayKeys, setLastFilledDayKeys] = useState<Record<string, string[]>>({});

  // 🔥 미체크 결석 채우기 (Firestore 실시간 전송)
  const handleFillDayAbsent = async (dateStr: string, gradeFilter?: number) => {
    const now = new Date();
    const currentTimestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const trackingKey = `${session}_${dateStr}_${gradeFilter ?? 'all'}`;
    const changedBatch: Record<string, any> = {};

    setRecords(prev => {
      const updated = { ...prev };
      const applicableStudents = students.filter(
        st => st.active && !isStudentExcluded(st, session, dateStr) && (gradeFilter === undefined || st.grade === gradeFilter)
      );

      const emptyKeys: string[] = [];
      applicableStudents.forEach(st => {
        const key = getRecordKey(st.id, session, dateStr);
        const status = prev[key]?.status;
        if (!status || status === 'NONE') {
          emptyKeys.push(key);
        }
      });

      if (emptyKeys.length > 0) {
        emptyKeys.forEach(key => {
          const recVal: AttendanceRecord = {
            status: 'ABSENT',
            reason: undefined,
            checkInTime: currentTimestamp,
          };
          updated[key] = recVal;
          changedBatch[key] = sanitizeForFirestore(recVal);
        });
        setLastFilledDayKeys(map => ({
          ...map,
          [trackingKey]: emptyKeys,
        }));
      } else {
        const previousKeys = lastFilledDayKeys[trackingKey];
        if (previousKeys && previousKeys.length > 0) {
          previousKeys.forEach(key => {
            if (updated[key]?.status === 'ABSENT') {
              const recVal: AttendanceRecord = {
                status: 'NONE',
                reason: undefined,
                checkInTime: undefined,
              };
              updated[key] = recVal;
              changedBatch[key] = sanitizeForFirestore(recVal);
            }
          });
          setLastFilledDayKeys(map => {
            const next = { ...map };
            delete next[trackingKey];
            return next;
          });
        } else {
          applicableStudents.forEach(st => {
            const key = getRecordKey(st.id, session, dateStr);
            if (updated[key]?.status === 'ABSENT') {
              const recVal: AttendanceRecord = {
                status: 'NONE',
                reason: undefined,
                checkInTime: undefined,
              };
              updated[key] = recVal;
              changedBatch[key] = sanitizeForFirestore(recVal);
            }
          });
        }
      }

      saveAttendanceRecords(updated);
      return updated;
    });

    const monthKey = `records_${year}_${String(month).padStart(2, '0')}`;
    try {
      await setDoc(doc(db, 'attendance', monthKey), changedBatch, { merge: true });
    } catch (e) {
      console.error('Firestore 미체크 결석 채우기 실패:', e);
    }
  };

  const handleToggleDay = (dateStr: string) => {
    setDaysConfig(prev => ({
      ...prev,
      [session]: prev[session].map(d => (d.dateStr === dateStr ? { ...d, enabled: !d.enabled } : d)),
    }));
  };

  const handleSetPreset = (preset: 'standard' | 'weekdays' | 'sample8' | 'all' | 'none') => {
    if (preset === 'standard') {
      const stdDays = (month === 8 && year === 2026)
        ? (session === 'morning'
            ? generateMonthDays(year, month, 'morning', [19, 20, 21, 24, 25, 26, 27, 28, 31], schoolEvents, includeWednesdaysInNight)
            : generateMonthDays(year, month, 'night', [20, 21, 24, 25, 27, 28, 31], schoolEvents, includeWednesdaysInNight))
        : generateMonthDays(year, month, session, undefined, schoolEvents, includeWednesdaysInNight);

      setDaysConfig(prev => ({
        ...prev,
        [session]: stdDays,
      }));
      return;
    }

    setDaysConfig(prev => ({
      ...prev,
      [session]: prev[session].map(d => {
        let isEn = false;
        if (preset === 'weekdays') {
          if (session === 'night' && !includeWednesdaysInNight) {
            isEn = d.dayOfWeek !== '토' && d.dayOfWeek !== '일' && d.dayOfWeek !== '수';
          } else {
            isEn = d.dayOfWeek !== '토' && d.dayOfWeek !== '일';
          }
        } else if (preset === 'sample8') {
          if (session === 'night') {
            isEn = [20, 21, 24, 25, 27, 28, 31].includes(d.dayNum);
          } else {
            isEn = [19, 20, 21, 24, 25, 26, 27, 28, 31].includes(d.dayNum);
          }
        } else if (preset === 'all') {
          isEn = true;
        } else if (preset === 'none') {
          isEn = false;
        }
        return { ...d, enabled: isEn };
      }),
    }));
  };

  const handleClearDate = (dateStr: string, gradeFilter?: number) => {
    saveSnapshot(`[${dateStr}] 출결 비우기 전 자동 백업`, records, students);
    setRecords(prev => {
      const updated = { ...prev };
      students
        .filter(st => gradeFilter === undefined || st.grade === gradeFilter)
        .forEach(st => {
          const key = getRecordKey(st.id, session, dateStr);
          delete updated[key];
        });
      saveAttendanceRecords(updated);
      return updated;
    });
  };

  const handleClearMonthSession = (targetYear: number, targetMonth: number, targetSession: SessionType) => {
    const sessionName = targetSession === 'morning' ? '아침' : '야간';
    saveSnapshot(`[${targetYear}년 ${targetMonth}월 ${sessionName}] 출결 비우기 전 자동 백업`, records, students);
    const monthPrefix = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
    setRecords(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(key => {
        const parts = key.split('_');
        if (parts.length >= 3) {
          const keySession = parts[1];
          const keyDate = parts[2];
          if (keySession === targetSession && keyDate.startsWith(monthPrefix)) {
            delete updated[key];
          }
        }
      });
      saveAttendanceRecords(updated);
      return updated;
    });
  };

  const handleClearAll = () => {
    saveSnapshot('전체 출결 비우기 전 자동 백업', records, students);
    setRecords({});
    saveAttendanceRecords({});
  };

  const handleRestoreData = async (restoredStudents?: Student[], restoredRecords?: Record<string, AttendanceRecord>) => {
    const finalStudents = restoredStudents && Array.isArray(restoredStudents) && restoredStudents.length > 0
      ? restoredStudents
      : students;

    const finalRecords = restoredRecords && typeof restoredRecords === 'object'
      ? restoredRecords
      : records;

    setStudents(finalStudents);
    setRecords(finalRecords);
    saveStudents(finalStudents);
    saveAttendanceRecords(finalRecords);

    const monthKey = `records_${year}_${String(month).padStart(2, '0')}`;
    try {
      await setDoc(doc(db, 'attendance', 'students'), { list: finalStudents });
      await setDoc(doc(db, 'attendance', monthKey), finalRecords);
    } catch (e) {
      console.error('Firestore 복원 실패:', e);
    }

    const n = new Date();
    setLastSyncedTime(`${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}:${String(n.getSeconds()).padStart(2, '0')}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        session={session}
        setSession={setSession}
        year={year}
        month={month}
        setYearMonth={handleSetYearMonth}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onOpenMonthConfigModal={() => setIsMonthConfigModalOpen(true)}
        onClearAttendance={() => setIsClearAttendanceModalOpen(true)}
        onOpenDataRecoveryModal={() => setIsDataRecoveryModalOpen(true)}
        studentCount={students.length}
        userRole={userRole}
        onOpenRoleModal={handleOpenRoleModal}
        onDirectSelectRole={handleRoleChange}
        lastSyncedTime={lastSyncedTime}
        isSyncing={isSyncing}
        onSync={handleSync}
      />

      {syncToast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-slate-900/95 dark:bg-slate-100/95 text-white dark:text-slate-900 text-xs sm:text-sm font-bold shadow-xl border border-slate-700 dark:border-slate-300 flex items-center gap-2 animate-bounce">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{syncToast}</span>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'monthly' && (
          <MonthlyGridView
            students={students}
            session={session}
            year={year}
            month={month}
            activeDays={activeDays}
            records={records}
            onUpdateRecord={handleUpdateRecord}
            onBatchUpdateDay={handleBatchUpdateDay}
            onFillDayAbsent={handleFillDayAbsent}
            onUpdateStudents={handleUpdateStudents}
            onSessionChange={setSession}
            onMonthChange={(newMonth) => handleSetYearMonth(year, newMonth)}
            userRole={userRole}
            grade3Exclusion={grade3Exclusion}
          />
        )}

        {activeTab === 'daily' && (
          <DailyCheckinView
            students={students}
            session={session}
            setSession={setSession}
            activeDays={activeDays}
            selectedDateStr={selectedDateStr}
            setSelectedDateStr={setSelectedDateStr}
            records={records}
            onUpdateRecord={handleUpdateRecord}
            onBatchUpdateDay={handleBatchUpdateDay}
            onFillDayAbsent={handleFillDayAbsent}
            onOpenParentModal={list => {
              setParentModalData({
                isOpen: true,
                dateStr: selectedDateStr,
                list,
              });
            }}
            userRole={userRole}
          />
        )}

        {activeTab === 'students' && (
          <StudentRosterView
            students={students}
            onUpdateStudents={handleUpdateStudents}
            userRole={userRole}
            currentMonth={month}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsView
            students={students}
            session={session}
            year={year}
            month={month}
            activeDays={activeDays}
            allDaysConfig={daysConfig}
            records={records}
            userRole={userRole}
          />
        )}

        {activeTab === 'mobile_teacher' && (
          <TeacherMobileView
            students={students}
            session={session}
            setSession={setSession}
            activeDays={activeDays}
            selectedDateStr={selectedDateStr}
            setSelectedDateStr={setSelectedDateStr}
            records={records}
            userRole={userRole}
            onOpenMonthlyView={() => setActiveTab('monthly')}
            onOpenAnalyticsView={() => setActiveTab('analytics')}
          />
        )}

        {activeTab === 'kiosk' && (
          <KioskAttendanceView
            students={students}
            session={session}
            setSession={setSession}
            activeDays={activeDays}
            selectedDateStr={selectedDateStr}
            setSelectedDateStr={setSelectedDateStr}
            records={records}
            onUpdateRecord={handleUpdateRecord}
            userRole={userRole}
            onExitKiosk={() => setActiveTab('monthly')}
          />
        )}
      </main>

      {/* Footer */}
      {activeTab !== 'kiosk' && (
        <footer className="mt-auto border-t border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md py-6 transition-colors">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
              <div className="flex items-center gap-3">
                <SchoolLogo size="sm" className="rounded-lg shadow-2xs shrink-0" />
                <div>
                  <div className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200 tracking-tight flex items-center gap-1.5 justify-center sm:justify-start">
                    <span>숭신고등학교 미래인재반</span>
                    <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                      자율학습 출결 관리 시스템
                    </span>
                  </div>
                  <p className="text-3xs sm:text-2xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                    Sungshin High School Future Talent Division
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:items-end items-center gap-1.5">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 dark:from-indigo-950/60 dark:via-purple-950/60 dark:to-pink-950/60 border border-indigo-200/90 dark:border-indigo-800/80 shadow-2xs">
                  <span className="text-2xs font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-indigo-500 animate-pulse" />
                    제작자
                  </span>
                  <span className="h-3 w-px bg-indigo-200 dark:bg-indigo-800" />
                  <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1 tracking-tight">
                    <GraduationCap className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>숭신고 진로진학상담교사 김강석</span>
                  </span>
                </div>
                <div className="text-3xs text-slate-400 dark:text-slate-500 font-mono">
                  © 2026 숭신고등학교. All rights reserved.
                </div>
              </div>
            </div>
          </div>
        </footer>
      )}

      {/* Modals */}
      <RoleAuthModal
        isOpen={isRoleModalOpen}
        onClose={() => setIsRoleModalOpen(false)}
        targetRole={targetRoleToSwitch}
        currentRole={userRole}
        onConfirmRole={handleRoleChange}
      />

      <GoogleSheetsExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        session={session}
        year={year}
        month={month}
        activeDays={activeDays}
        students={students}
        records={records}
      />

      <MonthConfigModal
        isOpen={isMonthConfigModalOpen}
        onClose={() => setIsMonthConfigModalOpen(false)}
        session={session}
        year={year}
        month={month}
        allDaysInMonth={allDaysInMonth}
        onToggleDay={handleToggleDay}
        onSetPreset={handleSetPreset}
        onSelectMonth={(newMonth) => handleSetYearMonth(year, newMonth)}
        onSelectSession={setSession}
        schoolEvents={schoolEvents}
        onAddSchoolEvent={handleAddSchoolEvent}
        onDeleteSchoolEvent={handleDeleteSchoolEvent}
        includeWednesdaysInNight={includeWednesdaysInNight}
        onToggleWednesdayNight={handleToggleWednesdayNight}
        onResetPastYearEvents={handleResetPastYearEvents}
        onResetAllEvents={handleResetAllEvents}
        grade3Exclusion={grade3Exclusion}
        onUpdateGrade3Exclusion={handleUpdateGrade3Exclusion}
      />

      <ParentNotificationModal
        isOpen={parentModalData.isOpen}
        onClose={() => setParentModalData(prev => ({ ...prev, isOpen: false }))}
        session={session}
        dateStr={parentModalData.dateStr}
        absentList={parentModalData.list}
      />

      <ClearAttendanceModal
        isOpen={isClearAttendanceModalOpen}
        onClose={() => setIsClearAttendanceModalOpen(false)}
        year={year}
        month={month}
        session={session}
        activeDays={activeDays}
        currentSelectedDateStr={selectedDateStr}
        onClearDate={handleClearDate}
        onClearMonthSession={handleClearMonthSession}
        onClearAll={handleClearAll}
      />

      <DataRecoveryModal
        isOpen={isDataRecoveryModalOpen}
        onClose={() => setIsDataRecoveryModalOpen(false)}
        students={students}
        records={records}
        onRestoreData={handleRestoreData}
        userRole={userRole}
        onSyncServer={handleSync}
      />

    </div>
  );
}
