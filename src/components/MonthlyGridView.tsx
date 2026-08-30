import React, { useState } from 'react';
import { 
  Student, 
  SessionType, 
  DayConfig, 
  AttendanceStatus,
  AttendanceRecord,
  Grade3ExclusionConfig
} from '../types/attendance';
import { 
  STATUS_META, 
  NEXT_STATUS_CYCLE, 
  getNextAttendanceStatus,
  getStatusMeta,
  getRecordKey,
  isStudentExcludedOnDate,
  isStudentExcluded,
  getStudentAcademyDays,
  updateStudentAcademyDaysForMonth,
  calculateStudentMonthStats,
  getGradeOrder,
  getTodayOrClosestActiveDate,
  WEEKDAYS,
  sortStudents
} from '../utils/attendanceHelpers';
import { 
  Search, 
  Printer, 
  MessageSquare,
  AlertCircle,
  X,
  Check,
  Sun,
  Moon
} from 'lucide-react';
import { PrintAttendanceModal } from './PrintAttendanceModal';
import { StatusIcon } from './StatusIcon';

interface MonthlyGridViewProps {
  students: Student[];
  session: SessionType;
  year: number;
  month: number;
  activeDays: DayConfig[];
  records: Record<string, AttendanceRecord>;
  onUpdateRecord: (studentId: string, dateStr: string, status: AttendanceStatus, reason?: string, checkInTime?: string) => void;
  onBatchUpdateDay: (dateStr: string, status: AttendanceStatus, gradeFilter?: number) => void;
  onFillDayAbsent: (dateStr: string, gradeFilter?: number) => void;
  onUpdateStudents?: (students: Student[]) => void;
  onSessionChange?: (session: SessionType) => void;
  onMonthChange?: (month: number) => void;
  userRole?: import('../types/attendance').UserRole;
  grade3Exclusion?: Grade3ExclusionConfig;
}

export const MonthlyGridView: React.FC<MonthlyGridViewProps> = ({
  students,
  session,
  month,
  year,
  activeDays,
  records,
  onUpdateRecord,
  onBatchUpdateDay,
  onFillDayAbsent,
  onUpdateStudents,
  onSessionChange,
  onMonthChange,
  userRole = 'admin',
  grade3Exclusion,
}) => {
  const [selectedGrade, setSelectedGrade] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [roleWarning, setRoleWarning] = useState<string>('');
  const [editingCell, setEditingCell] = useState<{
    studentId: string;
    studentName: string;
    dateStr: string;
    dayNum: number;
    currentStatus: AttendanceStatus;
    currentReason?: string;
    currentCheckInTime?: string;
  } | null>(null);

  const sessionLabel = session === 'morning' ? '아자' : '야자';

  const showTeacherWarning = () => {
    setRoleWarning('담임 교사 모드는 조회 전용입니다. 출결 입력 및 수정은 불가합니다.');
    setTimeout(() => setRoleWarning(''), 3000);
  };

  const showStudentLockWarning = (reason?: 'past' | 'morning_time' | 'night_time') => {
    if (reason === 'morning_time') {
      setRoleWarning('아침 자율학습은 오전 10:00 이후 학생 직접 수정이 마감되었습니다 (관리자/교사 문의).');
    } else if (reason === 'night_time') {
      setRoleWarning('야간 자율학습은 밤 22:00 이후 학생 직접 수정이 마감되었습니다 (관리자/교사 문의).');
    } else {
      setRoleWarning('학생은 지나간 날짜의 출결을 수정할 수 없습니다 (오늘 출결만 마감 전 입력 가능 / 관리자 문의).');
    }
    setTimeout(() => setRoleWarning(''), 3500);
  };

  // Toggle student's night self-study day (월, 화, 수, 목, 금)
  const handleToggleAcademyDay = (studentId: string, dayName: string) => {
    if (userRole === 'student') {
      setRoleWarning('학생은 학원 가는 요일을 직접 수정할 수 없습니다 (관리자/교사 문의).');
      setTimeout(() => setRoleWarning(''), 3000);
      return;
    }
    if (userRole === 'teacher') {
      showTeacherWarning();
      return;
    }
    if (!onUpdateStudents) return;
    const updated = students.map(s => {
      if (s.id !== studentId) return s;
      const currentAcademyDays = getStudentAcademyDays(s, month);
      const nextAcademyDays = currentAcademyDays.includes(dayName)
        ? currentAcademyDays.filter(d => d !== dayName)
        : [...currentAcademyDays, dayName];
      return updateStudentAcademyDaysForMonth(s, month, nextAcademyDays);
    });
    onUpdateStudents(updated);
  };

  // Grade ordering based on month and grade3 exclusion setting
  const gradeOrder = getGradeOrder(month, undefined, grade3Exclusion);

  // Filter and sort students (strictly by grade, classNum, studentNum)
  const filteredStudents = React.useMemo(() => {
    const list = students.filter(s => {
      if (!s.active) return false;
      if (selectedGrade !== 'all' && s.grade !== selectedGrade) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = s.name.toLowerCase().includes(q);
        const matchNum = `${s.grade}${s.classNum}${s.studentNum}`.includes(q);
        return matchName || matchNum;
      }
      return true;
    });
    return sortStudents(list, gradeOrder, true);
  }, [students, selectedGrade, searchQuery, gradeOrder]);

  const [cellFeedback, setCellFeedback] = useState<{ studentName: string; dayNum: number; statusText: string; time: string } | null>(null);

  // 오늘 실제 날짜 YYYY-MM-DD
  const now = new Date();
  const realTodayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // 학생 모드 마감 규칙: 과거 날짜 수정 불가, 당일 아침 10:00 이후 수정 불가, 당일 야간 22:00 이후 수정 불가
  const getStudentLockReason = (dayDateStr: string, sessionType: SessionType): { isLocked: boolean; reason?: 'past' | 'morning_time' | 'night_time' } => {
    if (userRole !== 'student') return { isLocked: false };
    const nowDate = new Date();
    const realToday = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')}`;
    
    if (dayDateStr < realToday) {
      return { isLocked: true, reason: 'past' };
    }
    
    if (dayDateStr === realToday) {
      const curMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();
      if (sessionType === 'morning' && curMinutes >= 10 * 60) {
        return { isLocked: true, reason: 'morning_time' };
      }
      if (sessionType === 'night' && curMinutes >= 22 * 60) {
        return { isLocked: true, reason: 'night_time' };
      }
    }
    return { isLocked: false };
  };

  const handleCellClick = (student: Student, day: DayConfig) => {
    // 담임 교사 모드에서는 입력 불가
    if (userRole === 'teacher') {
      showTeacherWarning();
      return;
    }
    // 학생 모드: 마감 시간 및 과거 날짜 체크 (아침 10:00 이후, 야간 22:00 이후, 과거 일자)
    if (userRole === 'student') {
      const lock = getStudentLockReason(day.dateStr, session);
      if (lock.isLocked) {
        showStudentLockWarning(lock.reason);
        return;
      }
    }
    // 3학년 11월 17일 이후는 자습 미실시로 클릭 불가
    if (isStudentExcludedOnDate(student.grade, day.dateStr)) {
      return;
    }
    const key = getRecordKey(student.id, session, day.dateStr);
    const curStatus = records[key]?.status || 'NONE';
    const { nextStatus, checkInTime } = getNextAttendanceStatus(curStatus, session);
    
    onUpdateRecord(student.id, day.dateStr, nextStatus, undefined, checkInTime);

    // 클릭 시 시간과 상태를 즉시 확인할 수 있도록 피드백 안내
    if (nextStatus !== 'NONE') {
      const meta = getStatusMeta(nextStatus);
      setCellFeedback({
        studentName: student.name,
        dayNum: day.dayNum,
        statusText: `${meta.symbol} ${meta.label}`,
        time: checkInTime,
      });
      setTimeout(() => setCellFeedback(null), 2500);
    } else {
      setCellFeedback(null);
    }
  };

  const handleCellContextMenu = (e: React.MouseEvent, student: Student, day: DayConfig) => {
    e.preventDefault();
    if (userRole === 'teacher') {
      showTeacherWarning();
      return;
    }
    // 학생 모드: 마감 시간 및 과거 날짜 체크
    if (userRole === 'student') {
      const lock = getStudentLockReason(day.dateStr, session);
      if (lock.isLocked) {
        showStudentLockWarning(lock.reason);
        return;
      }
    }
    if (isStudentExcludedOnDate(student.grade, day.dateStr)) {
      return;
    }
    const key = getRecordKey(student.id, session, day.dateStr);
    const curRecord = records[key];
    setEditingCell({
      studentId: student.id,
      studentName: student.name,
      dateStr: day.dateStr,
      dayNum: day.dayNum,
      currentStatus: curRecord?.status || 'NONE',
      currentReason: curRecord?.reason || '',
      currentCheckInTime: curRecord?.checkInTime || '',
    });
  };

  // Group filtered students by grade
  const grades = selectedGrade === 'all' ? gradeOrder : [selectedGrade];

  // 오늘 날짜 계산 및 통계 대상일 설정 (오늘 또는 가장 최근 활성일, 예: 오늘이 29일(토)이면 28일(금))
  const defaultStatDateStr = React.useMemo(() => {
    return getTodayOrClosestActiveDate(activeDays, year, month);
  }, [activeDays, year, month]);

  const [selectedStatDateStr, setSelectedStatDateStr] = useState<string>('');

  const currentStatDay = React.useMemo(() => {
    if (!activeDays || activeDays.length === 0) return undefined;
    if (selectedStatDateStr) {
      const match = activeDays.find(d => d.dateStr === selectedStatDateStr);
      if (match) return match;
    }
    const defaultMatch = activeDays.find(d => d.dateStr === defaultStatDateStr);
    return defaultMatch || activeDays[activeDays.length - 1] || activeDays[0];
  }, [activeDays, selectedStatDateStr, defaultStatDateStr]);

  // 오늘의 학년별 실제 출석인원 통계 계산 (아침 및 야간 자율학습 모두 지원: 출석○, 지각△, 조퇴⊘, 공결 모두 1명 출석 처리)
  const sessionAttendanceStats = React.useMemo(() => {
    if (!currentStatDay) {
      return { g1: 0, g2: 0, g3: 0, total: 0 };
    }
    const targetDateStr = currentStatDay.dateStr;
    const targetDayOfWeek = currentStatDay.dayOfWeek;

    let g1 = 0;
    let g2 = 0;
    let g3 = 0;

    students.forEach(st => {
      if (!st.active) return;
      const isExcluded = isStudentExcluded(st, session, targetDateStr, targetDayOfWeek);
      if (isExcluded) return;

      const key = getRecordKey(st.id, session, targetDateStr);
      const status = records[key]?.status;

      let score = 0;
      if (status === 'PRESENT' || status === 'LATE' || status === 'EARLY_LEAVE' || status === 'EXCUSED') {
        score = 1;
      }

      if (st.grade === 1) g1 += score;
      else if (st.grade === 2) g2 += score;
      else if (st.grade === 3) g3 += score;
    });

    return {
      g1,
      g2,
      g3,
      total: g1 + g2 + g3,
    };
  }, [students, currentStatDay, records, session]);

  return (
    <div className="space-y-4">
      {/* Cell Click Timestamp Feedback Toast */}
      {cellFeedback && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900/95 dark:bg-slate-100/95 text-white dark:text-slate-900 px-4 py-2.5 rounded-2xl shadow-xl border border-slate-700 dark:border-slate-300 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="w-8 h-8 rounded-xl bg-indigo-500 text-white flex items-center justify-center font-bold text-sm shrink-0">
            🕒
          </div>
          <div>
            <div className="text-xs font-black flex items-center gap-1.5">
              <span>{cellFeedback.studentName}</span>
              <span className="text-[11px] font-normal opacity-80">({cellFeedback.dayNum}일)</span>
              <span className="px-1.5 py-0.2 rounded bg-indigo-600 dark:bg-indigo-700 text-white text-[10px] font-extrabold">
                {cellFeedback.statusText}
              </span>
            </div>
            <p className="text-[11px] font-mono text-indigo-300 dark:text-indigo-700 font-bold mt-0.5">
              체크 시간: {cellFeedback.time}
            </p>
          </div>
        </div>
      )}

      {/* Role Notice & Warning Banners */}
      {roleWarning && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{roleWarning}</span>
        </div>
      )}

      {userRole === 'teacher' && (
        <div className="p-2.5 bg-teal-50/80 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/80 rounded-xl text-xs font-semibold text-teal-800 dark:text-teal-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
            <span><strong>담임 교사 모드</strong>: 월간 출석부 및 통계 조회 전용 모드입니다. (출결 입력 및 수정 불가)</span>
          </div>
          <span className="text-[11px] bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300 px-2 py-0.5 rounded-md font-bold">읽기 전용</span>
        </div>
      )}

      {userRole === 'student' && (
        <div className="p-2.5 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-xl text-xs font-semibold text-amber-800 dark:text-amber-200 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>
              <strong>학생 모드</strong>: 아침 자율학습은 <strong>10:00 이전</strong>까지, 야간 자율학습은 <strong>22:00 이전</strong>까지 당일 출결 수정이 가능합니다. (마감 후 및 지난 날짜 수정 불가)
            </span>
          </div>
          <span className="text-[11px] bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-md font-bold">
            아침 ~10:00 / 야간 ~22:00 수정 마감
          </span>
        </div>
      )}

      {/* Controls & Filter Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
        
        {/* Title, Session Switcher and Subtitle */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>숭신고등학교 미래인재반 {month}월 {sessionLabel} 자율학습 출석부</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                총 {filteredStudents.length}명 재적
              </span>
            </h2>

            {/* Direct Session Switcher (Morning <-> Night) */}
            {onSessionChange && (
              <div className="inline-flex p-0.5 bg-slate-100 dark:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-600 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => onSessionChange('morning')}
                  className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                    session === 'morning'
                      ? 'bg-amber-500 text-white shadow-2xs font-black'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  <span>아자</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSessionChange('night')}
                  className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                    session === 'night'
                      ? 'bg-indigo-600 text-white shadow-2xs font-black'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" />
                  <span>야자</span>
                </button>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 flex-wrap">
              <span>셀 클릭 순서:</span>
              <span className="font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">빈칸</span>
              <span>→</span>
              <span className="font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded">출석(○)</span>
              <span>→</span>
              <span className="font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded">지각(△)</span>
              <span>→</span>
              <span className="font-bold text-purple-600 bg-purple-50 dark:bg-purple-950/40 px-1.5 py-0.5 rounded">
                조퇴
              </span>
              <span>→</span>
              <span className="font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded">인정(인)</span>
              <span>→</span>
              <span className="font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded">결석(X)</span>
              <span>→</span>
              <span className="font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">빈칸</span>
              <span className="inline-flex items-center gap-1.5 ml-2 font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 ring-1 ring-white dark:ring-slate-900 inline-block shadow-xs" />
                <span>우측 상단 초록점: 사유/특이사항 입력됨</span>
              </span>
            </span>
            {session === 'morning' ? (
              <span className="text-amber-700 dark:text-amber-300 font-bold bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
                💡 아침 자율학습은 수요일 포함 전원 정상 참여입니다. ('학원 가는 요일' 음영 처리는 야간 자율학습에만 적용)
              </span>
            ) : (
              <span className="text-indigo-700 dark:text-indigo-300 font-bold bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800">
                💡 야간 자율학습에서 학생별 '학원 가는 요일'은 야자 미참여로 진회색 음영 처리됩니다.
              </span>
            )}
          </p>

          {/* Grade filter & search */}
          <div className="flex flex-wrap items-center gap-2.5 mt-3">
            {/* Grade filter pills */}
            <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-700/60 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setSelectedGrade('all')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  selectedGrade === 'all'
                    ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                전체 학년
              </button>
              {gradeOrder.map(g => (
                <button
                  key={g}
                  onClick={() => setSelectedGrade(g)}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    selectedGrade === g
                      ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  {g}학년
                </button>
              ))}
            </div>

            {/* Search box */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="학생 이름 / 번호 검색..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 w-44"
              />
            </div>

            <button
              type="button"
              onClick={() => setIsPrintModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl shadow-xs transition-colors cursor-pointer"
              title="출석부 인쇄 (A4 세로 1장 완성 / 세로·가로 지원)"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>출석부 인쇄</span>
            </button>
          </div>
        </div>

        {/* 해당 날짜(오늘) 참석인원 통계 카드 (아침/야간 자율학습 공통 지원, 가독성 특화 디자인) */}
        {currentStatDay && (
          <div className="bg-slate-900 text-white rounded-2xl p-3.5 border border-slate-700 shadow-sm flex flex-col justify-between gap-2.5 shrink-0 self-stretch sm:self-auto sm:min-w-[330px]">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-extrabold text-slate-100">
                  {currentStatDay.dayNum}일({currentStatDay.dayOfWeek}) {sessionLabel} 참석 현황
                </span>
              </div>
              {activeDays.length > 1 && (
                <select
                  value={currentStatDay.dateStr}
                  onChange={(e) => setSelectedStatDateStr(e.target.value)}
                  className="text-3xs font-bold px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 cursor-pointer focus:outline-hidden hover:border-slate-500"
                  title="날짜 선택"
                >
                  {activeDays.map(d => (
                    <option key={`stat-day-${d.dateStr}`} value={d.dateStr}>
                      {d.dayNum}일({d.dayOfWeek})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* 통계 목록 (가독성 높은 2x2 그리드) */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-slate-800/90 border border-slate-700/60">
                <span className="text-slate-300 font-medium tracking-tight whitespace-nowrap">1학년 출석인원</span>
                <span className="font-extrabold text-indigo-300 font-mono text-sm shrink-0 ml-1">: {sessionAttendanceStats.g1}명</span>
              </div>
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-slate-800/90 border border-slate-700/60">
                <span className="text-slate-300 font-medium tracking-tight whitespace-nowrap">2학년 출석인원</span>
                <span className="font-extrabold text-emerald-300 font-mono text-sm shrink-0 ml-1">: {sessionAttendanceStats.g2}명</span>
              </div>
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-slate-800/90 border border-slate-700/60">
                <span className="text-slate-300 font-medium tracking-tight whitespace-nowrap">3학년 출석인원</span>
                <span className="font-extrabold text-purple-300 font-mono text-sm shrink-0 ml-1">: {sessionAttendanceStats.g3}명</span>
              </div>
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-indigo-600 text-white border border-indigo-500 font-bold shadow-xs">
                <span className="text-indigo-100 font-bold tracking-tight whitespace-nowrap">전체 출석인원</span>
                <span className="font-black text-white font-mono text-sm shrink-0 ml-1">: {sessionAttendanceStats.total}명</span>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Legend Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 rounded-2xl text-xs text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 shadow-2xs">
        <div className="flex items-center gap-3.5 flex-wrap">
          <span className="font-bold text-slate-800 dark:text-slate-200">출결 기호:</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-5 h-5 rounded bg-emerald-100 text-emerald-800 text-center leading-5 text-xs font-black">○</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">출석</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-5 h-5 rounded bg-amber-100 text-amber-800 text-center leading-5 text-xs font-black">△</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">지각</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-5 h-5 rounded bg-rose-100 text-rose-800 text-center leading-5 text-xs font-black">X</span>
            <span className="font-bold text-rose-600 dark:text-rose-400">결석 (또는 빈칸)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-5 h-5 rounded bg-purple-100 text-purple-800 flex items-center justify-center text-xs font-black" title="동그라미에 슬래시 관통">
              <StatusIcon status="EARLY_LEAVE" size="sm" />
            </span>
            <span className="font-bold text-purple-700 dark:text-purple-300">조퇴</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-5 h-5 rounded bg-blue-100 text-blue-800 text-center leading-5 text-xs font-bold">인</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">인정</span>
          </span>
          <span className="inline-flex items-center gap-1.5 border-l border-slate-300 dark:border-slate-600 pl-3">
            <span className="px-1.5 py-0.5 rounded text-3xs font-extrabold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600">학원</span>
            <span className="font-bold text-slate-700 dark:text-slate-300">학원: 야자 미참여 (클릭 시 개별입력 가능)</span>
          </span>
        </div>
        
        {month === 11 && (
          <div className="text-2xs text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            11월 17일 이후는 3학년 출석부에서 모두 제외 처리됩니다.
          </div>
        )}
        {month === 12 && (
          <div className="text-2xs text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            12월은 3학년 수능 후 자율학습 미실시로 1·2학년만 운영됩니다.
          </div>
        )}
      </div>

      {/* Main Grid Table (Bento styled attendance sheet with Freeze Panes / 틀고정) */}
      <div className="overflow-auto max-h-[calc(100vh-160px)] min-h-[500px] rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-900 scrollbar-thin">
        <table className="w-full text-xs border-collapse text-center relative">
          <thead className="sticky top-0 z-20 shadow-sm bg-slate-100 dark:bg-slate-800">
            {/* Column Headers Row 1 (Date numbers) */}
            <tr className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold border-b border-slate-300 dark:border-slate-600">
              <th rowSpan={2} className="w-10 py-2 px-1 border-r border-b-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 align-middle">연번</th>
              <th rowSpan={2} className="w-9 py-2 px-1 border-r border-b-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 align-middle">학년</th>
              <th rowSpan={2} className="w-9 py-2 px-1 border-r border-b-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 align-middle">반</th>
              <th rowSpan={2} className="w-10 py-2 px-1 border-r border-b-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 align-middle">번호</th>
              <th rowSpan={2} className="w-20 py-2 px-2 border-r-2 border-b-2 border-slate-300 dark:border-slate-600 text-center font-bold bg-slate-100 dark:bg-slate-800 align-middle">이름</th>

              {/* Dynamic Active Days Columns */}
              {activeDays.map(day => {
                const applicableStudents = students.filter(
                  st => st.active && !isStudentExcluded(st, session, day.dateStr) && (selectedGrade === 'all' || st.grade === Number(selectedGrade))
                );
                const hasEmptyCells = applicableStudents.some(st => {
                  const k = getRecordKey(st.id, session, day.dateStr);
                  const s = records[k]?.status;
                  return !s || s === 'NONE';
                });

                return (
                  <th 
                    key={`h1-${day.dateStr}`}
                    className="min-w-9 max-w-11 py-1 px-0.5 border-r border-b border-slate-300 dark:border-slate-600 select-none bg-slate-100 dark:bg-slate-800"
                    title={userRole === 'admin' 
                      ? hasEmptyCells 
                        ? `${day.dayNum}일: 클릭하면 미체크 빈칸을 'X'(결석)으로 채웁니다` 
                        : `${day.dayNum}일: 다시 클릭하면 결석(X) 처리를 되돌립니다 (빈칸 복원)`
                      : `${day.dateStr} (${day.dayOfWeek})`}
                  >
                    {userRole === 'admin' ? (
                      <button
                        onClick={() => onFillDayAbsent(day.dateStr, selectedGrade === 'all' ? undefined : Number(selectedGrade))}
                        className={`w-full py-0.5 rounded-lg transition-colors flex flex-col items-center justify-center cursor-pointer group ${
                          !hasEmptyCells 
                            ? 'bg-rose-50/80 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 font-black text-rose-700 dark:text-rose-300' 
                            : 'hover:bg-rose-100 dark:hover:bg-rose-950/60 font-black text-slate-900 dark:text-slate-100 hover:text-rose-600'
                        }`}
                        title={hasEmptyCells 
                          ? `${day.dayNum}일: 클릭하면 미체크 빈칸을 'X'(결석)으로 채웁니다` 
                          : `${day.dayNum}일: 다시 클릭하면 결석(X) 처리를 되돌립니다 (빈칸 복원)`}
                      >
                        <span className="text-xs font-bold">{day.dayNum}</span>
                        <span className={`text-3xs font-bold leading-none ${
                          !hasEmptyCells 
                            ? 'text-rose-600 dark:text-rose-400 opacity-90' 
                            : 'text-rose-500 opacity-60 group-hover:opacity-100'
                        }`}>
                          X
                        </span>
                      </button>
                    ) : (
                      <div className="w-full py-0.5 flex flex-col items-center justify-center font-black text-slate-900 dark:text-slate-100">
                        <span className="text-xs">{day.dayNum}</span>
                      </div>
                    )}
                  </th>
                );
              })}

              {/* Stats & Notes / Academy Days Columns */}
              <th rowSpan={2} className="w-10 py-2 px-1 border-l-2 border-r border-b-2 border-slate-300 dark:border-slate-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold align-middle">출석</th>
              <th rowSpan={2} className="w-10 py-2 px-1 border-r border-b-2 border-slate-300 dark:border-slate-600 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 font-bold align-middle">결석</th>
              <th rowSpan={2} className="w-12 py-2 px-1 border-r border-b-2 border-slate-300 dark:border-slate-600 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-bold align-middle">출석률</th>
              <th rowSpan={2} className="min-w-36 py-2 px-2 text-center font-bold border-b-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 align-middle">
                <div className="flex flex-col items-center justify-center leading-tight">
                  <span className="text-slate-900 dark:text-slate-100">학원 가는 요일</span>
                  <span className="text-3xs font-medium text-slate-500 dark:text-slate-400">월·화·수·목·금 (체크 시 미참여)</span>
                  <span className="text-3xs text-rose-500 font-bold mt-0.5">체크 시 음영</span>
                </div>
              </th>
            </tr>

            {/* Column Headers Row 2 (Day of week: 수, 목, 금...) */}
            <tr className="bg-slate-100 dark:bg-slate-800/90 text-slate-600 dark:text-slate-400 font-medium border-b-2 border-slate-300 dark:border-slate-600">
              {activeDays.map(day => {
                const isSat = day.dayOfWeek === '토';
                const isSun = day.dayOfWeek === '일';
                return (
                  <th 
                    key={`h2-${day.dateStr}`}
                    className={`py-1 px-0.5 border-r border-b-2 border-slate-300 dark:border-slate-600 text-2xs bg-slate-100 dark:bg-slate-800 ${
                      isSun ? 'text-rose-600 font-bold' : isSat ? 'text-blue-600 font-bold' : ''
                    }`}
                  >
                    {day.dayOfWeek}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {grades.map(grade => {
              const gradeStudents = filteredStudents.filter(s => s.grade === grade);
              if (gradeStudents.length === 0) return null;

              const gradeRowBg =
                grade === 3
                  ? 'hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20'
                  : grade === 2
                  ? 'hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20'
                  : 'hover:bg-purple-50/30 dark:hover:bg-purple-950/20';

              return (
                <React.Fragment key={`grade-group-${grade}`}>
                  {/* Students in this grade */}
                  {gradeStudents.map((student, idx) => {
                    const stats = calculateStudentMonthStats(student, session, activeDays, records);
                    const academyDays = getStudentAcademyDays(student, month);

                    return (
                      <tr 
                        key={student.id}
                        className={`border-b border-slate-200 dark:border-slate-800 transition-colors ${gradeRowBg}`}
                      >
                        {/* 연번 */}
                        <td className="py-1 px-1 border-r border-slate-200 dark:border-slate-800 text-slate-500 font-mono">
                          {student.seq || idx + 1}
                        </td>
                        {/* 학년 */}
                        <td className="py-1 px-1 border-r border-slate-200 dark:border-slate-800 font-semibold">
                          {student.grade}
                        </td>
                        {/* 반 */}
                        <td className="py-1 px-1 border-r border-slate-200 dark:border-slate-800">
                          {student.classNum}
                        </td>
                        {/* 번호 */}
                        <td className="py-1 px-1 border-r border-slate-200 dark:border-slate-800 font-mono">
                          {student.studentNum}
                        </td>
                        {/* 이름 (가운데 정렬) */}
                        <td className="py-1 px-2 border-r-2 border-slate-300 dark:border-slate-600 text-center font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {student.name}
                        </td>

                        {/* Attendance Cells */}
                        {activeDays.map(day => {
                          const isPostNov17 = isStudentExcludedOnDate(student.grade, day.dateStr, undefined, grade3Exclusion);

                          // 1. 수능 후 3학년 자습 미실시
                          if (isPostNov17) {
                            return (
                              <td
                                key={`${student.id}-${day.dateStr}`}
                                className="py-1 px-0.5 border-r border-slate-300 dark:border-slate-700 bg-slate-300 dark:bg-slate-700 select-none cursor-not-allowed"
                                title={`${student.name} - 수능 예비소집일 이후 3학년 자습 제외`}
                                style={{
                                  backgroundImage: 'repeating-linear-gradient(45deg, rgba(100, 116, 139, 0.22), rgba(100, 116, 139, 0.22) 4px, rgba(148, 163, 184, 0.45) 4px, rgba(148, 163, 184, 0.45) 8px)'
                                }}
                              >
                                <div className="flex items-center justify-center h-6 w-full" />
                              </td>
                            );
                          }

                          const lockInfo = getStudentLockReason(day.dateStr, session);
                          const isLockedForStudent = lockInfo.isLocked;
                          const isCellDisabled = isLockedForStudent || userRole === 'teacher';

                          let lockSuffix = '';
                          if (lockInfo.reason === 'morning_time') lockSuffix = ' [10:00 마감 / 학생 수정 불가]';
                          else if (lockInfo.reason === 'night_time') lockSuffix = ' [22:00 마감 / 학생 수정 불가]';
                          else if (lockInfo.reason === 'past') lockSuffix = ' [지나간 날짜 / 학생 수정 불가]';

                          const isAcademyDay = session === 'night' && academyDays.includes(day.dayOfWeek);
                          const key = getRecordKey(student.id, session, day.dateStr);
                          const rec = records[key];
                          const status = rec?.status || 'NONE';
                          const meta = getStatusMeta(status);

                          // 2. 학원일인데 아직 출결 체크(덮어쓰기)가 되지 않은 상태
                          if (isAcademyDay && status === 'NONE') {
                            return (
                              <td
                                key={`${student.id}-${day.dateStr}`}
                                onClick={() => handleCellClick(student, day)}
                                onContextMenu={(e) => handleCellContextMenu(e, student, day)}
                                className={`py-1 px-0.5 border-r border-slate-300 dark:border-slate-700 bg-slate-200/80 dark:bg-slate-700/80 select-none transition-colors text-center ${
                                  isCellDisabled
                                    ? 'cursor-not-allowed opacity-90'
                                    : 'hover:bg-slate-300/90 dark:hover:bg-slate-600/90 cursor-pointer'
                                }`}
                                title={
                                  isLockedForStudent
                                    ? `${student.name} (${day.dayNum}일) - 학원${lockSuffix}`
                                    : `${student.name}: ${day.dayOfWeek}요일 학원 (야자 미참여) - 클릭 시 개별 출결 입력 가능`
                                }
                              >
                                <div className="relative flex items-center justify-center h-6.5 w-full">
                                  <span className="text-3xs font-extrabold text-slate-600 dark:text-slate-300 px-1 py-0.2 rounded-sm bg-white/70 dark:bg-slate-800/70 border border-slate-300/70 dark:border-slate-600">
                                    학원
                                  </span>
                                  {rec?.reason && (
                                    <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-indigo-500 ring-1 ring-white dark:ring-slate-900" />
                                  )}
                                </div>
                              </td>
                            );
                          }

                          // 3. 일반 출결 셀 또는 학원일 개별 덮어쓰기된 셀 (학원일인 경우 회색 바탕 유지 + 출결 텍스트 색상 보존)
                          const statusTextColorMap: Record<AttendanceStatus, string> = {
                            PRESENT: 'text-emerald-700 dark:text-emerald-400 font-black',
                            LATE: 'text-amber-700 dark:text-amber-400 font-black',
                            ABSENT: 'text-rose-600 dark:text-rose-400 font-black',
                            EARLY_LEAVE: 'text-purple-700 dark:text-purple-400 font-black',
                            EXCUSED: 'text-blue-700 dark:text-blue-400 font-bold',
                            NONE: 'text-slate-400 dark:text-slate-500 font-normal',
                          };

                          const cellBgClass = isAcademyDay
                            ? `bg-slate-200 dark:bg-slate-700 ${statusTextColorMap[status]} ${isCellDisabled ? '' : 'hover:bg-slate-300 dark:hover:bg-slate-600'}`
                            : `${meta.cellClass} ${isCellDisabled ? '' : meta.bgHover}`;

                          return (
                            <td
                              key={`${student.id}-${day.dateStr}`}
                              onClick={() => handleCellClick(student, day)}
                              onContextMenu={(e) => handleCellContextMenu(e, student, day)}
                              className={`py-1 px-0.5 border-r border-slate-200 dark:border-slate-800 select-none transition-colors font-bold text-sm ${cellBgClass} ${
                                isCellDisabled ? 'cursor-not-allowed' : 'cursor-pointer'
                              } ${
                                isAcademyDay ? 'ring-1 ring-inset ring-slate-400/60 dark:ring-slate-500/60' : ''
                              }`}
                              title={
                                isLockedForStudent
                                  ? `${student.name}(${day.dayNum}일) - ${meta.label || '미체크'}${lockSuffix}`
                                  : `${student.name}(${day.dayNum}일) - ${
                                      rec?.checkInTime && status !== 'NONE'
                                        ? rec.checkInTime
                                        : meta.label || '미체크'
                                    }${rec?.reason && rec.reason.trim() !== '' ? ` (사유 : ${rec.reason.trim()})` : ''}`
                              }
                            >
                              <div className="relative flex items-center justify-center h-6.5 w-full">
                                <StatusIcon status={status} size="md" />
                                {rec?.reason && rec.reason.trim() !== '' && (
                                  <span 
                                    className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500 ring-1 ring-white dark:ring-slate-900 shadow-2xs z-10" 
                                    title={`사유 : ${rec.reason}`}
                                  />
                                )}
                              </div>
                            </td>
                          );
                        })}

                        {/* Stats for this student */}
                        <td className="py-1 px-1 border-l-2 border-slate-300 dark:border-slate-600 border-r border-slate-200 dark:border-slate-800 font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/10">
                          {stats.presentCount}
                        </td>
                        <td className="py-1 px-1 border-r border-slate-200 dark:border-slate-800 font-mono font-bold text-rose-700 dark:text-rose-400 bg-rose-50/30 dark:bg-rose-950/10">
                          {stats.absentCount}
                        </td>
                        <td className="py-1 px-1 border-r border-slate-200 dark:border-slate-800 font-mono font-bold text-slate-800 dark:text-slate-200 bg-amber-50/30 dark:bg-amber-950/10">
                          {stats.rate}
                        </td>

                        {/* Academy Days (월 화 수 목 금 체크박스) */}
                        <td className="py-1 px-1 text-center select-none whitespace-nowrap">
                          <div className="inline-flex items-center gap-1 justify-center">
                            {WEEKDAYS.map(dayName => {
                              const isAcademy = academyDays.includes(dayName);
                              const isStudent = userRole === 'student';
                              return (
                                <button
                                  key={dayName}
                                  type="button"
                                  disabled={isStudent}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleAcademyDay(student.id, dayName);
                                  }}
                                  className={`w-5 h-5 rounded text-3xs font-black transition-all flex items-center justify-center border ${
                                    isStudent ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
                                  } ${
                                    isAcademy
                                      ? 'bg-rose-600 border-rose-700 text-white shadow-2xs hover:bg-rose-700'
                                      : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                                  }`}
                                  title={
                                    isStudent
                                      ? '학생은 학원 가는 요일을 직접 수정할 수 없습니다 (관리자/교사 문의)'
                                      : `${student.name}: ${dayName}요일 ${isAcademy ? '학원 (야자 미참여, 출석부에 음영 처리)' : '학원 없음 (정상 야자 참여, 출석부에 빈칸)'}`
                                  }
                                >
                                  {dayName}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Summary Rows for this Grade */}
                  <tr className="bg-slate-100/90 dark:bg-slate-800/90 font-bold border-b border-slate-200 dark:border-slate-700 text-2xs text-slate-700 dark:text-slate-300">
                    <td colSpan={5} className="py-1.5 px-2 text-center border-r-2 border-slate-300 dark:border-slate-600">
                      {grade}학년 재적 ({gradeStudents.length}명)
                    </td>
                    {activeDays.map(day => {
                      const activeGradeCount = gradeStudents.filter(st => !isStudentExcluded(st, session, day.dateStr, day.dayOfWeek)).length;
                      return (
                        <td key={`cnt-tot-${grade}-${day.dateStr}`} className="py-1 px-0.5 border-r border-slate-200 dark:border-slate-700 font-mono">
                          {activeGradeCount > 0 ? activeGradeCount : '-'}
                        </td>
                      );
                    })}
                    <td colSpan={4} className="border-l-2 border-slate-300 dark:border-slate-600 bg-slate-200/50 dark:bg-slate-700/50"></td>
                  </tr>

                  <tr className="bg-slate-50 dark:bg-slate-800/50 font-bold border-b-2 border-slate-300 dark:border-slate-600 text-2xs text-indigo-900 dark:text-indigo-200">
                    <td colSpan={5} className="py-1.5 px-2 text-center border-r-2 border-slate-300 dark:border-slate-600 text-indigo-700 dark:text-indigo-300 font-extrabold">
                      {grade}학년 현원(출석)
                    </td>
                    {activeDays.map(day => {
                      let presentCount = 0;
                      let hasEligibleStudents = false;
                      gradeStudents.forEach(st => {
                        if (isStudentExcluded(st, session, day.dateStr, day.dayOfWeek)) return;
                        hasEligibleStudents = true;
                        const k = getRecordKey(st.id, session, day.dateStr);
                        const s = records[k]?.status;
                        if (s === 'PRESENT' || s === 'LATE' || s === 'EARLY_LEAVE' || s === 'EXCUSED') {
                          presentCount += 1;
                        }
                      });
                      return (
                        <td 
                           key={`cnt-pres-${grade}-${day.dateStr}`} 
                          className="py-1 px-0.5 border-r border-slate-200 dark:border-slate-700 font-mono font-bold text-indigo-600 dark:text-indigo-400"
                        >
                          {hasEligibleStudents ? presentCount : '-'}
                        </td>
                      );
                    })}
                    <td colSpan={4} className="border-l-2 border-slate-300 dark:border-slate-600 bg-slate-200/50 dark:bg-slate-700/50"></td>
                  </tr>

                  {/* 2,3학년 재적 / 출석 현황 행 (첨부문서 서식) */}
                  {grade === 2 && selectedGrade === 'all' && (
                    <tr className="bg-slate-100/70 dark:bg-slate-800/70 font-bold border-b border-slate-200 dark:border-slate-700 text-2xs text-slate-800 dark:text-slate-200">
                      <td colSpan={5} className="py-1.5 px-2 text-center border-r-2 border-slate-300 dark:border-slate-600 font-bold">
                        2,3학년 재적 ({filteredStudents.filter(s => s.grade === 3 || s.grade === 2).length}명)
                      </td>
                      {activeDays.map(day => {
                        let g23Pres = 0;
                        let hasEligible = false;
                        filteredStudents
                          .filter(s => s.grade === 3 || s.grade === 2)
                          .forEach(st => {
                            if (isStudentExcluded(st, session, day.dateStr, day.dayOfWeek)) return;
                            hasEligible = true;
                            const k = getRecordKey(st.id, session, day.dateStr);
                            const s = records[k]?.status;
                            if (s === 'PRESENT' || s === 'LATE' || s === 'EARLY_LEAVE' || s === 'EXCUSED') {
                              g23Pres += 1;
                            }
                          });
                        return (
                          <td 
                            key={`cnt-pres-23-${day.dateStr}`} 
                            className="py-1 px-0.5 border-r border-slate-200 dark:border-slate-700 font-mono font-bold text-slate-700 dark:text-slate-300"
                          >
                            {hasEligible ? g23Pres : '-'}
                          </td>
                        );
                      })}
                      <td colSpan={4} className="border-l-2 border-slate-300 dark:border-slate-600 bg-slate-200/50 dark:bg-slate-700/50"></td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {/* Total Aggregate Summary Row */}
            {selectedGrade === 'all' && (
              <tr className="bg-indigo-50 dark:bg-indigo-950/60 font-extrabold border-t-2 border-indigo-500 text-xs text-indigo-950 dark:text-indigo-100">
                <td colSpan={5} className="py-2.5 px-2 text-center border-r-2 border-slate-300 dark:border-slate-600 font-extrabold">
                  1~3학년 총 재적 및 출석
                </td>
                {activeDays.map(day => {
                  let totalPresent = 0;
                  let activeEnrolled = 0;
                  filteredStudents.forEach(st => {
                    if (isStudentExcluded(st, session, day.dateStr, day.dayOfWeek)) return;
                    activeEnrolled++;
                    const k = getRecordKey(st.id, session, day.dateStr);
                    const s = records[k]?.status;
                    if (s === 'PRESENT' || s === 'LATE' || s === 'EARLY_LEAVE' || s === 'EXCUSED') {
                      totalPresent += 1;
                    }
                  });
                  return (
                    <td key={`tot-${day.dateStr}`} className="py-2 px-0.5 border-r border-slate-200 dark:border-slate-700 font-mono">
                      <div className="leading-tight">
                        <span className="text-emerald-700 dark:text-emerald-300 font-bold">{totalPresent}</span>
                        <span className="text-slate-400 text-3xs block font-normal">/{activeEnrolled}</span>
                      </div>
                    </td>
                  );
                })}
                <td colSpan={4} className="border-l-2 border-slate-300 dark:border-slate-600 text-center text-indigo-800 dark:text-indigo-200 font-bold">
                  전체 현황
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Context Modal for Cell Details (Reason/Notes Editor) */}
      {editingCell && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
          onClick={() => setEditingCell(null)}
        >
          <div 
            className="bg-white dark:bg-slate-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base">
                  {editingCell.studentName} ({editingCell.dayNum}일 {sessionLabel})
                </h3>
                <p className="text-xs text-slate-500 font-mono">{editingCell.dateStr}</p>
              </div>
              <button 
                onClick={() => setEditingCell(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            {/* Status Selection Buttons */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                출결 상태 선택
              </label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { status: 'PRESENT' as AttendanceStatus, label: '출석', color: 'emerald', unselected: 'border-emerald-300/80 dark:border-emerald-800/80 bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100/80', selected: 'bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-400 shadow-xs' },
                  { status: 'LATE' as AttendanceStatus, label: '지각', color: 'amber', unselected: 'border-amber-300/80 dark:border-amber-800/80 bg-amber-50/80 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 hover:bg-amber-100/80', selected: 'bg-amber-500 text-white border-amber-500 ring-2 ring-amber-400 shadow-xs' },
                  { status: 'ABSENT' as AttendanceStatus, label: '결석', color: 'rose', unselected: 'border-rose-300/80 dark:border-rose-800/80 bg-rose-50/80 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 hover:bg-rose-100/80', selected: 'bg-rose-600 text-white border-rose-600 ring-2 ring-rose-400 shadow-xs' },
                  { status: 'EARLY_LEAVE' as AttendanceStatus, label: '조퇴', color: 'purple', unselected: 'border-purple-300/80 dark:border-purple-800/80 bg-purple-50/80 dark:bg-purple-950/30 text-purple-800 dark:text-purple-300 hover:bg-purple-100/80', selected: 'bg-purple-600 text-white border-purple-600 ring-2 ring-purple-400 shadow-xs' },
                  { status: 'EXCUSED' as AttendanceStatus, label: '인정', color: 'blue', unselected: 'border-blue-300/80 dark:border-blue-800/80 bg-blue-50/80 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 hover:bg-blue-100/80', selected: 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-400 shadow-xs' },
                  { status: 'NONE' as AttendanceStatus, label: '빈칸', color: 'slate', unselected: 'border-slate-300 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100/80', selected: 'bg-slate-700 text-white border-slate-700 ring-2 ring-slate-400 shadow-xs' }
                ]).map(({ status: st, label, unselected, selected }) => {
                  const isSelected = editingCell.currentStatus === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => {
                        // 다른 상태로 수정할 경우 기존 사유도 함께 초기화
                        const shouldClearReason = editingCell.currentStatus !== st;
                        setEditingCell({
                          ...editingCell,
                          currentStatus: st,
                          currentReason: shouldClearReason ? '' : editingCell.currentReason,
                        });
                      }}
                      className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        isSelected ? selected : unselected
                      }`}
                    >
                      <span className="flex items-center justify-center font-bold text-sm">
                        {st === 'NONE' ? '' : <StatusIcon status={st} size="sm" />}
                      </span>
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Check-In Timestamp Input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <span className="text-indigo-500 font-mono">🕒</span> 체크 시간 (HH:mm)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const cur = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                    setEditingCell({ ...editingCell, currentCheckInTime: cur });
                  }}
                  className="text-3xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                >
                  현재 시각 자동입력
                </button>
              </label>
              <input
                type="text"
                value={editingCell.currentCheckInTime || ''}
                onChange={e => setEditingCell({ ...editingCell, currentCheckInTime: e.target.value })}
                placeholder="예: 07:40, 17:35"
                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Reason / Memo Input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
                사유 및 특이사항 입력
              </label>
              <input
                type="text"
                value={editingCell.currentReason || ''}
                onChange={e => setEditingCell({ ...editingCell, currentReason: e.target.value })}
                placeholder="예: 병원 진료, 학원, 보강, 컨디션 난조..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
              {/* Quick suggestions */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {['병원 진료', '학원', '수행평가', '가족 행사', '컨디션 난조', '등교 지각'].map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setEditingCell({ ...editingCell, currentReason: tag })}
                    className="text-3xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 font-medium transition-colors"
                  >
                    +{tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
              <button
                onClick={() => setEditingCell(null)}
                className="px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 font-medium cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={() => {
                  onUpdateRecord(
                    editingCell.studentId,
                    editingCell.dateStr,
                    editingCell.currentStatus,
                    editingCell.currentReason,
                    editingCell.currentCheckInTime
                  );
                  setEditingCell(null);
                }}
                className="px-4 py-2 text-xs rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all shadow-xs cursor-pointer"
              >
                저장 완료
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Attendance Sheet Modal */}
      <PrintAttendanceModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        year={year}
        month={month}
        session={session}
        students={students}
        activeDays={activeDays}
        records={records}
        onSelectMonth={onMonthChange}
        onSelectSession={onSessionChange}
      />
    </div>
  );
};
