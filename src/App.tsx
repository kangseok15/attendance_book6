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
  getAcademicYear
} from './utils/storage';
import {
  fetchServerAttendanceState,
  sendRecordUpdateToServer,
  sendBatchUpdateToServer,
  sendClearAttendanceToServer,
  sendStudentsUpdateToServer,
  sendFullRestoreToServer
} from './utils/apiSync';
import { subscribeToFirestoreAttendanceState } from './utils/firebase';
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
import { getRecordKey, isStudentExcluded, isStudentExcludedOnDate, sortStudents, getBestActiveDate, getTodayOrClosestActiveDate, getAutoSessionByCurrentTime } from './utils/attendanceHelpers';
import { saveSnapshot } from './utils/storage';

export default function App() {
  // Helper to get initial role from URL param, hash or storage
  const getInitialRole = (): UserRole => {
    if (typeof window !== 'undefined') {
      // 1. Search Query Params (?role=teacher)
      const params = new URLSearchParams(window.location.search);
      const urlRole = params.get('role');
      if (urlRole === 'admin' || urlRole === 'teacher' || urlRole === 'teacher_mobile' || urlRole === 'student') {
        return urlRole as UserRole;
      }

      // 2. Hash params (#role=teacher or #teacher)
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

  // Helper to get initial tab from URL if present (defaults to kiosk for student, mobile_teacher for teacher_mobile)
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
    if (role === 'student') {
      return 'kiosk';
    }
    if (role === 'teacher_mobile') {
      return 'mobile_teacher';
    }
    return 'monthly';
  };

  // User Role State: 'admin' | 'teacher' | 'teacher_mobile' | 'student'
  const [userRole, setUserRole] = useState<UserRole>(() => getInitialRole());
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [targetRoleToSwitch, setTargetRoleToSwitch] = useState<UserRole>(userRole);

  // Sync URL when userRole changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.get('role') !== userRole) {
        url.searchParams.set('role', userRole);
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [userRole]);

  // Listen for browser popstate, hashchange, or direct URL param changes
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

  // Navigation & Core State (defaults to 'kiosk' for student)
  const [activeTab, setActiveTab] = useState<ViewTab>(() => getInitialTab(getInitialRole()));
  const [session, setSession] = useState<SessionType>('morning');
  const [year, setYear] = useState<number>(2026);
  const [month, setMonth] = useState<number>(8);

  // Sync tab in URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.get('tab') !== activeTab) {
        url.searchParams.set('tab', activeTab);
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [activeTab]);

  // Auto-sync session for Kiosk mode: morning (00:00~12:00) vs night (12:01~23:59)
  useEffect(() => {
    if (activeTab === 'kiosk') {
      const autoSession = getAutoSessionByCurrentTime();
      setSession(autoSession);

      // Periodically re-check every 30 seconds to switch when crossing 12:00 noon while in Kiosk
      const interval = setInterval(() => {
        setSession(getAutoSessionByCurrentTime());
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  // Handle Role Change
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
      // Teacher PC mode only has monthly and analytics
      if (activeTab === 'daily' || activeTab === 'students' || activeTab === 'kiosk' || activeTab === 'mobile_teacher') {
        setActiveTab('monthly');
      }
    } else if (newRole === 'admin') {
      // If was in kiosk or mobile_teacher, switch to monthly
      if (activeTab === 'kiosk' || activeTab === 'mobile_teacher') {
        setActiveTab('monthly');
      }
    }
  };

  // Open role modal
  const handleOpenRoleModal = () => {
    setTargetRoleToSwitch(userRole);
    setIsRoleModalOpen(true);
  };

  // Students & Records (Empty by default)
  const [students, setStudents] = useState<Student[]>(() => loadStudents());
  const [records, setRecords] = useState<Record<string, AttendanceRecord>>(() => 
    loadAttendanceRecords()
  );

  // Update students handler: always sort by grade, classNum, studentNum, name and reassign seq
  const handleUpdateStudents = (newStudents: Student[]) => {
    const sorted = sortStudents(newStudents, [3, 2, 1], true);
    setStudents(sorted);
    saveStudents(sorted);
    if (userRole === 'admin') {
      sendStudentsUpdateToServer(sorted, userRole);
    }
  };

  // School Events and Wednesday Night study state
  const [schoolEvents, setSchoolEvents] = useState<SchoolEvent[]>(() => loadSchoolEvents());
  const [includeWednesdaysInNight, setIncludeWednesdaysInNight] = useState<boolean>(() => loadIncludeWednesdaysInNight());
  const [grade3Exclusion, setGrade3Exclusion] = useState<Grade3ExclusionConfig>(() => loadGrade3Exclusion());

  const handleUpdateGrade3Exclusion = (newConfig: Grade3ExclusionConfig) => {
    setGrade3Exclusion(newConfig);
    saveGrade3Exclusion(newConfig);
  };

  // Month days configuration per session
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

  // Current session's full month days
  const allDaysInMonth = daysConfig[session] || [];

  // Active (enabled) days in this month for current session
  const activeDays = useMemo(() => {
    return allDaysInMonth.filter(d => d.enabled);
  }, [allDaysInMonth]);

  // Selected date for Daily Checkin View (Default to today or closest active date)
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => {
    const initMorningActive = generateMonthDays(2026, 8, 'morning', [19, 20, 21, 24, 25, 26, 27, 28, 31]).filter(d => d.enabled);
    return getTodayOrClosestActiveDate(initMorningActive, 2026, 8);
  });

  // Adjust selectedDateStr if it's not active in current session or when session changes
  useEffect(() => {
    if (activeDays.length > 0) {
      const isCurrentActive = activeDays.some(d => d.dateStr === selectedDateStr);
      if (!isCurrentActive) {
        setSelectedDateStr(getTodayOrClosestActiveDate(activeDays, year, month));
      }
    }
  }, [session, activeDays, year, month, selectedDateStr]);

  // Tab change handler: when clicking 'daily' or 'mobile_teacher', always ensure today's date is immediately selected
  const handleTabChange = (tab: ViewTab) => {
    setActiveTab(tab);
    if ((tab === 'daily' || tab === 'mobile_teacher') && activeDays.length > 0) {
      setSelectedDateStr(getTodayOrClosestActiveDate(activeDays, year, month));
    }
  };

  // Modals state
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

  // Sync state & Cross-tab sync
  const [lastSyncedTime, setLastSyncedTime] = useState<string>(() => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}:${String(n.getSeconds()).padStart(2, '0')}`;
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);

  // Initial server load & continuous live polling (every 3.5s + on window focus)
  useEffect(() => {
    let isMounted = true;

    const pullServerState = async (silent = true) => {
      try {
        const data = await fetchServerAttendanceState();
        if (data && data.success && isMounted) {
          if (Array.isArray(data.students) && data.students.length > 0) {
            setStudents(data.students);
            if (userRole !== 'teacher' && userRole !== 'teacher_mobile') {
              saveStudents(data.students);
            }
          }
          if (data.records && Object.keys(data.records).length > 0) {
            setRecords((prev) => {
              const merged = { ...prev, ...data.records };
              if (userRole !== 'teacher' && userRole !== 'teacher_mobile') {
                saveAttendanceRecords(merged);
              }
              return merged;
            });
          }
          const now = new Date();
          const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
          setLastSyncedTime(timeStr);
        }
      } catch (err) {
        if (!silent) console.warn('[Sync] Poll error:', err);
      }
    };

    // 1. Initial pull immediately
    pullServerState(false);

    // 2. Real-time instant sync via Firebase Firestore (<0.5s multi-kiosk sync)
    const unsubFirestore = subscribeToFirestoreAttendanceState((state) => {
      if (!isMounted) return;
      if (Array.isArray(state.students) && state.students.length > 0) {
        setStudents(state.students);
        if (userRole !== 'teacher' && userRole !== 'teacher_mobile') {
          saveStudents(state.students);
        }
      }
      if (state.records && Object.keys(state.records).length > 0) {
        setRecords((prev) => {
          const merged = { ...prev, ...state.records };
          if (userRole !== 'teacher' && userRole !== 'teacher_mobile') {
            saveAttendanceRecords(merged);
          }
          return merged;
        });
      }
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      setLastSyncedTime(timeStr);
    });

    // 3. Periodic background poll every 4 seconds as redundant backup
    const interval = setInterval(() => {
      pullServerState(true);
    }, 4000);

    // 4. Pull when window/tab is focused
    const handleFocus = () => pullServerState(true);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') pullServerState(true);
    });

    return () => {
      isMounted = false;
      if (unsubFirestore) unsubFirestore();
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [userRole]);

  // Cross-tab synchronization via StorageEvent & BroadcastChannel
  useEffect(() => {
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key && (e.key.includes('students') || e.key.includes('records') || e.key.includes('custom_days'))) {
        setStudents(loadStudents());
        setRecords(loadAttendanceRecords());
        const n = new Date();
        setLastSyncedTime(`${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}:${String(n.getSeconds()).padStart(2, '0')}`);
      }
    };

    let bc: BroadcastChannel | null = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        bc = new BroadcastChannel('soongshin_attendance_sync');
        bc.onmessage = (event) => {
          if (event.data && event.data.type === 'SYNC') {
            setStudents(loadStudents());
            setRecords(loadAttendanceRecords());
            const n = new Date();
            setLastSyncedTime(`${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}:${String(n.getSeconds()).padStart(2, '0')}`);
          }
        };
      } catch (e) {
        console.warn('BroadcastChannel error:', e);
      }
    }

    window.addEventListener('storage', handleStorageEvent);
    return () => {
      window.removeEventListener('storage', handleStorageEvent);
      if (bc) bc.close();
    };
  }, []);

  // Manual sync trigger
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const serverData = await fetchServerAttendanceState();
      if (serverData && serverData.success) {
        if (serverData.students && serverData.students.length > 0) {
          setStudents(serverData.students);
          if (userRole !== 'teacher') saveStudents(serverData.students);
        }
        if (serverData.records) {
          setRecords(serverData.records);
          if (userRole !== 'teacher') saveAttendanceRecords(serverData.records);
        }
      } else {
        // Fallback to local
        setStudents(loadStudents());
        setRecords(loadAttendanceRecords());
      }
    } catch (e) {
      console.warn('Manual sync fallback:', e);
      setStudents(loadStudents());
      setRecords(loadAttendanceRecords());
    } finally {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      setLastSyncedTime(timeStr);
      setIsSyncing(false);

      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        try {
          const bc = new BroadcastChannel('soongshin_attendance_sync');
          bc.postMessage({ type: 'SYNC', time: timeStr });
          bc.close();
        } catch (e) {
          // ignore
        }
      }

      if (userRole === 'teacher') {
        setSyncToast(`[담임 교사 모드] 중앙 서버 최신 출결 데이터로 동기화 완료 (${timeStr})`);
      } else {
        setSyncToast(`데이터가 최신 상태로 동기화되었습니다 (${timeStr})`);
      }
      setTimeout(() => setSyncToast(null), 3000);
    }
  };

  // When year or month changes (1월 ~ 12월), regenerate month days for both sessions
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

  // School Events Handlers
  const handleAddSchoolEvent = (eventData: Omit<SchoolEvent, 'id'>) => {
    const newEvent: SchoolEvent = {
      ...eventData,
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    };
    const updated = [...schoolEvents, newEvent];
    setSchoolEvents(updated);
    saveSchoolEvents(updated);

    // Recompute days config for current month
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

  // Reset School Events Handlers (Past year events vs All events) - Attendance records are NEVER deleted!
  const handleResetPastYearEvents = () => {
    const currentAcademicYear = getAcademicYear(year, month);
    // Keep events of the current academic year or future, remove events belonging to earlier academic years
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

    setSyncToast('📅 이전 학년도 학교 행사가 정리되었습니다. (출결 기록은 100% 영구 보존됩니다.)');
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

    setSyncToast('📅 학교 행사 목록이 초기화되었습니다. (출결 기록은 100% 영구 보존됩니다.)');
    setTimeout(() => setSyncToast(null), 3500);
  };

  // Sync state to LocalStorage
  useEffect(() => {
    saveStudents(students);
  }, [students]);

  useEffect(() => {
    saveAttendanceRecords(records);
  }, [records]);

  // Update Single Record (with automatic check-in timestamp and auto-clear reason when updated)
  const handleUpdateRecord = (
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

    // 새로운 출결 데이터가 입력되거나 상태가 변경되면 이전 사유는 자동 삭제
    // (명시적으로 non-empty reason이 입력된 경우에만 해당 사유를 저장)
    let finalReason: string | undefined = undefined;
    if (typeof reason === 'string' && reason.trim() !== '') {
      finalReason = reason.trim();
    } else {
      finalReason = undefined;
    }

    setRecords(prev => {
      const updated = {
        ...prev,
        [key]: {
          status,
          reason: finalReason,
          checkInTime: finalCheckInTime,
        },
      };
      if (userRole !== 'teacher') {
        saveAttendanceRecords(updated);
      }
      return updated;
    });

    if (userRole !== 'teacher') {
      sendRecordUpdateToServer(
        studentId,
        session,
        dateStr,
        status,
        finalReason,
        finalCheckInTime,
        userRole
      );
    }
  };

  // Batch Update Entire Day for all or specific grade
  const handleBatchUpdateDay = (
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

    setRecords(prev => {
      const updated = { ...prev };
      students
        .filter(st => st.active && !isStudentExcluded(st, session, dateStr) && (gradeFilter === undefined || st.grade === gradeFilter))
        .forEach(st => {
          const key = getRecordKey(st.id, session, dateStr);
          const recCheckIn = status !== 'NONE' ? (prev[key]?.checkInTime || currentTimestamp) : undefined;
          updated[key] = {
            status,
            reason: undefined, // 일괄 변경 시 이전 사유 자동 삭제
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
      if (userRole !== 'teacher') {
        saveAttendanceRecords(updated);
      }
      return updated;
    });

    if (userRole === 'admin' && updates.length > 0) {
      sendBatchUpdateToServer(updates, userRole);
    }
  };

  // Track keys that were filled from empty to ABSENT by day fill action, for undo/toggle capability
  const [lastFilledDayKeys, setLastFilledDayKeys] = useState<Record<string, string[]>>({});

  // Fill all blank/NONE cells for a given day with 'X' (ABSENT), or Revert them back to NONE if already filled
  const handleFillDayAbsent = (dateStr: string, gradeFilter?: number) => {
    const now = new Date();
    const currentTimestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const trackingKey = `${session}_${dateStr}_${gradeFilter ?? 'all'}`;
    const serverUpdates: Array<{
      studentId: string;
      session: SessionType;
      dateStr: string;
      status: AttendanceStatus;
      reason?: string;
      checkInTime?: string;
    }> = [];

    setRecords(prev => {
      const updated = { ...prev };
      const applicableStudents = students.filter(
        st => st.active && !isStudentExcluded(st, session, dateStr) && (gradeFilter === undefined || st.grade === gradeFilter)
      );

      // Check which cells are currently blank/empty (NONE)
      const emptyKeys: string[] = [];
      applicableStudents.forEach(st => {
        const key = getRecordKey(st.id, session, dateStr);
        const status = prev[key]?.status;
        if (!status || status === 'NONE') {
          emptyKeys.push(key);
        }
      });

      // CASE 1: If there are empty cells -> Fill them with 'ABSENT' (X) and save keys for toggle/undo
      if (emptyKeys.length > 0) {
        emptyKeys.forEach(key => {
          updated[key] = {
            status: 'ABSENT',
            reason: undefined,
            checkInTime: currentTimestamp,
          };
          const stId = key.split('_')[0];
          serverUpdates.push({
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
        if (userRole !== 'teacher') saveAttendanceRecords(updated);
        return updated;
      }

      // CASE 2: If there are NO empty cells -> Revert previously auto-filled 'ABSENT' cells back to 'NONE'
      const previousKeys = lastFilledDayKeys[trackingKey];
      if (previousKeys && previousKeys.length > 0) {
        // Revert the specifically auto-filled keys
        previousKeys.forEach(key => {
          if (updated[key]?.status === 'ABSENT') {
            updated[key] = {
              status: 'NONE',
              reason: undefined,
              checkInTime: undefined,
            };
            const stId = key.split('_')[0];
            serverUpdates.push({
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
        // Fallback: revert all 'ABSENT' cells for this day/filter back to 'NONE'
        applicableStudents.forEach(st => {
          const key = getRecordKey(st.id, session, dateStr);
          if (updated[key]?.status === 'ABSENT') {
            updated[key] = {
              status: 'NONE',
              reason: undefined,
              checkInTime: undefined,
            };
            serverUpdates.push({
              studentId: st.id,
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
      }

      if (userRole !== 'teacher') saveAttendanceRecords(updated);
      return updated;
    });

    if (userRole === 'admin' && serverUpdates.length > 0) {
      sendBatchUpdateToServer(serverUpdates, userRole);
    }
  };

  // Toggle single day in month config for current session
  const handleToggleDay = (dateStr: string) => {
    setDaysConfig(prev => ({
      ...prev,
      [session]: prev[session].map(d => (d.dateStr === dateStr ? { ...d, enabled: !d.enabled } : d)),
    }));
  };

  // Set preset for month config for current session
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

  // 1. 특정 날짜만 비우기 (일별 초기화)
  const handleClearDate = (dateStr: string, gradeFilter?: number) => {
    // Save snapshot before clearing for instant undo
    saveSnapshot(`[${dateStr}] 출결 비우기 전 자동 백업`, records, students);

    setRecords(prev => {
      const updated = { ...prev };
      students
        .filter(st => gradeFilter === undefined || st.grade === gradeFilter)
        .forEach(st => {
          const key = getRecordKey(st.id, session, dateStr);
          delete updated[key];
        });
      if (userRole !== 'teacher' && userRole !== 'teacher_mobile') saveAttendanceRecords(updated);
      return updated;
    });

    if (userRole === 'admin') {
      sendClearAttendanceToServer('single-day', { dateStr, session, gradeFilter }, userRole);
    }
  };

  // 2. 해당 월 세션 전체 비우기 (월별 초기화)
  const handleClearMonthSession = (targetYear: number, targetMonth: number, targetSession: SessionType) => {
    // Save snapshot before clearing for instant undo
    const sessionName = targetSession === 'morning' ? '아침' : '저녁';
    saveSnapshot(`[${targetYear}년 ${targetMonth}월 ${sessionName}] 출결 비우기 전 자동 백업`, records, students);

    const monthPrefix = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
    setRecords(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(key => {
        // key format: `${studentId}_${session}_${dateStr}`
        const parts = key.split('_');
        if (parts.length >= 3) {
          const keySession = parts[1];
          const keyDate = parts[2];
          if (keySession === targetSession && keyDate.startsWith(monthPrefix)) {
            delete updated[key];
          }
        }
      });
      if (userRole !== 'teacher' && userRole !== 'teacher_mobile') saveAttendanceRecords(updated);
      return updated;
    });

    if (userRole === 'admin') {
      sendClearAttendanceToServer('month-session', { year: targetYear, month: targetMonth, session: targetSession }, userRole);
    }
  };

  // 3. 전체 출결 완전 초기화 (모든 기간/세션)
  const handleClearAll = () => {
    // Save snapshot before clearing for instant undo
    saveSnapshot('전체 출결 비우기 전 자동 백업', records, students);

    setRecords({});
    if (userRole !== 'teacher' && userRole !== 'teacher_mobile') saveAttendanceRecords({});
    if (userRole === 'admin') {
      sendClearAttendanceToServer('all', {}, userRole);
    }
  };

  // 4. 데이터 복구 적용 핸들러 (스냅샷, 서버, 백업 파일 등으로부터 복원)
  const handleRestoreData = async (restoredStudents?: Student[], restoredRecords?: Record<string, AttendanceRecord>) => {
    const finalStudents = restoredStudents && Array.isArray(restoredStudents) && restoredStudents.length > 0
      ? restoredStudents
      : students;

    const finalRecords = restoredRecords && typeof restoredRecords === 'object'
      ? restoredRecords
      : records;

    // 1. Immediately apply to local state & storage
    setStudents(finalStudents);
    setRecords(finalRecords);

    if (userRole !== 'teacher' && userRole !== 'teacher_mobile') {
      saveStudents(finalStudents);
      saveAttendanceRecords(finalRecords);
    }

    // 2. Immediately send full restore to server to overwrite masterState
    if (userRole === 'admin') {
      await sendFullRestoreToServer(finalRecords, finalStudents, userRole);
    }

    const n = new Date();
    const timeStr = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}:${String(n.getSeconds()).padStart(2, '0')}`;
    setLastSyncedTime(timeStr);
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

      {/* Sync Toast Notification */}
      {syncToast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-slate-900/95 dark:bg-slate-100/95 text-white dark:text-slate-900 text-xs sm:text-sm font-bold shadow-xl border border-slate-700 dark:border-slate-300 flex items-center gap-2 animate-bounce">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{syncToast}</span>
        </div>
      )}

      {/* Main Container with Bento Grid spacing */}
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

      {/* Footer with School Branding & Creator Credit */}
      {activeTab !== 'kiosk' && (
        <footer className="mt-auto border-t border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md py-6 transition-colors">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
              {/* School Branding */}
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

              {/* Creator Credit Badge */}
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

      {/* User Role Auth / Selector Modal */}
      <RoleAuthModal
        isOpen={isRoleModalOpen}
        onClose={() => setIsRoleModalOpen(false)}
        targetRole={targetRoleToSwitch}
        currentRole={userRole}
        onConfirmRole={handleRoleChange}
      />

      {/* Export & Google Sheets Sync Modal */}
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

      {/* Month Config Modal */}
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

      {/* Parent Notification Modal */}
      <ParentNotificationModal
        isOpen={parentModalData.isOpen}
        onClose={() => setParentModalData(prev => ({ ...prev, isOpen: false }))}
        session={session}
        dateStr={parentModalData.dateStr}
        absentList={parentModalData.list}
      />

      {/* Clear Attendance Modal (Admin Only) */}
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

      {/* Data Recovery Modal (Admin Only) */}
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
