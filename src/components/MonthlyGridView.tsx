/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Student, 
  SessionType, 
  DayConfig, 
  AttendanceStatus, 
  AttendanceRecord,
  UserRole,
  Grade3ExclusionConfig
} from '../types/attendance';
import { StatusIcon } from './StatusIcon';
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Calendar, 
  Sparkles, 
  Search, 
  Filter, 
  RotateCcw,
  ChevronDown,
  X
} from 'lucide-react';
import { 
  getRecordKey, 
  isStudentExcluded 
} from '../utils/attendanceHelpers';

interface MonthlyGridViewProps {
  students: Student[];
  session: SessionType;
  year: number;
  month: number;
  activeDays: DayConfig[];
  records: Record<string, AttendanceRecord>;
  onUpdateRecord: (
    studentId: string,
    dateStr: string,
    status: AttendanceStatus,
    reason?: string,
    checkInTime?: string
  ) => void;
  onBatchUpdateDay: (dateStr: string, status: AttendanceStatus, gradeFilter?: number) => void;
  onFillDayAbsent: (dateStr: string, gradeFilter?: number) => void;
  onUpdateStudents: (students: Student[]) => void;
  onSessionChange: (session: SessionType) => void;
  onMonthChange: (month: number) => void;
  userRole: UserRole;
  grade3Exclusion?: Grade3ExclusionConfig;
}

// 내부 상태 순환 정의 (클릭 시 순서대로 변경)
const getNextStatusInternal = (current: AttendanceStatus): AttendanceStatus => {
  switch (current) {
    case 'NONE':
      return 'PRESENT';
    case 'PRESENT':
      return 'LATE';
    case 'LATE':
      return 'ABSENT';
    case 'ABSENT':
      return 'EARLY_LEAVE';
    case 'EARLY_LEAVE':
      return 'OFFICIAL_ABSENT';
    case 'OFFICIAL_ABSENT':
    default:
      return 'NONE';
  }
};

const getStatusName = (st: AttendanceStatus): string => {
  switch (st) {
    case 'PRESENT': return '출석';
    case 'LATE': return '지각';
    case 'ABSENT': return '결석';
    case 'EARLY_LEAVE': return '조퇴';
    case 'OFFICIAL_ABSENT': return '인정결석';
    default: return '미체크';
  }
};

export const MonthlyGridView: React.FC<MonthlyGridViewProps> = ({
  students,
  session,
  year,
  month,
  activeDays,
  records,
  onUpdateRecord,
  onBatchUpdateDay,
  onFillDayAbsent,
  userRole,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGrade, setSelectedGrade] = useState<number | 'all'>('all');
  const [activePopoverDate, setActivePopoverDate] = useState<string | null>(null);

  // 셀 상세 사유 입력 모달
  const [detailModal, setDetailModal] = useState<{
    isOpen: boolean;
    student?: Student;
    dateStr?: string;
    status: AttendanceStatus;
    reason: string;
    checkInTime: string;
  }>({
    isOpen: false,
    status: 'NONE',
    reason: '',
    checkInTime: ''
  });

  const isReadOnly = userRole === 'student';

  // 학년 및 검색 필터링
  const filteredStudents = useMemo(() => {
    return students.filter(st => {
      if (selectedGrade !== 'all' && st.grade !== selectedGrade) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      const code = `${st.grade}${String(st.classNumber).padStart(2, '0')}${String(st.studentNumber).padStart(2, '0')}`;
      return st.name.toLowerCase().includes(q) || code.includes(q) || String(st.studentNumber).includes(q);
    });
  }, [students, selectedGrade, searchQuery]);

  // 셀 단순 클릭 시 상태 순환 + Firestore 클라우드 즉시 전송
  const handleCellClick = (student: Student, dateStr: string) => {
    if (isReadOnly) return;
    if (isStudentExcluded(student, session, dateStr)) return;

    const key = getRecordKey(student.id, session, dateStr);
    const currentRec = records[key];
    const currentStatus = currentRec?.status || 'NONE';
    const nextStatus = getNextStatusInternal(currentStatus);

    const now = new Date();
    const currentTimestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const newCheckInTime = nextStatus !== 'NONE' ? (currentRec?.checkInTime || currentTimestamp) : undefined;

    onUpdateRecord(
      student.id,
      dateStr,
      nextStatus,
      currentRec?.reason,
      newCheckInTime
    );
  };

  // 셀 우클릭 시 상세 모달 열기
  const handleCellContextMenu = (e: React.MouseEvent, student: Student, dateStr: string) => {
    e.preventDefault();
    if (isReadOnly) return;
    if (isStudentExcluded(student, session, dateStr)) return;

    const key = getRecordKey(student.id, session, dateStr);
    const rec = records[key] || { status: 'NONE' };

    setDetailModal({
      isOpen: true,
      student,
      dateStr,
      status: rec.status,
      reason: rec.reason || '',
      checkInTime: rec.checkInTime || ''
    });
  };

  // 상세 모달 저장
  const handleSaveDetailModal = () => {
    if (!detailModal.student || !detailModal.dateStr) return;
    
    onUpdateRecord(
      detailModal.student.id,
      detailModal.dateStr,
      detailModal.status,
      detailModal.reason.trim() || undefined,
      detailModal.checkInTime.trim() || undefined
    );

    setDetailModal(prev => ({ ...prev, isOpen: false }));
  };

  // 학생별 개별 통계 계산
  const calcStudentStats = (st: Student) => {
    let present = 0;
    let late = 0;
    let absent = 0;
    let early = 0;
    let official = 0;
    let totalActiveDays = 0;

    activeDays.forEach(d => {
      if (isStudentExcluded(st, session, d.dateStr)) return;
      totalActiveDays++;
      const key = getRecordKey(st.id, session, d.dateStr);
      const rec = records[key];
      if (rec?.status === 'PRESENT') present++;
      else if (rec?.status === 'LATE') late++;
      else if (rec?.status === 'ABSENT') absent++;
      else if (rec?.status === 'EARLY_LEAVE') early++;
      else if (rec?.status === 'OFFICIAL_ABSENT') official++;
    });

    const attended = present + late;
    const rate = totalActiveDays > 0 ? ((attended / totalActiveDays) * 100).toFixed(1) : '0.0';

    return { present, late, absent, early, official, totalActiveDays, rate };
  };

  // 전체 요약 통계 계산
  const overallStats = useMemo(() => {
    let totalSlots = 0;
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;

    activeDays.forEach(day => {
      students.forEach(st => {
        if (!st.active || isStudentExcluded(st, session, day.dateStr)) return;
        totalSlots++;
        const key = getRecordKey(st.id, session, day.dateStr);
        const rec = records[key];
        if (rec?.status === 'PRESENT') presentCount++;
        else if (rec?.status === 'LATE') lateCount++;
        else if (rec?.status === 'ABSENT') absentCount++;
      });
    });

    const checkedTotal = presentCount + lateCount;
    const rate = totalSlots > 0 ? ((checkedTotal / totalSlots) * 100).toFixed(1) : '0.0';

    return {
      totalSlots,
      presentCount,
      lateCount,
      absentCount,
      rate
    };
  }, [students, activeDays, records, session]);

  return (
    <div className="space-y-4 animate-fade-in">
      
      {/* 상단 4대 현황 카드 배너 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-2xs font-bold text-slate-500 dark:text-slate-400">등록 학생수</div>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{students.length}명</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-2xs font-bold text-emerald-600 dark:text-emerald-400">정상 출석 누적</div>
            <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{overallStats.presentCount}회</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-2xs font-bold text-amber-600 dark:text-amber-400">지각 누적</div>
            <div className="text-xl font-black text-amber-600 dark:text-amber-400 mt-0.5">{overallStats.lateCount}회</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-2xs font-bold text-slate-500 dark:text-slate-400">월간 평균 출석률</div>
            <div className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-0.5">{overallStats.rate}%</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/50 flex items-center justify-center text-purple-600 dark:text-purple-400">
            <Calendar className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 필터 및 검색 바 */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        
        {/* 학년 필터 */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1 mr-1">
            <Filter className="w-3.5 h-3.5" />
            학년:
          </span>
          {(['all', 3, 2, 1] as const).map(g => (
            <button
              key={g}
              onClick={() => setSelectedGrade(g)}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedGrade === g
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {g === 'all' ? `전체 (${students.length})` : `${g}학년`}
            </button>
          ))}
        </div>

        {/* 이름/학번 검색 */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="이름 또는 학번 검색..."
            className="w-full text-xs pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* 메인 출석부 테이블 컨테이너 */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xl overflow-hidden relative">
        <div className="overflow-x-auto max-h-[calc(100vh-320px)] overflow-y-auto">
          <table className="w-full text-xs border-collapse">
            
            {/* 테이블 헤더 */}
            <thead className="bg-slate-50/95 dark:bg-slate-800/95 sticky top-0 z-30 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 select-none">
              <tr>
                <th className="py-2.5 px-3 sticky left-0 z-40 bg-slate-100 dark:bg-slate-800 min-w-[70px] border-r border-slate-200 dark:border-slate-700 text-center font-bold">
                  학번
                </th>
                <th className="py-2.5 px-3 sticky left-[70px] z-40 bg-slate-100 dark:bg-slate-800 min-w-[80px] border-r border-slate-200 dark:border-slate-700 shadow-xs text-center font-bold">
                  이름
                </th>

                {/* 날짜별 열 헤더 */}
                {activeDays.map(d => (
                  <th key={d.dateStr} className="py-2 px-1 min-w-[44px] border-r border-slate-200 dark:border-slate-700 text-center relative group">
                    <div className="text-2xs font-bold text-slate-900 dark:text-slate-100 font-mono">{d.dayNum}</div>
                    <div className={`text-3xs font-semibold ${
                      d.dayOfWeek === '토' ? 'text-blue-500' : d.dayOfWeek === '일' ? 'text-rose-500' : 'text-slate-400'
                    }`}>
                      {d.dayOfWeek}
                    </div>

                    {/* 일괄 처리 메뉴 트리거 */}
                    {!isReadOnly && (
                      <div className="mt-0.5">
                        <button
                          onClick={() => setActivePopoverDate(activePopoverDate === d.dateStr ? null : d.dateStr)}
                          className="p-0.5 rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="일괄 출결 메뉴"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>

                        {/* 일괄 처리 팝오버 */}
                        {activePopoverDate === d.dateStr && (
                          <div 
                            className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-32 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 p-1 z-50 text-left space-y-0.5 animate-scale-up"
                            onClick={e => e.stopPropagation()}
                          >
                            <button
                              onClick={() => {
                                onBatchUpdateDay(d.dateStr, 'PRESENT', selectedGrade === 'all' ? undefined : selectedGrade);
                                setActivePopoverDate(null);
                              }}
                              className="w-full text-3xs px-2 py-1.5 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 font-bold flex items-center gap-1.5"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>전원 출석 (○)</span>
                            </button>
                            <button
                              onClick={() => {
                                onFillDayAbsent(d.dateStr, selectedGrade === 'all' ? undefined : selectedGrade);
                                setActivePopoverDate(null);
                              }}
                              className="w-full text-3xs px-2 py-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 font-bold flex items-center gap-1.5"
                            >
                              <XCircle className="w-3 h-3" />
                              <span>미체크 ➔ 결석</span>
                            </button>
                            <button
                              onClick={() => {
                                onBatchUpdateDay(d.dateStr, 'NONE', selectedGrade === 'all' ? undefined : selectedGrade);
                                setActivePopoverDate(null);
                              }}
                              className="w-full text-3xs px-2 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold flex items-center gap-1.5"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>전체 비우기</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </th>
                ))}

                {/* 통계 열 헤더 */}
                <th className="py-2.5 px-2.5 min-w-[55px] border-r border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/80 text-center font-bold text-indigo-600 dark:text-indigo-400">
                  출석률
                </th>
                <th className="py-2.5 px-2 min-w-[40px] border-r border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/80 text-center font-bold text-emerald-600">
                  출석
                </th>
                <th className="py-2.5 px-2 min-w-[40px] border-r border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/80 text-center font-bold text-amber-600">
                  지각
                </th>
                <th className="py-2.5 px-2 min-w-[40px] border-r border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/80 text-center font-bold text-rose-600">
                  결석
                </th>
                <th className="py-2.5 px-2 min-w-[40px] border-r border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/80 text-center font-bold text-purple-600">
                  조퇴
                </th>
                <th className="py-2.5 px-2 min-w-[40px] bg-slate-100/80 dark:bg-slate-800/80 text-center font-bold text-blue-600">
                  인정
                </th>
              </tr>
            </thead>

            {/* 테이블 바디 */}
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
              {filteredStudents.map((st) => {
                const fullCode = `${st.grade}${String(st.classNumber).padStart(2, '0')}${String(st.studentNumber).padStart(2, '0')}`;
                const studentStats = calcStudentStats(st);

                return (
                  <tr key={st.id} className="hover:bg-indigo-50/40 dark:hover:bg-indigo-950/30 transition-colors">
                    
                    {/* 고정 열 1: 학번 */}
                    <td className="py-1 px-2 sticky left-0 z-20 bg-white dark:bg-slate-900 font-mono font-bold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800 text-center text-2xs">
                      {fullCode}
                    </td>

                    {/* 고정 열 2: 이름 & 좌석 */}
                    <td className="py-1 px-2.5 sticky left-[70px] z-20 bg-white dark:bg-slate-900 font-black border-r border-slate-200 dark:border-slate-800 shadow-xs text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <span>{st.name}</span>
                        {st.seatNumber && (
                          <span className="text-3xs font-mono px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-400 font-normal">
                            {st.seatNumber}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 출결 셀 목록 */}
                    {activeDays.map(d => {
                      const key = getRecordKey(st.id, session, d.dateStr);
                      const rec = records[key];
                      const isExcl = isStudentExcluded(st, session, d.dateStr);

                      if (isExcl) {
                        return (
                          <td 
                            key={d.dateStr} 
                            className="p-0 border-r border-slate-100 dark:border-slate-800/60 bg-slate-100/60 dark:bg-slate-950/60 text-slate-300 dark:text-slate-600 text-center select-none"
                          >
                            <span className="text-3xs font-medium">제외</span>
                          </td>
                        );
                      }

                      return (
                        <td
                          key={d.dateStr}
                          onClick={() => handleCellClick(st, d.dateStr)}
                          onContextMenu={e => handleCellContextMenu(e, st, d.dateStr)}
                          className={`p-0 border-r border-slate-100 dark:border-slate-800/60 text-center transition-all select-none cursor-pointer hover:ring-2 hover:ring-indigo-400/50 hover:z-10 ${
                            rec?.status === 'PRESENT'
                              ? 'bg-emerald-50/40 dark:bg-emerald-950/20'
                              : rec?.status === 'LATE'
                              ? 'bg-amber-50/40 dark:bg-amber-950/20'
                              : rec?.status === 'ABSENT'
                              ? 'bg-rose-50/40 dark:bg-rose-950/20'
                              : rec?.status === 'EARLY_LEAVE'
                              ? 'bg-purple-50/40 dark:bg-purple-950/20'
                              : rec?.status === 'OFFICIAL_ABSENT'
                              ? 'bg-blue-50/40 dark:bg-blue-950/20'
                              : ''
                          }`}
                          title={rec?.reason ? `[${getStatusName(rec.status)}] 사유: ${rec.reason} (${rec.checkInTime || ''})` : undefined}
                        >
                          <div className="h-9 w-full flex items-center justify-center relative">
                            <StatusIcon status={rec?.status || 'NONE'} />
                            {rec?.reason && (
                              <span className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-xs" />
                            )}
                          </div>
                        </td>
                      );
                    })}

                    {/* 학생별 누적 통계 열 */}
                    <td className="py-1 px-2 border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-center font-mono font-black text-indigo-600 dark:text-indigo-400">
                      {studentStats.rate}%
                    </td>
                    <td className="py-1 px-1.5 border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-center font-mono font-bold text-emerald-600">
                      {studentStats.present}
                    </td>
                    <td className="py-1 px-1.5 border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-center font-mono font-bold text-amber-600">
                      {studentStats.late}
                    </td>
                    <td className="py-1 px-1.5 border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-center font-mono font-bold text-rose-600">
                      {studentStats.absent}
                    </td>
                    <td className="py-1 px-1.5 border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-center font-mono font-bold text-purple-600">
                      {studentStats.early}
                    </td>
                    <td className="py-1 px-1.5 bg-slate-50/50 dark:bg-slate-800/30 text-center font-mono font-bold text-blue-600">
                      {studentStats.official}
                    </td>

                  </tr>
                );
              })}
            </tbody>

          </table>
        </div>
      </div>

      {/* 우클릭 상세 사유 입력 모달 */}
      {detailModal.isOpen && detailModal.student && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-5 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    {detailModal.student.name} 출결 수정
                  </h3>
                  <div className="text-3xs text-slate-400 font-mono">
                    {detailModal.dateStr} · {session === 'morning' ? '아침 자습' : '야간 자습'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setDetailModal(prev => ({ ...prev, isOpen: false }))}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-2xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  출결 상태 변경
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['PRESENT', 'LATE', 'ABSENT', 'EARLY_LEAVE', 'OFFICIAL_ABSENT', 'NONE'] as const).map(st => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setDetailModal(prev => ({ ...prev, status: st }))}
                      className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        detailModal.status === st
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                          : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      {getStatusName(st)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-2xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  입실 시각 (HH:mm)
                </label>
                <input
                  type="text"
                  value={detailModal.checkInTime}
                  onChange={e => setDetailModal(prev => ({ ...prev, checkInTime: e.target.value }))}
                  placeholder="예: 07:25"
                  className="w-full text-xs px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="text-2xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  사유 및 비고
                </label>
                <textarea
                  value={detailModal.reason}
                  onChange={e => setDetailModal(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="지각/결석/조퇴 사유 입력..."
                  rows={2}
                  className="w-full text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDetailModal(prev => ({ ...prev, isOpen: false }))}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveDetailModal}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 shadow-md transition-all cursor-pointer"
              >
                저장 및 동기화
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
