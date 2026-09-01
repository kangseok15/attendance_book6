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
  sortStudents, 
  getTodayOrClosestActiveDate, 
  getAutoSessionByCurrentTime 
} from './utils/attendanceHelpers';

import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { db, saveRecordToFirestore, saveBatchToFirestore, saveStudentsToFirestore } from './utils/firebase';

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

  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [month, setMonth] = useState<number>(() => new Date().getMonth() + 1);

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

  useEffect(() => {
    const initMasterStateIfEmpty = async () => {
      try {
        const masterRef = doc(db, 'attendance', 'master_state');
        const docSnap = await getDoc(masterRef);
        if (!docSnap.exists() || !docSnap.data()?.students) {
          const currentStudents = loadStudents();
          const currentRecords = loadAttendanceRecords();
          await setDoc(masterRef, {
            students: currentStudents,
            records: currentRecords
          }, { merge: true });

          await setDoc(doc(db, 'attendance', 'students'), { list: currentStudents });
        }
      } catch (e) {
        console.warn('Firestore master init check:', e);
      }
    };
    initMasterStateIfEmpty();
  }, []);

  // Firestore 실시간 리스너
  useEffect(() => {
    const unsubMaster = onSnapshot(doc(db, 'attendance', 'master_state'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (Array.isArray(data.students) && data.students.length > 0) {
          setStudents(data.students);
          saveStudents(data.students);
        }
        if (data.records && typeof data.records === 'object') {
          setRecords(data.records);
          saveAttendanceRecords(data.records);
        }
        const now = new Date();
        setLastSyncedTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`);
      }
    });

    return () => {
      unsubMaster();
    };
  }, []);

  const handleRoleChange = (newRole: UserRole) => {
    setUserRole(newRole);
    saveUserRole(newRole);

    if (newRole === 'student') {
      setSession(getAutoSessionByCurrentTime());
      setActiveTab('kiosk');
    } else if (newRole === 'teacher_mobile') {
      setActiveTab('mobile_teacher');
      if (activeDays.length > 0) {
        setSelectedDateStr(getTodayOrClosestActiveDate(activeDays, year, month));
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
    await saveStudentsToFirestore(sorted);
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
    const initYear = new Date().getFullYear();
    const initMonth = new Date().getMonth() + 1;

    const morningDefault = (initMonth === 8 && initYear === 2026) ? [19, 20, 21, 24, 25, 26, 27, 28, 31] : undefined;
    const nightDefault = (initMonth === 8 && initYear === 2026) ? [20, 21, 24, 25, 27, 28, 31] : undefined;

    return {
      morning: generateMonthDays(initYear, initMonth, 'morning', morningDefault, initEvents, initWed),
      night: generateMonthDays(initYear, initMonth, 'night', nightDefault, initEvents, initWed),
    };
  });

  const allDaysInMonth = daysConfig[session] || [];
  const activeDays = useMemo(() => {
    return allDaysInMonth.filter(d => d.enabled);
  }, [allDaysInMonth]);

  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => {
    const initYear = new Date().getFullYear();
    const initMonth = new Date().getMonth() + 1;
    const initMorningActive = generateMonthDays(initYear, initMonth, 'morning').filter(d => d.enabled);
    return getTodayOrClosestActiveDate(initMorningActive, initYear, initMonth);
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
    dateStr: '',
    list: [],
  });

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const masterRef = doc(db, 'attendance', 'master_state');
      const docSnap = await getDoc(masterRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.students) {
          setStudents(data.students);
          saveStudents(data.students);
        }
        if (data.records) {
          setRecords(data.records);
          saveAttendanceRecords(data.records);
        }
      }
    } catch (e) {
      console.warn('Sync failed:', e);
    } finally {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      setLastSyncedTime(timeStr);
      setIsSyncing(false);
      setSyncToast(`클라우드 최신 출결 데이터로 동기화 완료 (${timeStr})`);
      setTimeout(() => setSyncToast(null), 3000);
    }
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

  // 단일 출결 수정
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

    await saveRecordToFirestore(studentId, session, dateStr, status, finalReason, finalCheckInTime);
  };

  // 일괄 출결 처리
  const handleBatchUpdateDay = async (
    dateStr: string,
    status: AttendanceStatus,
    gradeFilter?: number
  ) => {
    const now = new Date();
    const currentTimestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const updates: Array<{
      studentId: string;
      session: SessionType;
      dateStr: string;
      status: AttendanceStatus;
      reason?: string;
      checkInTime?: string;
    }> = [];

    const newRecords = { ...records };
    students
      .filter(st => st.active && !isStudentExcluded(st, session, dateStr) && (gradeFilter === undefined || st.grade === Number(gradeFilter)))
      .forEach(st => {
        const key = getRecordKey(st.id, session, dateStr);
        const recCheckIn = status !== 'NONE' ? (records[key]?.checkInTime || currentTimestamp) : undefined;
        newRecords[key] = {
          status,
          reason: undefined,
          checkInTime: recCheckIn,
        };
        updates.push({
          studentId: st.id,
          session,
          dateStr,
          status,
          reason: undefined,
          checkInTime: recCheckIn,
        });
      });

    setRecords(newRecords);
    saveAttendanceRecords(newRecords);

    if (updates.length > 0) {
      await saveBatchToFirestore(updates);
    }
  };

  const [lastFilledDayKeys, setLastFilledDayKeys] = useState<Record<string, string[]>>({});

  // 🔥 전체 X (미체크 결석 채우기 / 되돌리기) 완벽 처리
  const handleFillDayAbsent = async (dateStr: string, gradeFilter?: number) => {
    const now = new Date();
    const currentTimestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const trackingKey = `${session}_${dateStr}_${gradeFilter ?? 'all'}`;
    const updates: Array<{
      studentId: string;
      session: SessionType;
      dateStr: string;
      status: AttendanceStatus;
      reason?: string;
      checkInTime?: string;
    }> = [];

    const updated = { ...records };
    const targetGrade = gradeFilter !== undefined ? Number(gradeFilter) : undefined;
    const applicableStudents = students.filter(
      st => st.active && !isStudentExcluded(st, session, dateStr) && (targetGrade === undefined || st.grade === targetGrade)
    );

    const emptyKeys: string[] = [];
    applicableStudents.forEach(st => {
      const key = getRecordKey(st.id, session, dateStr);
      const status = updated[key]?.status;
      if (!status || status === 'NONE') {
        emptyKeys.push(key);
      }
    });

    if (emptyKeys.length > 0) {
      // 미체크 학생을 결석(ABSENT)으로 설정
      emptyKeys.forEach(key => {
        updated[key] = {
          status: 'ABSENT',
          reason: undefined,
          checkInTime: currentTimestamp,
        };
        const stId = key.split('_')[0];
        updates.push({
          studentId: stId,
          session,
          dateStr,
          status: 'ABSENT',
          reason: undefined,
          checkInTime: currentTimestamp,
        });
      });
      setLastFilledDayKeys(map => ({
        ...map,
        [trackingKey]: emptyKeys,
      }));
    } else {
      // 이미 결석 처리된 학생들을 빈칸(NONE)으로 원복
      const previousKeys = lastFilledDayKeys[trackingKey];
      if (previousKeys && previousKeys.length > 0) {
        previousKeys.forEach(key => {
          if (updated[key]?.status === 'ABSENT') {
            updated[key] = {
              status: 'NONE',
              reason: undefined,
              checkInTime: undefined,
            };
            const stId = key.split('_')[0];
            updates.push({
              studentId: stId,
              session,
              dateStr,
              status: 'NONE',
              reason: undefined,
              checkInTime: undefined,
            });
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
            updated[key] = {
              status: 'NONE',
              reason: undefined,
              checkInTime: undefined,
            };
            updates.push({
              studentId: st.id,
              session,
              dateStr,
              status: 'NONE',
              reason: undefined,
              checkInTime: undefined,
            });
          }
        });
      }
    }

    setRecords(updated);
    saveAttendanceRecords(updated);

    if (updates.length > 0) {
      await saveBatchToFirestore(updates);
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

  const handleClearDate = async (dateStr: string, gradeFilter?: number) => {
    saveSnapshot(`[${dateStr}] 출결 비우기 전 자동 백업`, records, students);
    const updated = { ...records };
    students
      .filter(st => gradeFilter === undefined || st.grade === gradeFilter)
      .forEach(st => {
        const key = getRecordKey(st.id, session, dateStr);
        delete updated[key];
      });
    setRecords(updated);
    saveAttendanceRecords(updated);
    await setDoc(doc(db, 'attendance', 'master_state'), { records: updated }, { merge: true });
  };

  const handleClearMonthSession = async (targetYear: number, targetMonth: number, targetSession: SessionType) => {
    const sessionName = targetSession === 'morning' ? '아침' : '야간';
    saveSnapshot(`[${targetYear}년 ${targetMonth}월 ${sessionName}] 출결 비우기 전 자동 백업`, records, students);
    const monthPrefix = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
    const updated = { ...records };
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
    setRecords(updated);
    saveAttendanceRecords(updated);
    await setDoc(doc(db, 'attendance', 'master_state'), { records: updated }, { merge: true });
  };

  const handleClearAll = async () => {
    saveSnapshot('전체 출결 비우기 전 자동 백업', records, students);
    setRecords({});
    saveAttendanceRecords({});
    await setDoc(doc(db, 'attendance', 'master_state'), { records: {} }, { merge: true });
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

    try {
      await setDoc(doc(db, 'attendance', 'master_state'), {
        students: finalStudents,
        records: finalRecords
      });
      await setDoc(doc(db, 'attendance', 'students'), { list: finalStudents });
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
