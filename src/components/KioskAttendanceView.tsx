import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Student, 
  SessionType, 
  DayConfig, 
  AttendanceStatus, 
  AttendanceRecord,
  UserRole
} from '../types/attendance';
import { 
  STATUS_META, 
  getStatusMeta,
  getRecordKey, 
  isStudentExcluded, 
  isStudentExcludedOnDate,
  getGradeOrder, 
  sortStudents, 
  getTodayDateStr,
  getBestActiveDate,
  getStudentCode5Digit,
  getStudentAcademyDays
} from '../utils/attendanceHelpers';
import { 
  announceStudentAttendance, 
  playChimeSound, 
  getKioskAudioMuted, 
  setKioskAudioMuted 
} from '../utils/kioskSound';
import { StatusIcon } from './StatusIcon';
import { 
  Volume2, 
  VolumeX, 
  Clock, 
  Search, 
  Delete, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Users, 
  ArrowRight, 
  RotateCcw, 
  X, 
  Check, 
  Calendar,
  Layers,
  ChevronRight,
  Sun,
  Moon,
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface KioskAttendanceViewProps {
  students: Student[];
  session: SessionType;
  setSession: (s: SessionType) => void;
  activeDays: DayConfig[];
  selectedDateStr: string;
  setSelectedDateStr: (date: string) => void;
  records: Record<string, AttendanceRecord>;
  onUpdateRecord: (studentId: string, dateStr: string, status: AttendanceStatus, reason?: string, checkInTime?: string) => void;
  userRole?: UserRole;
  onExitKiosk?: () => void;
}

const PRESET_REASONS = [
  '병원 진료',
  '학원',
  '수행평가',
  '가족 행사',
  '컨디션 난조',
  '학교 행사',
];

export const KioskAttendanceView: React.FC<KioskAttendanceViewProps> = ({
  students,
  session,
  setSession,
  activeDays,
  selectedDateStr,
  setSelectedDateStr,
  records,
  onUpdateRecord,
  userRole = 'admin',
  onExitKiosk,
}) => {
  // 1. Live Digital Clock State (updates every second)
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [isAudioMuted, setIsAudioMutedState] = useState<boolean>(() => getKioskAudioMuted());
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Time simulation / test mode toggle (for teacher/admin testing outside regular hours)
  const [customTestTime, setCustomTestTime] = useState<string>(''); // e.g. "07:25" or "18:42"
  const [isTestTimeMode, setIsTestTimeMode] = useState<boolean>(false);

  // Input code state (keypad or keyboard input)
  const [inputCode, setInputCode] = useState<string>('');
  const [searchGrade, setSearchGrade] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Confirmation / Success popup state (matches user's screenshot)
  const [checkInResult, setCheckInResult] = useState<{
    student: Student;
    status: AttendanceStatus;
    timeStr: string;
    isLate: boolean;
    reason?: string;
  } | null>(null);

  // Auto dismiss countdown timer (in seconds - 6초)
  const [countdown, setCountdown] = useState<number>(6);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reason editing inside confirmation modal
  const [isEditingReasonInModal, setIsEditingReasonInModal] = useState<boolean>(false);
  const [modalReasonText, setModalReasonText] = useState<string>('');

  // Clock tick effect
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format current live time string (HH:mm)
  const effectiveTimeStr = useMemo(() => {
    if (isTestTimeMode && customTestTime) {
      return customTestTime;
    }
    const h = String(currentTime.getHours()).padStart(2, '0');
    const m = String(currentTime.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }, [currentTime, isTestTimeMode, customTestTime]);

  const liveSecondsStr = useMemo(() => {
    return String(currentTime.getSeconds()).padStart(2, '0');
  }, [currentTime]);

  // Current active date configuration
  const currentDayConfig = activeDays.find(d => d.dateStr === selectedDateStr) || activeDays[0];
  const currentDate = currentDayConfig ? currentDayConfig.dateStr : selectedDateStr;
  const currentDayName = currentDayConfig?.dayOfWeek;
  const currentMonth = parseInt(currentDate.split('-')[1], 10) || 8;
  const gradeOrder = getGradeOrder(currentMonth, currentDate);

  // Cutoff rule evaluation
  // Morning: 07:30 (450 mins). After 07:30 => LATE
  // Night: 17:30 (1050 mins). After 17:30 => LATE
  const currentCutoffMinutes = session === 'morning' ? 7 * 60 + 30 : 17 * 60 + 30;
  const [curH, curM] = effectiveTimeStr.split(':').map(Number);
  const curTotalMins = (curH || 0) * 60 + (curM || 0);
  const isCurrentlyLate = curTotalMins > currentCutoffMinutes;

  // Toggle Sound
  const handleToggleSound = () => {
    const next = !isAudioMuted;
    setIsAudioMutedState(next);
    setKioskAudioMuted(next);
    if (!next) {
      playChimeSound('click');
    }
  };

  // Toggle Fullscreen
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => {
          setIsFullscreen(false);
        }).catch(() => {});
      }
    }
  };

  // Candidate students who can check in on this day
  // 키오스크에서는 아침 자율학습뿐만 아니라 야간 자율학습(야자)에서도 학원 등록 요일인 학생을 포함하여
  // 전원(수능 후 11/17 3학년 제외)이 키오스크 명단에 뜨고 학번을 누르면 팝업이 노출되도록 처리합니다.
  const eligibleStudents = useMemo(() => {
    return students.filter(st => st.active && !isStudentExcludedOnDate(st.grade, currentDate));
  }, [students, currentDate]);

  // Sort eligible students
  const sortedEligibleStudents = useMemo(() => {
    return sortStudents(eligibleStudents, gradeOrder, false);
  }, [eligibleStudents, gradeOrder]);

  // Quick statistics for today's session
  const stats = useMemo(() => {
    let present = 0;
    let late = 0;
    let absent = 0;
    let unchecked = 0;
    const recentList: { student: Student; record: AttendanceRecord }[] = [];

    eligibleStudents.forEach(st => {
      const key = getRecordKey(st.id, session, currentDate);
      const rec = records[key];
      const status = rec?.status || 'NONE';

      if (status === 'PRESENT') present++;
      else if (status === 'LATE') late++;
      else if (status === 'ABSENT') absent++;
      else unchecked++;

      if (rec && status !== 'NONE' && rec.checkInTime) {
        recentList.push({ student: st, record: rec });
      }
    });

    // Sort recent list in reverse chronological order
    recentList.sort((a, b) => (b.record.checkInTime || '').localeCompare(a.record.checkInTime || ''));

    return {
      total: eligibleStudents.length,
      present,
      late,
      absent,
      unchecked,
      checkedTotal: present + late,
      recentList: recentList.slice(0, 10),
    };
  }, [eligibleStudents, records, session, currentDate]);

  // Helper to match student by 학번 code or query
  // Supports:
  // - 5 digits: 30119 (3학년 1반 19번), 20407 (2학년 4반 7번)
  // - 4 digits: 3119 (3학년 1반 19번)
  // - 3 digits: 216 (2학년 1반 6번), 113 (1학년 1반 3번)
  // - Name: 최서윤
  const findStudentByCode = useCallback((code: string): Student | null => {
    const clean = code.trim().replace(/[-\s]/g, '');
    if (!clean) return null;

    // 1. Direct name match
    const nameMatch = eligibleStudents.find(s => s.name === clean || s.name.toLowerCase() === clean.toLowerCase());
    if (nameMatch) return nameMatch;

    // 2. Numeric Student Code Match
    if (/^\d+$/.test(clean)) {
      // 2.1 Standard 5-digit code: Grade(1) + Class(2) + StudentNum(2) -> e.g. 30119 = 3-1-19, 20407 = 2-4-7
      if (clean.length === 5) {
        const g = parseInt(clean[0], 10);
        const c = parseInt(clean.slice(1, 3), 10);
        const num = parseInt(clean.slice(3), 10);
        const match = eligibleStudents.find(s => s.grade === g && s.classNum === c && s.studentNum === num);
        if (match) return match;
      }

      // 2.2 Standard 4-digit code: Grade(1) + Class(1) + StudentNum(2) -> e.g. 3119 = 3-1-19, 2106 = 2-1-6
      if (clean.length === 4) {
        const g = parseInt(clean[0], 10);
        const c = parseInt(clean[1], 10);
        const num = parseInt(clean.slice(2), 10);
        const match = eligibleStudents.find(s => s.grade === g && s.classNum === c && s.studentNum === num);
        if (match) return match;
      }

      // 2.3 3-digit code: Grade(1) + Class(1) + StudentNum(1) -> e.g. 216 = 2-1-6, 113 = 1-1-3
      if (clean.length === 3) {
        const g = parseInt(clean[0], 10);
        const c = parseInt(clean[1], 10);
        const num = parseInt(clean[2], 10);
        const match = eligibleStudents.find(s => s.grade === g && s.classNum === c && s.studentNum === num);
        if (match) return match;
      }

      // 2.4 Phone last 4 digits match
      if (clean.length === 4) {
        const phoneMatch = eligibleStudents.find(s => s.phone?.replace(/[-\s]/g, '').endsWith(clean));
        if (phoneMatch) return phoneMatch;
      }
    }

    return null;
  }, [eligibleStudents]);

  // Live matching candidate as the student types digits into keypad
  const liveMatchedStudent = useMemo(() => {
    if (!inputCode.trim()) return null;
    return findStudentByCode(inputCode);
  }, [inputCode, findStudentByCode]);

  // Core Check-In Action
  const handleCheckInStudent = (student: Student) => {
    // Determine automatic status based on exact session cutoff rule:
    // Morning: > 07:30 => LATE, <= 07:30 => PRESENT
    // Night: > 17:30 => LATE, <= 17:30 => PRESENT
    const checkInTime = effectiveTimeStr;
    const [h, m] = checkInTime.split(':').map(Number);
    const totalMinutes = (h || 0) * 60 + (m || 0);

    const isLate = session === 'morning' ? totalMinutes > 7 * 60 + 30 : totalMinutes > 17 * 60 + 30;
    const newStatus: AttendanceStatus = isLate ? 'LATE' : 'PRESENT';

    // Existing record key
    const key = getRecordKey(student.id, session, currentDate);
    const existingRec = records[key];

    // Update attendance record
    onUpdateRecord(student.id, currentDate, newStatus, existingRec?.reason, checkInTime);

    // Audio TTS Announcement & chime
    announceStudentAttendance(student.name, isLate, checkInTime);

    // Show Confirmation Card
    setCheckInResult({
      student,
      status: newStatus,
      timeStr: checkInTime,
      isLate,
      reason: existingRec?.reason,
    });

    // Reset input keypad code
    setInputCode('');
    setIsEditingReasonInModal(false);
    setModalReasonText(existingRec?.reason || '');

    // Start 6-second auto dismiss countdown (2초 연장)
    setCountdown(6);
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    countdownIntervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          setCheckInResult(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Close Confirmation Popup immediately
  const handleDismissModal = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    setCheckInResult(null);
  };

  // Allow manual status change from inside the confirmation card if needed (clears previous reason)
  const handleModalStatusChange = (newStatus: AttendanceStatus) => {
    if (!checkInResult) return;
    const isLate = newStatus === 'LATE';
    // 상태를 변경할 경우 이전 사유도 함께 초기화
    onUpdateRecord(checkInResult.student.id, currentDate, newStatus, undefined, checkInResult.timeStr);
    
    setCheckInResult(prev => prev ? {
      ...prev,
      status: newStatus,
      isLate,
      reason: undefined,
    } : null);
    setModalReasonText('');

    playChimeSound('click');
  };

  // Start editing reason (pause countdown timer)
  const handleStartEditingReason = () => {
    setModalReasonText(checkInResult?.reason || '');
    setIsEditingReasonInModal(true);
    // 사유 작성 중에는 시간이 정지되도록 타이머를 즉시 중단합니다.
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  };

  // Real-time reason update (auto-saves instantly without needing a save button)
  const handleReasonChange = (newText: string) => {
    setModalReasonText(newText);
    if (checkInResult) {
      const trimmed = newText.trim();
      onUpdateRecord(checkInResult.student.id, currentDate, checkInResult.status, trimmed, checkInResult.timeStr);
      setCheckInResult(prev => prev ? { ...prev, reason: trimmed } : null);
    }
  };

  // Preset reason chip click (instantly appends/sets and auto-saves)
  const handleAddPresetReason = (preset: string) => {
    if (!checkInResult) return;
    const current = modalReasonText.trim();
    let next = '';
    if (!current) {
      next = preset;
    } else if (current.includes(preset)) {
      next = current;
    } else {
      next = `${current}, ${preset}`;
    }
    setModalReasonText(next);
    onUpdateRecord(checkInResult.student.id, currentDate, checkInResult.status, next, checkInResult.timeStr);
    setCheckInResult(prev => prev ? { ...prev, reason: next } : null);
    playChimeSound('click');
  };

  // Keypad button clicks
  const handleKeypadPress = (val: string) => {
    playChimeSound('click');
    if (val === 'CLEAR') {
      setInputCode('');
    } else if (val === 'BACK') {
      setInputCode(prev => prev.slice(0, -1));
    } else if (val === 'ENTER') {
      if (liveMatchedStudent) {
        handleCheckInStudent(liveMatchedStudent);
      } else {
        const found = findStudentByCode(inputCode);
        if (found) {
          handleCheckInStudent(found);
        } else {
          playChimeSound('error');
        }
      }
    } else {
      if (inputCode.length < 5) {
        const nextCode = inputCode + val;
        setInputCode(nextCode);

        // Auto-trigger if 5-digit exact match (e.g. 30119)
        const autoMatch = findStudentByCode(nextCode);
        if (autoMatch && nextCode.length === 5) {
          setTimeout(() => {
            handleCheckInStudent(autoMatch);
          }, 200);
        }
      }
    }
  };

  // Physical keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If modal is open and editing reason, don't hijack keyboard
      if (isEditingReasonInModal) return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleKeypadPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleKeypadPress('BACK');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleDismissModal();
        setInputCode('');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (checkInResult) {
          handleDismissModal();
        } else {
          handleKeypadPress('ENTER');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inputCode, liveMatchedStudent, checkInResult, isEditingReasonInModal, handleKeypadPress]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  // Filter student directory for fast touch
  const filteredTouchStudents = useMemo(() => {
    return sortedEligibleStudents.filter(st => {
      if (searchGrade !== 'all' && st.grade !== searchGrade) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const code5 = getStudentCode5Digit(st);
        const code4 = `${st.grade}${st.classNum}${String(st.studentNum).padStart(2, '0')}`;
        return st.name.toLowerCase().includes(q) || code5.includes(q) || code4.includes(q);
      }
      return true;
    });
  }, [sortedEligibleStudents, searchGrade, searchQuery]);

  return (
    <div id="kiosk-attendance-container" className="space-y-4 max-w-7xl mx-auto pb-10">
      
      {/* Top Kiosk Control & Digital Clock Bar */}
      <div className="bg-slate-900 text-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-800 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          
          {/* Left: Branding & Session Status */}
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="px-3 py-1 bg-indigo-500/20 border border-indigo-400/30 rounded-full text-indigo-300 font-bold text-xs flex items-center gap-1.5 shadow-inner">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                교실 앞 입실 키오스크
              </span>
              
              {/* Session Switcher Pill */}
              {userRole === 'student' ? (
                <div className="inline-flex p-1 rounded-xl bg-slate-800/90 border border-slate-700 shadow-inner">
                  {session === 'morning' ? (
                    <div className="px-3 py-1 rounded-lg text-xs font-black flex items-center gap-1.5 bg-amber-500 text-slate-950 shadow-md">
                      <Sun className="w-3.5 h-3.5" />
                      <span>아침 자율학습 (07:30 기준)</span>
                    </div>
                  ) : (
                    <div className="px-3 py-1 rounded-lg text-xs font-black flex items-center gap-1.5 bg-indigo-500 text-white shadow-md">
                      <Moon className="w-3.5 h-3.5" />
                      <span>야간 자율학습 (17:30 기준)</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="inline-flex p-0.5 rounded-xl bg-slate-800 border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setSession('morning')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      session === 'morning'
                        ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    아침 자율학습 (07:30 기준)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSession('night')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      session === 'night'
                        ? 'bg-indigo-500 text-white shadow-md font-black'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5" />
                    야간 자율학습 (17:30 기준)
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                숭신고 미래인재반 자습 입실 체크
              </h1>
            </div>

            {/* Rule Notice Pill & Speaker Toggle */}
            <div className="flex items-center gap-2 flex-wrap text-xs text-slate-300">
              <span className="font-semibold text-slate-400">출결 판정 기준:</span>
              {session === 'morning' ? (
                <span className="px-2.5 py-0.5 rounded-md bg-amber-950/60 border border-amber-800/80 text-amber-300 font-bold">
                  ☀️ 07:30 이전 [출석 ○] · 07:30 이후 [지각 △]
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-md bg-indigo-950/60 border border-indigo-800/80 text-indigo-300 font-bold">
                  🌙 17:30 이전 [출석 ○] · 17:30 이후 [지각 △]
                </span>
              )}
              
              <span className={`px-2.5 py-0.5 rounded-md font-bold text-2xs border ${
                isCurrentlyLate
                  ? 'bg-rose-950/70 border-rose-800 text-rose-300 animate-pulse'
                  : 'bg-emerald-950/70 border-emerald-800 text-emerald-300'
              }`}>
                현재 시각: {isCurrentlyLate ? '지각 대상 시간' : '정상 출석 시간'}
              </span>

              {/* Speaker Toggle button directly next to late status indicator */}
              <button
                type="button"
                onClick={handleToggleSound}
                className={`px-2.5 py-0.5 rounded-md border transition-all flex items-center gap-1.5 text-2xs font-bold cursor-pointer ${
                  isAudioMuted
                    ? 'bg-slate-800/90 border-slate-700 text-slate-400 hover:text-slate-200'
                    : 'bg-emerald-800/90 border-emerald-600 text-emerald-100 shadow-xs hover:bg-emerald-700'
                }`}
                title={isAudioMuted ? '음성 안내 켜기' : '음성 안내 끄기'}
              >
                {isAudioMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-300" />}
                <span>{isAudioMuted ? '음성 끔' : '음성 켬'}</span>
              </button>
            </div>
          </div>

          {/* Right: Giant Digital Clock */}
          <div className="flex items-center gap-4 w-full lg:w-auto justify-between lg:justify-end">
            
            {/* Live Clock Display */}
            <div className="bg-slate-950/90 border border-slate-700/90 rounded-2xl px-6 py-3.5 text-right shadow-inner min-w-[200px] sm:min-w-[250px]">
              <div className="text-sm sm:text-base font-bold text-indigo-300 flex items-center justify-end gap-1.5 tracking-tight">
                <Calendar className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>{currentDayConfig ? `${currentDayConfig.dateStr} (${currentDayConfig.dayOfWeek}요일)` : currentDate}</span>
              </div>
              <div className="text-4xl sm:text-5xl lg:text-6xl font-black font-mono tracking-tight text-white flex items-baseline justify-end gap-1.5 mt-0.5">
                <span>{effectiveTimeStr}</span>
                <span className="text-sm sm:text-base text-indigo-400 font-mono font-bold">:{liveSecondsStr}</span>
              </div>
            </div>

          </div>

        </div>

        {/* Live Attendance Counter Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-slate-800 text-center">
          <div className="bg-slate-800/60 rounded-xl p-2.5 border border-slate-700/60">
            <div className="text-2xs text-slate-400 font-semibold">자습 대상 총원</div>
            <div className="text-xl sm:text-2xl font-black text-white font-mono">{stats.total}명</div>
          </div>
          <div className="bg-emerald-950/40 rounded-xl p-2.5 border border-emerald-800/40">
            <div className="text-2xs text-emerald-300 font-semibold">정상 출석 (○)</div>
            <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">{stats.present}명</div>
          </div>
          <div className="bg-amber-950/40 rounded-xl p-2.5 border border-amber-800/40">
            <div className="text-2xs text-amber-300 font-semibold">지각 입실 (△)</div>
            <div className="text-xl sm:text-2xl font-black text-amber-400 font-mono">{stats.late}명</div>
          </div>
          <div className="bg-slate-800/60 rounded-xl p-2.5 border border-slate-700/60">
            <div className="text-2xs text-slate-400 font-semibold">미체크 인원</div>
            <div className="text-xl sm:text-2xl font-black text-rose-400 font-mono">{stats.unchecked}명</div>
          </div>
        </div>

      </div>

      {/* Main Kiosk Area: Keypad Input (Left) & Touch Roster / Recent Log (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left 5 Cols: Large Touch Number Pad for Student ID */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4">
          
          <div>
            <div className="flex items-center justify-between mb-3">
              <label htmlFor="kiosk-input-code" className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                본인 학번 입력 (5자리)
              </label>
              <span className="text-3xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded-full font-bold">
                예: 3학년 1반 19번 ➔ 30119
              </span>
            </div>

            {/* Input Display Box */}
            <div className="relative mb-4">
              <div className="w-full h-16 bg-slate-100 dark:bg-slate-950 rounded-2xl border-2 border-indigo-500/50 dark:border-indigo-400/50 px-4 flex items-center justify-between shadow-inner">
                <div className="flex items-center gap-2">
                  <span className="text-2xl sm:text-3xl font-black font-mono tracking-widest text-slate-900 dark:text-white">
                    {inputCode ? (
                      inputCode.split('').map((char, i) => (
                        <span key={i} className="inline-block px-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg mx-0.5 text-indigo-600 dark:text-indigo-300">
                          {char}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-400 dark:text-slate-600 text-lg sm:text-xl font-normal font-sans">
                        학번(5자리) 또는 이름 터치
                      </span>
                    )}
                  </span>
                </div>

                {inputCode && (
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('CLEAR')}
                    className="p-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                    title="전체 지우기"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>

              {/* Live Preview Card if a student matches during typing */}
              <AnimatePresence>
                {liveMatchedStudent && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mt-2 p-3 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 rounded-2xl flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold px-2 py-0.5 bg-indigo-600 text-white rounded-lg">
                        {liveMatchedStudent.grade}학년 {liveMatchedStudent.classNum}반 {liveMatchedStudent.studentNum}번 ({getStudentCode5Digit(liveMatchedStudent)})
                      </span>
                      <span className="text-base font-black text-slate-900 dark:text-white">
                        {liveMatchedStudent.name}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCheckInStudent(liveMatchedStudent)}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md flex items-center gap-1 cursor-pointer animate-pulse"
                    >
                      <span>입실 체크</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 10-Key Keypad Matrix */}
            <div className="grid grid-cols-3 gap-2.5">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'BACK', '0', 'ENTER'].map(keyVal => {
                if (keyVal === 'BACK') {
                  return (
                    <button
                      key={keyVal}
                      type="button"
                      onClick={() => handleKeypadPress('BACK')}
                      className="h-14 sm:h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 text-slate-700 dark:text-slate-200 font-bold text-base sm:text-lg flex items-center justify-center transition-all shadow-xs cursor-pointer border border-slate-200/60 dark:border-slate-700/60"
                      title="한 글자 지우기"
                    >
                      <Delete className="w-6 h-6" />
                    </button>
                  );
                }

                if (keyVal === 'ENTER') {
                  return (
                    <button
                      key={keyVal}
                      type="button"
                      onClick={() => handleKeypadPress('ENTER')}
                      className="h-14 sm:h-16 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-black text-base sm:text-lg flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-indigo-200 dark:shadow-indigo-950 cursor-pointer"
                      title="입실 체크 완료"
                    >
                      <Check className="w-6 h-6" />
                      <span>입실</span>
                    </button>
                  );
                }

                return (
                  <button
                    key={keyVal}
                    type="button"
                    onClick={() => handleKeypadPress(keyVal)}
                    className="h-14 sm:h-16 rounded-2xl bg-slate-50 dark:bg-slate-800/90 hover:bg-indigo-50 dark:hover:bg-slate-700 active:scale-95 text-slate-900 dark:text-white font-black text-2xl font-mono flex items-center justify-center transition-all shadow-xs cursor-pointer border border-slate-200 dark:border-slate-700"
                  >
                    {keyVal}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Help & Testing Toggle */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-2xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>* 키보드 숫자 키 또는 화면 번호 터치</span>

            {/* Test Time Simulator for Admin */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsTestTimeMode(!isTestTimeMode)}
                className="text-3xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
              >
                {isTestTimeMode ? '실시간 복귀' : '⚙️ 시간 테스트'}
              </button>
              {isTestTimeMode && (
                <input
                  type="time"
                  value={customTestTime || '07:25'}
                  onChange={e => setCustomTestTime(e.target.value)}
                  className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-xs border border-indigo-400 text-slate-900 dark:text-white"
                />
              )}
            </div>
          </div>

        </div>

        {/* Right 7 Cols: Quick Student Touch Grid + Live Recent Check-in Feed */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* Student Direct Touch Selection Roster */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  학생 간편 터치 입실
                </span>
                <span className="text-2xs font-semibold text-slate-400">
                  (이름 터치 시 즉시 출결 완료)
                </span>
              </div>

              {/* Grade Tabs & Search */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setSearchGrade('all')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      searchGrade === 'all'
                        ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    전체 ({eligibleStudents.length})
                  </button>
                  {gradeOrder.map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setSearchGrade(g)}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        searchGrade === g
                          ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {g}학년
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="이름/학번 검색..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-7 pr-2.5 py-1 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden w-28 sm:w-36"
                  />
                </div>
              </div>
            </div>

            {/* Students Touch Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-80 overflow-y-auto pr-1">
              {filteredTouchStudents.map(student => {
                const key = getRecordKey(student.id, session, currentDate);
                const rec = records[key];
                const curStatus = rec?.status || 'NONE';
                const isChecked = curStatus !== 'NONE';
                const statusMeta = getStatusMeta(curStatus);

                const gradeBadge = student.grade === 3 
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                  : student.grade === 2
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800';

                return (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => handleCheckInStudent(student)}
                    className={`p-3 rounded-2xl border text-left transition-all relative flex flex-col justify-between group active:scale-95 cursor-pointer ${
                      isChecked
                        ? 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-500 hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1.5">
                      <span className={`text-3xs px-1.5 py-0.5 rounded-md font-bold font-mono border ${gradeBadge}`}>
                        {getStudentCode5Digit(student)}
                      </span>

                      {isChecked ? (
                        <span className={`text-3xs px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5 ${statusMeta.badgeClass}`}>
                          <StatusIcon status={curStatus} size="xs" />
                          <span>{statusMeta.label}</span>
                        </span>
                      ) : (
                        <span className="text-3xs text-slate-400 font-medium">
                          미체크
                        </span>
                      )}
                    </div>

                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-black text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                        {student.name}
                      </span>
                      {rec?.checkInTime && isChecked && (
                        <span className="text-3xs font-mono font-bold text-slate-500 dark:text-slate-400">
                          {rec.checkInTime}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

          </div>

          {/* Real-time Recent Check-in Feed */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                실시간 최근 입실 기록 ({stats.recentList.length}건)
              </div>
              <span className="text-3xs text-slate-400">자동 갱신 중</span>
            </div>

            {stats.recentList.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400 font-medium bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                아직 입실한 학생이 없습니다. 번호를 입력하거나 이름을 터치하세요.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {stats.recentList.slice(0, 6).map(({ student, record }) => {
                  const statusMeta = getStatusMeta(record.status);
                  return (
                    <div
                      key={student.id}
                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-2xs font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                          {student.grade}학년 {student.classNum}반
                        </span>
                        <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                          {student.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-3xs font-mono text-slate-500 dark:text-slate-400">
                          {record.checkInTime}
                        </span>
                        <span className={`text-3xs px-2 py-0.5 rounded-full font-bold ${statusMeta.badgeClass}`}>
                          {statusMeta.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Confirmation Modal: Exactly matching the user's uploaded screenshot card layout */}
      <AnimatePresence>
        {checkInResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border-2 border-indigo-500 dark:border-indigo-400 relative overflow-hidden"
            >
              {/* Progress Countdown Bar at the top */}
              <div className="absolute top-0 left-0 right-0 h-2 bg-slate-100 dark:bg-slate-800">
                <motion.div
                  className="h-full bg-indigo-600"
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: 4, ease: 'linear' }}
                />
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={handleDismissModal}
                className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="space-y-5 pt-2">
                
                {/* 1. Header Badges: [3학년 1반 19번 (학번 30119)]  [출석완료 / 지각 / 조퇴 등] */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Blue outlined badge with 5-digit code */}
                    <span className="text-sm sm:text-base font-extrabold text-indigo-700 dark:text-indigo-300 bg-indigo-50/90 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 px-3.5 py-1.5 rounded-xl">
                      {checkInResult.student.grade}학년 {checkInResult.student.classNum}반 {checkInResult.student.studentNum}번 ({getStudentCode5Digit(checkInResult.student)})
                    </span>
                  </div>

                  {/* Status Indicator Badge */}
                  {(() => {
                    const curMeta = getStatusMeta(checkInResult.status);
                    let statusText = curMeta.label;
                    if (checkInResult.status === 'PRESENT') statusText = '출석 완료';
                    else if (checkInResult.status === 'LATE') statusText = '지각 입실';
                    else if (checkInResult.status === 'EARLY_LEAVE') statusText = '조퇴';
                    else if (checkInResult.status === 'EXCUSED') statusText = '인정';
                    else if (checkInResult.status === 'ABSENT') statusText = '결석';

                    return (
                      <span className={`text-sm sm:text-base font-extrabold px-4 py-1.5 rounded-full border flex items-center gap-1.5 ${curMeta.badgeClass}`}>
                        <StatusIcon status={checkInResult.status} size="sm" />
                        <span>{statusText}</span>
                      </span>
                    );
                  })()}
                </div>

                {/* 2. Middle Row: Student Name & Parent Phone Badge */}
                <div className="flex items-center justify-between py-1">
                  <div className="flex items-baseline gap-4 flex-wrap">
                    <h2 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
                      {checkInResult.student.name}
                    </h2>
                    <span className="text-sm sm:text-base font-mono font-extrabold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-3 py-1 rounded-xl">
                      🕒 {checkInResult.timeStr}
                    </span>
                  </div>

                  {checkInResult.student.parentPhone && (
                    <span className="text-sm sm:text-base font-mono font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50/90 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 px-3.5 py-1.5 rounded-xl">
                      학부모 {checkInResult.student.parentPhone.slice(-4)}
                    </span>
                  )}
                </div>

                {/* 2.5 학원 가는 요일 안내 배너 (잘 보이도록 강조 표시) */}
                {(() => {
                  const rawAcademyDays = getStudentAcademyDays(checkInResult.student, currentDate);
                  const weekdayOrder = ['월', '화', '수', '목', '금'];
                  const sortedAcademyDays = rawAcademyDays
                    .slice()
                    .sort((a, b) => weekdayOrder.indexOf(a) - weekdayOrder.indexOf(b));

                  const hasAcademyDays = sortedAcademyDays.length > 0;
                  const isTodayAcademyDay = session === 'night' && currentDayName && sortedAcademyDays.includes(currentDayName);

                  return (
                    <div className="my-1 px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 shadow-2xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm sm:text-base font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                          <Calendar className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          <span>{currentMonth}월 학원 가는 요일 :</span>
                        </span>
                        {hasAcademyDays ? (
                          <span className="text-sm sm:text-base font-black text-amber-800 dark:text-amber-200 bg-amber-100 dark:bg-amber-950/70 border border-amber-300/90 dark:border-amber-700/80 px-3 py-1 rounded-xl tracking-wide">
                            {sortedAcademyDays.map(d => (d.endsWith('요일') ? d : `${d}요일`)).join(', ')}
                          </span>
                        ) : (
                          <span className="text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400 bg-slate-200/70 dark:bg-slate-700/70 px-2.5 py-1 rounded-lg">
                            없음 (매일 참여)
                          </span>
                        )}
                      </div>

                      {isTodayAcademyDay && (
                        <span className="shrink-0 text-xs sm:text-sm font-black text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-800 px-3 py-1 rounded-xl">
                          오늘 학원일 (야자 미참여)
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* 3. Status Action Buttons Row: [○ 출석] [△ 지각] [⊘ 조퇴] [공 공결/인정] [X 결석] (07:31/17:31 이후는 출석 버튼 숨김) */}
                {(() => {
                  const allStatuses: AttendanceStatus[] = ['PRESENT', 'LATE', 'EARLY_LEAVE', 'EXCUSED', 'ABSENT'];
                  const visibleStatuses = allStatuses.filter(st => {
                    // 아침 07:31 이후, 야간 17:31 이후에는 출석 체크 란 숨김 (지각/조퇴/공결/결석만 표시)
                    if (isCurrentlyLate && st === 'PRESENT') return false;
                    return true;
                  });

                  return (
                    <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      {isCurrentlyLate && (
                        <div className="text-xs text-amber-600 dark:text-amber-400 font-bold px-1 flex items-center gap-1.5">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>
                            {session === 'morning' 
                              ? '07:30 이후 입실: 규정에 따라 지각으로 자동 처리됩니다 (출석 불가)' 
                              : '17:30 이후 입실: 규정에 따라 지각으로 자동 처리됩니다 (출석 불가)'}
                          </span>
                        </div>
                      )}
                      <div className={`grid ${visibleStatuses.length === 4 ? 'grid-cols-4' : 'grid-cols-5'} gap-2.5`}>
                        {visibleStatuses.map(st => {
                          const m = STATUS_META[st];
                          const isSelected = checkInResult.status === st;

                          const statusColors: Record<AttendanceStatus, { unselected: string; selected: string }> = {
                            PRESENT: {
                              unselected: 'border-emerald-300/80 dark:border-emerald-800/80 bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100/80',
                              selected: 'bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-400 shadow-md',
                            },
                            LATE: {
                              unselected: 'border-amber-300/80 dark:border-amber-800/80 bg-amber-50/80 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 hover:bg-amber-100/80',
                              selected: 'bg-amber-500 text-white border-amber-500 ring-2 ring-amber-400 shadow-md',
                            },
                            EARLY_LEAVE: {
                              unselected: 'border-purple-300/80 dark:border-purple-800/80 bg-purple-50/80 dark:bg-purple-950/30 text-purple-800 dark:text-purple-300 hover:bg-purple-100/80',
                              selected: 'bg-purple-600 text-white border-purple-600 ring-2 ring-purple-400 shadow-md',
                            },
                            EXCUSED: {
                              unselected: 'border-blue-300/80 dark:border-blue-800/80 bg-blue-50/80 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 hover:bg-blue-100/80',
                              selected: 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-400 shadow-md',
                            },
                            ABSENT: {
                              unselected: 'border-rose-300/80 dark:border-rose-800/80 bg-rose-50/80 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 hover:bg-rose-100/80',
                              selected: 'bg-rose-600 text-white border-rose-600 ring-2 ring-rose-400 shadow-md',
                            },
                            NONE: {
                              unselected: 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
                              selected: 'bg-slate-700 text-white border-slate-700 ring-2 ring-slate-400 shadow-md',
                            },
                          };

                          const style = statusColors[st];

                          return (
                            <button
                              key={st}
                              type="button"
                              onClick={() => handleModalStatusChange(st)}
                              className={`py-3.5 px-2 rounded-2xl text-sm font-extrabold transition-all flex flex-col items-center justify-center border cursor-pointer ${
                                isSelected
                                  ? `${style.selected} scale-[1.03]`
                                  : style.unselected
                              }`}
                            >
                              <span className="flex items-center justify-center text-xl leading-none font-bold h-6">
                                <StatusIcon status={st} size="md" />
                              </span>
                              <span className="text-xs mt-1.5 font-bold">{m.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* 4. Reason / Notes section: 사유 없음 or + 사유입력 */}
                <div className="pt-2">
                  {isEditingReasonInModal ? (
                    <div className="space-y-3 p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 shadow-inner">
                      <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-indigo-700 dark:text-indigo-300">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          <span>사유 및 특이사항 입력</span>
                        </div>
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" />
                          <span>실시간 자동 저장</span>
                        </span>
                      </div>

                      <div className="relative flex items-center">
                        <input
                          type="text"
                          value={modalReasonText}
                          onChange={e => handleReasonChange(e.target.value)}
                          placeholder="사유를 입력하거나 아래 버튼을 누르면 즉시 자동 기록됩니다"
                          className="w-full pl-3.5 pr-9 py-3 text-sm rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 shadow-inner font-medium"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleDismissModal();
                            }
                          }}
                        />
                        {modalReasonText && (
                          <button
                            type="button"
                            onClick={() => handleReasonChange('')}
                            className="absolute right-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 cursor-pointer"
                            title="사유 지우기"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Preset Reason Quick Buttons */}
                      <div className="space-y-1.5 pt-1">
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center justify-between">
                          <span>빠른 사유 선택 (클릭 시 즉시 기록):</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {PRESET_REASONS.map(preset => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => handleAddPresetReason(preset)}
                              className="px-3 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 hover:text-indigo-700 dark:hover:text-indigo-300 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-semibold transition-all text-center flex items-center justify-center gap-1 cursor-pointer shadow-2xs active:scale-95"
                              title={`클릭하여 사유에 '${preset}' 즉시 반영`}
                            >
                              <span>+ {preset}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-xs sm:text-sm text-slate-500 dark:text-slate-400 px-1 py-1">
                      <span>
                        {checkInResult.reason ? (
                          <span className="text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1.5">
                            <MessageSquare className="w-4 h-4 inline shrink-0" />
                            사유: {checkInResult.reason}
                          </span>
                        ) : (
                          <span>사유 없음</span>
                        )}
                      </span>

                      <button
                        type="button"
                        onClick={handleStartEditingReason}
                        className="text-indigo-600 dark:text-indigo-400 hover:underline font-bold text-xs sm:text-sm cursor-pointer flex items-center gap-1.5"
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span>{checkInResult.reason ? '사유 수정' : '+ 사유입력'}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* 5. Bottom Action: Next Student / Dismiss button with countdown */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-400 font-medium">
                    {isEditingReasonInModal ? (
                      <span className="text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 animate-pulse" />
                        사유 작성 중 (자동 닫힘 정지됨)
                      </span>
                    ) : (
                      <span>{countdown}초 후 자동으로 닫힙니다 (또는 Enter)</span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleDismissModal}
                    className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs sm:text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    <span>확인 / 다음 학생 입실</span>
                  </button>
                </div>

              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
