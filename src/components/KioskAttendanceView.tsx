/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Student, 
  AttendanceRecord, 
  AttendanceStatus, 
  SessionType, 
  UserRole 
} from '../types/attendance';
import { 
  getRecordKey, 
  isStudentExcluded 
} from '../utils/attendanceHelpers';
import { 
  Sun, 
  Moon, 
  Clock, 
  Volume2, 
  VolumeX, 
  Search, 
  Delete, 
  CheckCircle2, 
  Sparkles, 
  UserCheck, 
  Settings2, 
  RefreshCw, 
  X 
} from 'lucide-react';

interface KioskAttendanceViewProps {
  students: Student[];
  session: SessionType;
  setSession: (session: SessionType) => void;
  activeDays: Array<{ dateStr: string; dayNum: number; dayOfWeek: string; enabled: boolean }>;
  selectedDateStr: string;
  setSelectedDateStr: (date: string) => void;
  records: Record<string, AttendanceRecord>;
  onUpdateRecord: (
    studentId: string,
    dateStr: string,
    status: AttendanceStatus,
    reason?: string,
    checkInTime?: string
  ) => void;
  userRole: UserRole;
  onExitKiosk?: () => void;
}

// 5자리 학번 문자열 생성 (예: 3학년 1반 19번 -> "30119")
const getFullCode = (st: Student): string => {
  const classStr = String(st.classNumber).padStart(2, '0');
  const numStr = String(st.studentNumber).padStart(2, '0');
  return `${st.grade}${classStr}${numStr}`;
};

export const KioskAttendanceView: React.FC<KioskAttendanceViewProps> = ({
  students,
  session,
  setSession,
  activeDays,
  selectedDateStr,
  setSelectedDateStr,
  records,
  onUpdateRecord,
  userRole,
  onExitKiosk
}) => {
  // --- 화면 높이 기반 자동 비율 축소(Auto-Scale) 로직 ---
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number>(1);

  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !contentRef.current) return;
      const availableHeight = containerRef.current.clientHeight;
      const availableWidth = containerRef.current.clientWidth;
      const originalHeight = contentRef.current.offsetHeight;
      const originalWidth = contentRef.current.offsetWidth;

      if (originalHeight > 0 && availableHeight > 0) {
        const scaleH = (availableHeight - 16) / originalHeight;
        const scaleW = availableWidth / originalWidth;
        const calculatedScale = Math.min(scaleH, scaleW, 1);
        setScale(Math.max(calculatedScale, 0.5));
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    const timeoutId = setTimeout(handleResize, 200);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, [students, session, records]);

  // --- 실시간 시계 & 테스트 모드 로직 ---
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [testTimeOffsetMinutes, setTestTimeOffsetMinutes] = useState<number | null>(null);
  const [isTestModeOpen, setIsTestModeOpen] = useState<boolean>(false);
  const [customTestTimeStr, setCustomTestTimeStr] = useState<string>('07:25');

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const effectiveTime = useMemo(() => {
    if (testTimeOffsetMinutes === null) return currentTime;
    return new Date(currentTime.getTime() + testTimeOffsetMinutes * 60 * 1000);
  }, [currentTime, testTimeOffsetMinutes]);

  const currentHour = effectiveTime.getHours();
  const currentMinute = effectiveTime.getMinutes();
  const currentSecond = effectiveTime.getSeconds();
  const currentTimeString = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;

  // 날짜 계산
  const effectiveDateStr = useMemo(() => {
    const y = effectiveTime.getFullYear();
    const m = String(effectiveTime.getMonth() + 1).padStart(2, '0');
    const d = String(effectiveTime.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [effectiveTime]);

  const dateToUse = useMemo(() => {
    const isActive = activeDays.some(d => d.dateStr === effectiveDateStr);
    if (isActive) return effectiveDateStr;
    return selectedDateStr || effectiveDateStr;
  }, [activeDays, effectiveDateStr, selectedDateStr]);

  const dayOfWeekStr = useMemo(() => {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return days[effectiveTime.getDay()];
  }, [effectiveTime]);

  // 자습 판정 기준
  const isLate = useMemo(() => {
    const timeVal = currentHour * 60 + currentMinute;
    if (session === 'morning') {
      return timeVal >= 7 * 60 + 30; // 07:30 이후 지각
    } else {
      return timeVal >= 18 * 60 + 30; // 18:30 이후 지각
    }
  }, [session, currentHour, currentMinute]);

  // 음성 안내 설정
  const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(true);
  const speakMessage = (text: string) => {
    if (!isAudioEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('TTS error:', e);
    }
  };

  // 키패드 입력 상태
  const [inputCode, setInputCode] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [gradeFilter, setGradeFilter] = useState<number | 'all'>('all');
  const [recentCheckin, setRecentCheckin] = useState<{
    student: Student;
    status: AttendanceStatus;
    timeStr: string;
    message: string;
  } | null>(null);

  // 대상 학생 필터링
  const applicableStudents = useMemo(() => {
    return students.filter(st => st.active && !isStudentExcluded(st, session, dateToUse));
  }, [students, session, dateToUse]);

  const filteredStudents = useMemo(() => {
    return applicableStudents.filter(st => {
      if (gradeFilter !== 'all' && st.grade !== gradeFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      const code = getFullCode(st);
      return st.name.toLowerCase().includes(q) || code.includes(q) || String(st.studentNumber).includes(q);
    });
  }, [applicableStudents, gradeFilter, searchQuery]);

  // 출결 현황 통계
  const stats = useMemo(() => {
    let present = 0;
    let late = 0;
    let absent = 0;
    let early = 0;
    let official = 0;
    let unchecked = 0;

    applicableStudents.forEach(st => {
      const key = getRecordKey(st.id, session, dateToUse);
      const rec = records[key];
      if (!rec || rec.status === 'NONE') unchecked++;
      else if (rec.status === 'PRESENT') present++;
      else if (rec.status === 'LATE') late++;
      else if (rec.status === 'ABSENT') absent++;
      else if (rec.status === 'EARLY_LEAVE') early++;
      else if (rec.status === 'OFFICIAL_ABSENT') official++;
    });

    return {
      total: applicableStudents.length,
      present,
      late,
      absent,
      early,
      official,
      unchecked
    };
  }, [applicableStudents, records, session, dateToUse]);

  // 입실 처리 실행 함수
  const handleCheckin = (student: Student) => {
    const key = getRecordKey(student.id, session, dateToUse);
    const existingRec = records[key];

    if (existingRec && existingRec.status !== 'NONE') {
      const statusText = existingRec.status === 'PRESENT' ? '출석' : existingRec.status === 'LATE' ? '지각' : '입실';
      const msg = `${student.name} 학생은 이미 ${statusText} 처리되었습니다.`;
      setRecentCheckin({
        student,
        status: existingRec.status,
        timeStr: existingRec.checkInTime || currentTimeString,
        message: msg
      });
      speakMessage(`${student.name} 학생, 이미 확인되었습니다.`);
      setInputCode('');
      return;
    }

    const determinedStatus: AttendanceStatus = isLate ? 'LATE' : 'PRESENT';
    onUpdateRecord(student.id, dateToUse, determinedStatus, undefined, currentTimeString);

    const msg = isLate 
      ? `${student.name} 학생, 지각 입실 처리되었습니다 (${currentTimeString})`
      : `${student.name} 학생, 정상 출석 확인되었습니다 (${currentTimeString})`;

    setRecentCheckin({
      student,
      status: determinedStatus,
      timeStr: currentTimeString,
      message: msg
    });

    speakMessage(isLate ? `${student.name}, 지각입니다.` : `${student.name} 학생, 출석 완료.`);
    setInputCode('');
  };

  // 키패드 번호 입력으로 제출
  const handleCodeSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputCode.trim()) return;

    const trimmed = inputCode.trim();
    const found = applicableStudents.find(st => {
      const fullCode = getFullCode(st);
      return fullCode === trimmed || String(st.studentNumber) === trimmed || `${st.grade}${st.classNumber}${String(st.studentNumber).padStart(2, '0')}` === trimmed;
    });

    if (found) {
      handleCheckin(found);
    } else {
      speakMessage('일치하는 학생 번호를 찾을 수 없습니다.');
      alert(`[${trimmed}] 번호의 미래인재반 학생을 찾을 수 없습니다.`);
      setInputCode('');
    }
  };

  const handleKeypadPress = (val: string) => {
    if (inputCode.length < 5) {
      setInputCode(prev => prev + val);
    }
  };

  const handleKeypadBackspace = () => {
    setInputCode(prev => prev.slice(0, -1));
  };

  return (
    <div 
      ref={containerRef} 
      className="w-full h-[calc(100vh-140px)] min-h-[600px] flex items-center justify-center overflow-hidden"
    >
      <div 
        ref={contentRef}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
          transition: 'transform 0.15s ease-out'
        }}
        className="w-full max-w-7xl mx-auto space-y-3.5 pb-2"
      >
        {/* 상단 헤더 섹션 */}
        <div className="bg-slate-900 dark:bg-slate-900 text-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-800 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-indigo-500/20 to-purple-600/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

          <div className="flex flex-col lg:flex-row items-center justify-between gap-5 relative z-10">
            {/* 좌측 안내 문구 */}
            <div className="text-center lg:text-left space-y-1.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/80 border border-indigo-700/60 text-indigo-300 text-xs font-bold">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                <span>교실 앞 입실 키오스크</span>
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-2xs text-indigo-200">
                  {session === 'morning' ? '☀️ 아침 자율학습 (07:30 기준)' : '🌙 야간 자율학습 (18:30 기준)'}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center justify-center lg:justify-start gap-2">
                <span>숭신고 미래인재반 자습 입실 체크</span>
              </h1>
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 text-xs text-slate-300">
                <span>출결 판정 기준:</span>
                <span className="font-semibold text-amber-300 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40">
                  {session === 'morning' ? '☀️ 07:30 이전 [출석 ○] · 07:30 이후 [지각 △]' : '🌙 18:30 이전 [출석 ○] · 18:30 이후 [지각 △]'}
                </span>
                <span className={`px-2 py-0.5 rounded font-bold border ${isLate ? 'bg-rose-950/60 border-rose-700 text-rose-300' : 'bg-emerald-950/60 border-emerald-700 text-emerald-300'}`}>
                  {isLate ? '현재 시각: 지각 대상 시간' : '현재 시각: 정상 출석 시간'}
                </span>
                <button
                  onClick={() => setIsAudioEnabled(!isAudioEnabled)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-bold transition-colors ${
                    isAudioEnabled ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700' : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  {isAudioEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                  <span>{isAudioEnabled ? '음성 켬' : '음성 끔'}</span>
                </button>
              </div>
            </div>

            {/* 우측 초대형 시계 & 날짜 */}
            <div className="flex flex-col items-center lg:items-end bg-slate-950/80 px-6 py-3.5 rounded-2xl border border-slate-800 shadow-inner">
              <div className="text-xs sm:text-sm font-semibold text-indigo-300 tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>{effectiveDateStr} ({dayOfWeekStr}요일)</span>
              </div>
              <div className="text-3xl sm:text-4xl lg:text-5xl font-black font-mono tracking-tight text-white drop-shadow-md flex items-baseline gap-1">
                <span>{currentTimeString}</span>
                <span className="text-xl sm:text-2xl text-indigo-400 font-semibold">:{String(currentSecond).padStart(2, '0')}</span>
              </div>
            </div>
          </div>

          {/* 중앙 요약 뱃지 4개 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-4 border-t border-slate-800/80">
            <div className="bg-slate-800/60 rounded-xl p-2.5 text-center border border-slate-700/50">
              <div className="text-2xs sm:text-xs text-slate-400 font-bold">자습 대상 총원</div>
              <div className="text-lg sm:text-xl font-black text-white">{stats.total}명</div>
            </div>
            <div className="bg-emerald-950/40 rounded-xl p-2.5 text-center border border-emerald-800/40">
              <div className="text-2xs sm:text-xs text-emerald-400 font-bold">정상 출석 (○)</div>
              <div className="text-lg sm:text-xl font-black text-emerald-400">{stats.present}명</div>
            </div>
            <div className="bg-amber-950/40 rounded-xl p-2.5 text-center border border-amber-800/40">
              <div className="text-2xs sm:text-xs text-amber-400 font-bold">지각 입실 (△)</div>
              <div className="text-lg sm:text-xl font-black text-amber-400">{stats.late}명</div>
            </div>
            <div className="bg-rose-950/40 rounded-xl p-2.5 text-center border border-rose-800/40">
              <div className="text-2xs sm:text-xs text-rose-400 font-bold">미체크 인원</div>
              <div className="text-lg sm:text-xl font-black text-rose-400">{stats.unchecked}명</div>
            </div>
          </div>
        </div>

        {/* 2단 메인 인터페이스 (좌: 키패드, 우: 간편 터치 명단) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
          
          {/* 좌측: 학번 5자리 키패드 입력 */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  본인 학번 입력 (5자리)
                </span>
                <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                  예: 3학년 1반 19번 ➔ 30119
                </span>
              </div>

              {/* 입력 디스플레이 */}
              <div className="relative mb-3.5">
                <input
                  type="text"
                  value={inputCode}
                  onChange={e => setInputCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCodeSubmit();
                  }}
                  placeholder="학번(5자리) 또는 이름 터치"
                  className="w-full text-center text-xl sm:text-2xl font-black tracking-widest py-3 px-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border-2 border-indigo-500/80 focus:outline-hidden focus:ring-4 focus:ring-indigo-500/20 text-slate-900 dark:text-white placeholder:text-slate-400 placeholder:text-base placeholder:font-normal transition-all"
                  autoFocus
                />
              </div>

              {/* 터치 키패드 (1~9, 0, 지우기, 확인) */}
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleKeypadPress(String(num))}
                    className="h-11 sm:h-12 text-lg sm:text-xl font-black rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 active:scale-95 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 transition-all shadow-2xs flex items-center justify-center cursor-pointer select-none"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleKeypadBackspace}
                  className="h-11 sm:h-12 rounded-xl bg-slate-200 dark:bg-slate-800/80 hover:bg-rose-100 dark:hover:bg-rose-950/50 active:scale-95 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 transition-all shadow-2xs flex items-center justify-center cursor-pointer select-none"
                >
                  <Delete className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleKeypadPress('0')}
                  className="h-11 sm:h-12 text-lg sm:text-xl font-black rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 active:scale-95 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 transition-all shadow-2xs flex items-center justify-center cursor-pointer select-none"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => handleCodeSubmit()}
                  className="h-11 sm:h-12 text-sm sm:text-base font-black rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 active:scale-95 text-white shadow-md shadow-indigo-600/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>입실</span>
                </button>
              </div>
            </div>

            {/* 키패드 하단 부가 안내 & 시간 테스트 모달 트리거 */}
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-2xs text-slate-400">
              <span>* 키보드 숫자 키 또는 화면 번호 터치</span>
              <button
                onClick={() => setIsTestModeOpen(true)}
                className="text-slate-400 hover:text-indigo-500 inline-flex items-center gap-1 font-medium transition-colors"
              >
                <Settings2 className="w-3 h-3" />
                <span>시간 테스트</span>
              </button>
            </div>
          </div>

          {/* 우측: 학생 간편 터치 명단 & 최근 입실 피드 */}
          <div className="lg:col-span-7 space-y-3">
            
            {/* 학생 카드 목록 (터치 즉시 입실) */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 shadow-xl border border-slate-200 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 mb-3">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  학생 간편 터치 입실 (이름 터치 시 즉시 출결 완료)
                </span>

                {/* 학년 필터 & 검색 */}
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700 text-2xs font-bold">
                    {(['all', 3, 2, 1] as const).map(g => (
                      <button
                        key={g}
                        onClick={() => setGradeFilter(g)}
                        className={`px-2 py-0.5 rounded-md transition-all ${
                          gradeFilter === g 
                            ? 'bg-indigo-600 text-white shadow-2xs' 
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        {g === 'all' ? `전체 (${applicableStudents.length})` : `${g}학년`}
                      </button>
                    ))}
                  </div>

                  <div className="relative flex-1 sm:w-36">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="이름/학번 검색..."
                      className="w-full text-2xs pl-6 pr-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* 학생 버튼 그리드 */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[220px] overflow-y-auto pr-1">
                {filteredStudents.map(st => {
                  const key = getRecordKey(st.id, session, dateToUse);
                  const rec = records[key];
                  const fullCode = getFullCode(st);
                  const isChecked = rec && rec.status !== 'NONE';

                  let statusBadge = (
                    <span className="text-3xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
                      미체크
                    </span>
                  );
                  let cardBg = 'bg-white dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-indigo-400 hover:shadow-md';

                  if (rec?.status === 'PRESENT') {
                    statusBadge = (
                      <span className="text-3xs px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 font-bold">
                        ○ 출석 ({rec.checkInTime || '완료'})
                      </span>
                    );
                    cardBg = 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/80 text-emerald-900 dark:text-emerald-200 shadow-2xs';
                  } else if (rec?.status === 'LATE') {
                    statusBadge = (
                      <span className="text-3xs px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 font-bold">
                        △ 지각 ({rec.checkInTime || '완료'})
                      </span>
                    );
                    cardBg = 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/80 text-amber-900 dark:text-amber-200 shadow-2xs';
                  }

                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => handleCheckin(st)}
                      className={`flex flex-col items-center justify-center p-2 rounded-2xl border transition-all active:scale-95 cursor-pointer ${cardBg}`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className={`text-2xs font-mono font-bold ${isChecked ? 'opacity-80' : 'text-indigo-600 dark:text-indigo-400'}`}>
                          {fullCode}
                        </span>
                        {statusBadge}
                      </div>
                      <div className="text-sm font-black tracking-tight">{st.name}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 실시간 알림 피드 */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-3.5 shadow-xl border border-slate-200 dark:border-slate-800">
              <div className="text-2xs font-bold text-slate-500 dark:text-slate-400 flex items-center justify-between mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-indigo-500" />
                  실시간 최근 입실 기록
                </span>
                <span className="text-3xs font-mono text-slate-400">자동 갱신 중</span>
              </div>

              {recentCheckin ? (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800/80 animate-fade-in">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    <span className="text-xs font-black text-slate-900 dark:text-white">
                      {recentCheckin.student.name} ({getFullCode(recentCheckin.student)})
                    </span>
                    <span className="text-2xs text-slate-600 dark:text-slate-300">
                      {recentCheckin.message}
                    </span>
                  </div>
                  <span className="text-2xs font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800">
                    {recentCheckin.timeStr}
                  </span>
                </div>
              ) : (
                <div className="text-center py-2 text-2xs text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  아직 입실한 학생이 없습니다. 번호를 입력하거나 이름을 터치하세요.
                </div>
              )}
            </div>

          </div>
        </div>

        {/* 시간 테스트 모달 */}
        {isTestModeOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-5 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Settings2 className="w-4 h-4 text-indigo-500" />
                  키오스크 시간 가상 테스트
                </h3>
                <button
                  onClick={() => setIsTestModeOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-2xs text-slate-500 dark:text-slate-400 leading-relaxed">
                출석/지각 판정을 미리 검증해볼 수 있는 테스트 도구입니다. 원하는 시각을 설정해보세요.
              </p>

              <div className="space-y-2">
                <label className="text-2xs font-bold text-slate-700 dark:text-slate-300">
                  가상 테스트 시각 설정 (HH:mm)
                </label>
                <div className="flex gap-2">
                  <input
                    type="time"
                    value={customTestTimeStr}
                    onChange={e => setCustomTestTimeStr(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-mono font-bold"
                  />
                  <button
                    onClick={() => {
                      const [h, m] = customTestTimeStr.split(':').map(Number);
                      const targetTotalMin = h * 60 + m;
                      const realTotalMin = currentTime.getHours() * 60 + currentTime.getMinutes();
                      setTestTimeOffsetMinutes(targetTotalMin - realTotalMin);
                      setIsTestModeOpen(false);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 transition-colors"
                  >
                    적용
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => {
                    const [h, m] = [7, 25];
                    const realTotalMin = currentTime.getHours() * 60 + currentTime.getMinutes();
                    setTestTimeOffsetMinutes(h * 60 + m - realTotalMin);
                    setIsTestModeOpen(false);
                  }}
                  className="py-1.5 px-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-2xs font-bold hover:bg-emerald-100"
                >
                  ☀️ 아침 정상 (07:25)
                </button>
                <button
                  onClick={() => {
                    const [h, m] = [7, 35];
                    const realTotalMin = currentTime.getHours() * 60 + currentTime.getMinutes();
                    setTestTimeOffsetMinutes(h * 60 + m - realTotalMin);
                    setIsTestModeOpen(false);
                  }}
                  className="py-1.5 px-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-2xs font-bold hover:bg-rose-100"
                >
                  ☀️ 아침 지각 (07:35)
                </button>
              </div>

              {testTimeOffsetMinutes !== null && (
                <button
                  onClick={() => {
                    setTestTimeOffsetMinutes(null);
                    setIsTestModeOpen(false);
                  }}
                  className="w-full py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-2xs font-bold hover:bg-slate-300 flex items-center justify-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>실제 현재 시각으로 초기화</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
