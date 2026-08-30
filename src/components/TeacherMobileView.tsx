import React, { useState, useMemo } from 'react';
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
  getRecordKey, 
  isStudentExcluded, 
  isStudentExcludedOnDate,
  formatKoreanDate,
  getTodayOrClosestActiveDate,
  getGradeOrder,
  sortStudents
} from '../utils/attendanceHelpers';
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Sun, 
  Moon, 
  Search, 
  UserCheck, 
  AlertCircle, 
  Clock, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Sparkles, 
  RefreshCw,
  Eye,
  BookOpen,
  MapPin,
  ChevronDown
} from 'lucide-react';
import { SchoolLogo } from './SchoolLogo';

interface TeacherMobileViewProps {
  students: Student[];
  session: SessionType;
  setSession: (session: SessionType) => void;
  activeDays: DayConfig[];
  selectedDateStr: string;
  setSelectedDateStr: (dateStr: string) => void;
  records: Record<string, AttendanceRecord>;
  userRole: UserRole;
  onSwitchToFullView?: () => void;
  onSync?: () => void;
  isSyncing?: boolean;
  lastSyncedTime?: string;
}

export const TeacherMobileView: React.FC<TeacherMobileViewProps> = ({
  students,
  session,
  setSession,
  activeDays,
  selectedDateStr,
  setSelectedDateStr,
  records,
  userRole,
  onSwitchToFullView,
  onSync,
  isSyncing = false,
  lastSyncedTime,
}) => {
  const [selectedGrade, setSelectedGrade] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | 'all'>('all');
  const [onlyWithReason, setOnlyWithReason] = useState(false);

  // Active days index & navigation
  const currentIndex = activeDays.findIndex(d => d.dateStr === selectedDateStr);
  const currentDayConfig = activeDays[currentIndex] || activeDays[0] || {
    dateStr: selectedDateStr,
    dayNum: 28,
    dayOfWeek: '금',
    enabled: true
  };

  const handlePrevDay = () => {
    if (currentIndex > 0) {
      setSelectedDateStr(activeDays[currentIndex - 1].dateStr);
    }
  };

  const handleNextDay = () => {
    if (currentIndex < activeDays.length - 1 && currentIndex !== -1) {
      setSelectedDateStr(activeDays[currentIndex + 1].dateStr);
    }
  };

  // Find today's date if exists in activeDays or closest past date
  const handleJumpToToday = () => {
    setSelectedDateStr(getTodayOrClosestActiveDate(activeDays));
  };

  // Filter students based on grade, search, status, and reason
  const filteredStudents = useMemo(() => {
    const result = students.filter(st => {
      // Grade filter
      if (selectedGrade !== 'all' && st.grade !== selectedGrade) {
        return false;
      }

      // Search filter (name, phone, parentPhone, seatNum, notes)
      if (searchQuery.trim() !== '') {
        const q = searchQuery.trim().toLowerCase();
        const matchName = st.name.toLowerCase().includes(q);
        const matchSeat = (st.seatNum || '').toLowerCase().includes(q);
        const matchClass = `${st.grade}학년 ${st.classNum}반`.includes(q) || `${st.classNum}반`.includes(q);
        const matchPhone = (st.phone || '').includes(q) || (st.parentPhone || '').includes(q);
        const key = getRecordKey(st.id, session, selectedDateStr);
        const rec = records[key];
        const matchReason = (rec?.reason || '').toLowerCase().includes(q);

        if (!matchName && !matchSeat && !matchClass && !matchPhone && !matchReason) {
          return false;
        }
      }

      const key = getRecordKey(st.id, session, selectedDateStr);
      const rec = records[key];
      const status: AttendanceStatus = rec?.status || 'NONE';

      // Status filter
      if (statusFilter !== 'all') {
        if (status !== statusFilter) return false;
      }

      // Reason filter
      if (onlyWithReason) {
        if (!rec?.reason || rec.reason.trim() === '') return false;
      }

      return true;
    });

    const currentMonth = parseInt(selectedDateStr.split('-')[1], 10) || 8;
    const gradeOrder = getGradeOrder(currentMonth, selectedDateStr);
    return sortStudents(result, gradeOrder, false);
  }, [students, selectedGrade, searchQuery, statusFilter, onlyWithReason, session, selectedDateStr, records]);

  // Overall attendance statistics for current date & session
  const stats = useMemo(() => {
    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;
    let earlyLeave = 0;
    let none = 0;
    let withReasonCount = 0;

    const baseStudents = selectedGrade === 'all' 
      ? students 
      : students.filter(st => st.grade === selectedGrade);

    baseStudents.forEach(st => {
      const key = getRecordKey(st.id, session, selectedDateStr);
      const rec = records[key];
      const s = rec?.status || 'NONE';

      if (s === 'PRESENT') present++;
      else if (s === 'ABSENT') absent++;
      else if (s === 'LATE') late++;
      else if (s === 'EXCUSED') excused++;
      else if (s === 'EARLY_LEAVE') earlyLeave++;
      else none++;

      if (rec?.reason && rec.reason.trim() !== '') {
        withReasonCount++;
      }
    });

    const total = baseStudents.length;
    const checked = total - none;
    const attendanceRate = total > 0 ? Math.round((present / total) * 100) : 0;

    return {
      total,
      checked,
      present,
      absent,
      late,
      excused,
      earlyLeave,
      none,
      withReasonCount,
      attendanceRate
    };
  }, [students, selectedGrade, session, selectedDateStr, records]);

  // Daily attendance count per grade for current selected date & session
  const gradeDailyAttendance = useMemo(() => {
    let g1 = 0;
    let g2 = 0;
    let g3 = 0;

    students.forEach(st => {
      if (isStudentExcluded(st, session, selectedDateStr, currentDayConfig.dayOfWeek)) {
        return;
      }
      const key = getRecordKey(st.id, session, selectedDateStr);
      const rec = records[key];
      const s = rec?.status || 'NONE';
      // 출석 인정 상태: 출석(PRESENT), 지각(LATE), 조퇴(EARLY_LEAVE), 인정(EXCUSED)
      const isAttended = s === 'PRESENT' || s === 'LATE' || s === 'EARLY_LEAVE' || s === 'EXCUSED';

      if (isAttended) {
        if (st.grade === 1) g1++;
        else if (st.grade === 2) g2++;
        else if (st.grade === 3) g3++;
      }
    });

    const total = g1 + g2 + g3;

    return { g1, g2, g3, total };
  }, [students, session, selectedDateStr, currentDayConfig.dayOfWeek, records]);

  return (
    <div className="max-w-md mx-auto space-y-4 pb-12 animate-in fade-in">
      
      {/* 1. Mobile Header & Safety Badge */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <SchoolLogo size="sm" />
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight">
                  담임교사 모바일 출결
                </h1>
                <span className="text-[10px] font-bold bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-300 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                  <Eye className="w-3 h-3" /> 조회전용
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                숭신고 미래인재반 (45명)
              </p>
            </div>
          </div>

          {/* Sync Trigger */}
          {onSync && (
            <button
              type="button"
              onClick={onSync}
              disabled={isSyncing}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all border border-slate-200 dark:border-slate-700 cursor-pointer disabled:opacity-60 shrink-0"
              title="실시간 최신 출결 새로고침"
            >
              <RefreshCw className={`w-4 h-4 text-teal-600 dark:text-teal-400 ${isSyncing ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>

        {/* Notice */}
        <div className="text-[11px] text-teal-800 dark:text-teal-300 bg-teal-50/80 dark:bg-teal-950/40 p-2.5 rounded-xl border border-teal-200/80 dark:border-teal-900/50 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 shrink-0" />
            <span>스마트폰 터치로 데이터가 변경되지 않는 안전 조회 모드입니다.</span>
          </div>
          {lastSyncedTime && (
            <span className="text-[10px] font-mono text-teal-600 dark:text-teal-400 shrink-0">
              {lastSyncedTime}
            </span>
          )}
        </div>
      </div>

      {/* 2. Date Navigation & Session Toggle */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 space-y-3">
        
        {/* Date Selector Row */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handlePrevDay}
            disabled={currentIndex <= 0}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
            title="이전 운영일"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="text-center flex-1">
            <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
              {currentDayConfig.dateStr ? formatKoreanDate(currentDayConfig.dateStr) : '2026년 8월 28일 (금)'}
            </div>
            <div className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center justify-center gap-1 mt-0.5">
              <span>{currentDayConfig.dayNum}일 ({currentDayConfig.dayOfWeek}) 자습</span>
              {currentDayConfig.dateStr === '2026-08-28' && (
                <span className="text-[10px] bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 px-1.5 py-0.2 rounded-md font-extrabold">
                  오늘
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleNextDay}
            disabled={currentIndex >= activeDays.length - 1 || currentIndex === -1}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
            title="다음 운영일"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Session Switcher (Morning / Night) */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setSession('morning')}
            className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              session === 'morning'
                ? 'bg-white dark:bg-slate-700 text-amber-700 dark:text-amber-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Sun className="w-4 h-4 text-amber-500" />
            <span>아자 (07:30~08:20)</span>
          </button>

          <button
            type="button"
            onClick={() => setSession('night')}
            className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              session === 'night'
                ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Moon className="w-4 h-4 text-indigo-500" />
            <span>야자 (17:30~21:30)</span>
          </button>
        </div>

      </div>

      {/* Grade Attendance Overview Widget (Exact match to requested UI) */}
      <div className="bg-[#0f172a] dark:bg-slate-950 text-white rounded-2xl p-4 shadow-lg border border-slate-800 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0 shadow-xs shadow-emerald-400/50" />
            <h2 className="text-sm sm:text-base font-black text-white tracking-tight">
              {currentDayConfig.dayNum}일({currentDayConfig.dayOfWeek}) {session === 'morning' ? '아자' : '야자'} 참석 현황
            </h2>
          </div>

          <div className="relative inline-block shrink-0">
            <select
              value={selectedDateStr}
              onChange={(e) => setSelectedDateStr(e.target.value)}
              aria-label="날짜 선택"
              className="appearance-none bg-slate-800/90 hover:bg-slate-750 text-white font-bold text-xs sm:text-sm pl-3 pr-7 py-1.5 rounded-xl border border-slate-700/90 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer transition-colors shadow-xs"
            >
              {activeDays.map(d => (
                <option key={d.dateStr} value={d.dateStr} className="bg-slate-900 text-white">
                  {d.dayNum}일({d.dayOfWeek})
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
          {/* 1학년 */}
          <button
            type="button"
            onClick={() => setSelectedGrade(selectedGrade === 1 ? 'all' : 1)}
            className={`p-3 rounded-xl border text-center font-bold transition-all cursor-pointer ${
              selectedGrade === 1
                ? 'bg-slate-800 border-cyan-400 text-cyan-300 ring-2 ring-cyan-400/50 shadow-md'
                : 'bg-slate-850/80 hover:bg-slate-800 border-slate-750 text-slate-200'
            }`}
          >
            <span>1학년 출석인원 : </span>
            <span className="font-extrabold font-mono text-cyan-300">{gradeDailyAttendance.g1}명</span>
          </button>

          {/* 2학년 */}
          <button
            type="button"
            onClick={() => setSelectedGrade(selectedGrade === 2 ? 'all' : 2)}
            className={`p-3 rounded-xl border text-center font-bold transition-all cursor-pointer ${
              selectedGrade === 2
                ? 'bg-slate-800 border-cyan-400 text-cyan-300 ring-2 ring-cyan-400/50 shadow-md'
                : 'bg-slate-850/80 hover:bg-slate-800 border-slate-750 text-slate-200'
            }`}
          >
            <span>2학년 출석인원 : </span>
            <span className="font-extrabold font-mono text-cyan-300">{gradeDailyAttendance.g2}명</span>
          </button>

          {/* 3학년 */}
          <button
            type="button"
            onClick={() => setSelectedGrade(selectedGrade === 3 ? 'all' : 3)}
            className={`p-3 rounded-xl border text-center font-bold transition-all cursor-pointer ${
              selectedGrade === 3
                ? 'bg-slate-800 border-cyan-400 text-cyan-300 ring-2 ring-cyan-400/50 shadow-md'
                : 'bg-slate-850/80 hover:bg-slate-800 border-slate-750 text-slate-200'
            }`}
          >
            <span>3학년 출석인원 : </span>
            <span className="font-extrabold font-mono text-cyan-300">{gradeDailyAttendance.g3}명</span>
          </button>

          {/* 전체 */}
          <button
            type="button"
            onClick={() => setSelectedGrade('all')}
            className={`p-3 rounded-xl border text-center font-bold transition-all cursor-pointer ${
              selectedGrade === 'all'
                ? 'bg-indigo-600 border-indigo-400 text-white ring-2 ring-indigo-400/60 shadow-lg shadow-indigo-600/40'
                : 'bg-indigo-600/90 hover:bg-indigo-600 border-indigo-500/80 text-white'
            }`}
          >
            <span>전체 출석인원 : </span>
            <span className="font-black font-mono">{gradeDailyAttendance.total}명</span>
          </button>
        </div>
      </div>

      {/* 3. Fast Stat Summary Chips (Interactive Filters) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
            출결 요약 현황
          </span>
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
            출석률 <span className="text-indigo-600 font-extrabold">{stats.attendanceRate}%</span> ({stats.checked}/{stats.total}명)
          </span>
        </div>

        {/* Interactive Filter Grid */}
        <div className="grid grid-cols-3 gap-1.5 text-xs font-bold">
          {/* 1. All */}
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100 shadow-xs'
                : 'bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
            }`}
          >
            <div className="text-[10px] text-slate-400 dark:text-slate-500">전체</div>
            <div className="text-sm font-black">{stats.total}명</div>
          </button>

          {/* 2. Present */}
          <button
            type="button"
            onClick={() => setStatusFilter('PRESENT')}
            className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
              statusFilter === 'PRESENT'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                : 'bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/40 hover:bg-emerald-100/50'
            }`}
          >
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-0.5">
              <span>출석(O)</span>
            </div>
            <div className="text-sm font-black">{stats.present}명</div>
          </button>

          {/* 3. Absent */}
          <button
            type="button"
            onClick={() => setStatusFilter('ABSENT')}
            className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
              statusFilter === 'ABSENT'
                ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                : 'bg-rose-50/60 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900/40 hover:bg-rose-100/50'
            }`}
          >
            <div className="text-[10px] text-rose-600 dark:text-rose-400 flex items-center justify-center gap-0.5">
              <span>결석(X)</span>
            </div>
            <div className="text-sm font-black text-rose-600 dark:text-rose-400">{stats.absent}명</div>
          </button>

          {/* 4. Late */}
          <button
            type="button"
            onClick={() => setStatusFilter('LATE')}
            className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
              statusFilter === 'LATE'
                ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                : 'bg-amber-50/60 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/40 hover:bg-amber-100/50'
            }`}
          >
            <div className="text-[10px] text-amber-600 dark:text-amber-400">지각(△)</div>
            <div className="text-sm font-black">{stats.late}명</div>
          </button>

          {/* 5. Excused */}
          <button
            type="button"
            onClick={() => setStatusFilter('EXCUSED')}
            className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
              statusFilter === 'EXCUSED'
                ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                : 'bg-purple-50/60 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-900/40 hover:bg-purple-100/50'
            }`}
          >
            <div className="text-[10px] text-purple-600 dark:text-purple-400">인정(☆)</div>
            <div className="text-sm font-black">{stats.excused}명</div>
          </button>

          {/* 6. None (미체크) */}
          <button
            type="button"
            onClick={() => setStatusFilter('NONE')}
            className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
              statusFilter === 'NONE'
                ? 'bg-slate-600 text-white border-slate-600 shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-200/60'
            }`}
          >
            <div className="text-[10px] text-slate-500 dark:text-slate-400">미체크(-)</div>
            <div className="text-sm font-black">{stats.none}명</div>
          </button>
        </div>

        {/* Filter badge toggles */}
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => setOnlyWithReason(!onlyWithReason)}
            className={`text-xs px-2.5 py-1 rounded-lg font-bold border transition-all cursor-pointer flex items-center gap-1 ${
              onlyWithReason
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>사유 입력자만 보기 ({stats.withReasonCount}명)</span>
          </button>

          {statusFilter !== 'all' && (
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
            >
              필터 해제
            </button>
          )}
        </div>
      </div>

      {/* 4. Grade Selector & Live Search */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 shadow-sm border border-slate-200 dark:border-slate-800 space-y-2.5">
        
        {/* Grade Pills */}
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { key: 'all', label: '전체 (45)' },
            { key: 3, label: '3학년 (15)' },
            { key: 2, label: '2학년 (15)' },
            { key: 1, label: '1학년 (15)' },
          ].map(g => (
            <button
              key={g.key}
              type="button"
              onClick={() => setSelectedGrade(g.key as any)}
              className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                selectedGrade === g.key
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="학생 이름, 반 번호, 좌석, 사유 검색..."
            className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold p-1"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 5. Student Mobile Cards List */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1 text-xs font-bold text-slate-500 dark:text-slate-400">
          <span>학생 목록 ({filteredStudents.length}명)</span>
          <span className="text-[11px] text-slate-400">실시간 출결 현황</span>
        </div>

        {filteredStudents.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center text-slate-400 border border-slate-200 dark:border-slate-800 space-y-2">
            <AlertCircle className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
            <p className="text-xs font-bold">조건에 맞는 학생이 없습니다.</p>
            <button
              type="button"
              onClick={() => {
                setSelectedGrade('all');
                setSearchQuery('');
                setStatusFilter('all');
                setOnlyWithReason(false);
              }}
              className="text-xs text-indigo-600 font-bold hover:underline"
            >
              필터 초기화
            </button>
          </div>
        ) : (
          filteredStudents.map(student => {
            const key = getRecordKey(student.id, session, selectedDateStr);
            const rec = records[key];
            const status: AttendanceStatus = rec?.status || 'NONE';
            const meta = STATUS_META[status];

            // Night session academy check
            const dayOfWeek = currentDayConfig.dayOfWeek;
            const isAcademyDay = session === 'night' && student.academyDays && student.academyDays.includes(dayOfWeek);

            // Status border accent
            const borderColors: Record<AttendanceStatus, string> = {
              PRESENT: 'border-l-4 border-l-emerald-500 bg-white dark:bg-slate-900',
              ABSENT: 'border-l-4 border-l-rose-500 bg-rose-50/20 dark:bg-rose-950/20',
              LATE: 'border-l-4 border-l-amber-500 bg-amber-50/20 dark:bg-amber-950/20',
              EXCUSED: 'border-l-4 border-l-purple-500 bg-purple-50/20 dark:bg-purple-950/20',
              EARLY_LEAVE: 'border-l-4 border-l-orange-500 bg-orange-50/20 dark:bg-orange-950/20',
              NONE: 'border-l-4 border-l-slate-300 dark:border-l-slate-700 bg-white dark:bg-slate-900',
            };

            return (
              <div
                key={student.id}
                className={`rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 transition-all ${borderColors[status]}`}
              >
                {/* Top Row: Name, Seat & Status Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                        {student.grade}학년 {student.classNum}반 {student.studentNum}번
                      </span>
                      {student.seatNum && (
                        <span className="text-[11px] font-mono font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                          <MapPin className="w-3 h-3 text-indigo-500" /> {student.seatNum}
                        </span>
                      )}
                    </div>
                    
                    <h3 className="text-base font-black text-slate-900 dark:text-slate-100 mt-1">
                      {student.name}
                    </h3>
                  </div>

                  {/* Attendance Status Badge */}
                  <div className="text-right shrink-0">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black shadow-xs border ${meta.badgeClass}`}>
                      {meta.symbol && <span>{meta.symbol}</span>}
                      <span>{meta.label}</span>
                    </span>

                    {/* Time */}
                    {rec?.checkInTime && status !== 'NONE' && (
                      <div className="text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-end gap-0.5">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{rec.checkInTime}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Reason Pill Callout */}
                {rec?.reason && rec.reason.trim() !== '' && (
                  <div className="mt-2.5 p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-900 dark:text-emerald-200 text-xs font-bold flex items-start gap-1.5">
                    <span className="bg-emerald-500 text-white text-[10px] px-1.5 py-0.2 rounded-md shrink-0 font-black">
                      사유
                    </span>
                    <span className="flex-1 break-words">
                      {rec.reason}
                    </span>
                  </div>
                )}

                {/* Academy Day note if night session */}
                {isAcademyDay && (
                  <div className="mt-2 p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>오늘({dayOfWeek}요일) 학원 일정 (야자 미참여 요일)</span>
                  </div>
                )}

              </div>
            );
          })
        )}
      </div>

    </div>
  );
};
