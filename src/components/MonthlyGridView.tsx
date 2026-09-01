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
  Clock, 
  ShieldCheck, 
  Minus,
  Search, 
  Filter, 
  ChevronRight, 
  ChevronLeft,
  Calendar,
  Sparkles,
  Info,
  Check,
  UserX,
  MessageSquare
} from 'lucide-react';
import { 
  getRecordKey, 
  isStudentExcluded, 
  isStudentExcludedOnDate, 
  getNextStatus, 
  getStatusLabel 
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
  onUpdateStudents,
  onSessionChange,
  onMonthChange,
  userRole,
  grade3Exclusion
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGrade, setSelectedGrade] = useState<number | 'all'>('all');
  const [activeCellModal, setActiveCellModal] = useState<{
    isOpen: boolean;
    student?: Student;
    dateStr?: string;
    currentRecord?: AttendanceRecord;
  }>({ isOpen: false });

  const [modalReason, setModalReason] = useState('');
  const [modalStatus, setModalStatus] = useState<AttendanceStatus>('PRESENT');
  const [modalCheckInTime, setModalCheckInTime] = useState('');

  const isReadOnly = userRole === 'student';

  // 학년 필터링 & 검색 필터링
  const filteredStudents = useMemo(() => {
    return students.filter(st => {
      if (selectedGrade !== 'all' && st.grade !== selectedGrade) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      const code = `${st.grade}${String(st.classNumber).padStart(2, '0')}${String(st.studentNumber).padStart(2, '0')}`;
      return st.name.toLowerCase().includes(q) || code.includes(q) || String(st.studentNumber).includes(q);
    });
  }, [students, selectedGrade, searchQuery]);

  // 셀 단순 클릭 시 상태 순환 (○ -> △ -> Ø -> 인 -> X -> 빈칸) 및 클라우드 즉시 전송
  const handleCellClick = (student: Student, dateStr: string) => {
    if (isReadOnly) return;
    if (isStudentExcluded(student, session, dateStr)) return;

    const key = getRecordKey(student.id, session, dateStr);
    const currentRec = records[key];
    const currentStatus = currentRec?.status || 'NONE';
    const nextStatus = getNextStatus(currentStatus);

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    onUpdateRecord(
      student.id,
      dateStr,
      nextStatus,
      currentRec?.reason,
      nextStatus !== 'NONE' ? (currentRec?.checkInTime || timeStr) : undefined
    );
  };

  // 셀 우클릭 / 롱터치 상세 모달 열기
  const handleCellContextMenu = (e: React.MouseEvent, student: Student, dateStr: string) => {
    e.preventDefault();
    if (isReadOnly) return;
    if (isStudentExcluded(student, session, dateStr)) return;

    const key = getRecordKey(student.id, session, dateStr);
    const rec = records[key] || { status: 'NONE' };
    
    setModalStatus(rec.status);
    setModalReason(rec.reason || '');
    setModalCheckInTime(rec.checkInTime || '');
    setActiveCellModal({
      isOpen: true,
      student,
      dateStr,
      currentRecord: rec
    });
  };

  // 상세 모달 저장 및 클라우드 즉시 전송
  const handleSaveModal = () => {
    if (!activeCellModal.student || !activeCellModal.dateStr) return;
    
    onUpdateRecord(
      activeCellModal.student.id,
      activeCellModal.dateStr,
      modalStatus,
      modalReason.trim() || undefined,
      modalCheckInTime.trim() || undefined
    );

    setActiveCellModal({ isOpen: false });
  };

  // 통계 계산
  const dayStats = useMemo(() => {
    const stats: Record<string, { present: number; late: number; absent: number; total: number }> = {};
    activeDays.forEach(d => {
      let p = 0, l = 0, a = 0, tot = 0;
      students.forEach(st => {
        if (!st.active || isStudentExcluded(st, session, d.dateStr)) return;
        tot++;
        const key = getRecordKey(st.id, session, d.dateStr);
        const rec = records[key];
        if (rec?.status === 'PRESENT') p++;
        else if (rec?.status === 'LATE') l++;
        else if (rec?.status === 'ABSENT') a++;
      });
      stats[d.dateStr] = { present: p, late: l, absent: a, total: tot };
    });
    return stats;
  }, [activeDays, students, session, records]);

  return (
    <div className="space-y-4">
      {/* 상단 툴바 */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* 세션 및 월 선택 */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => onSessionChange('morning')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                session === 'morning'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              ☀️ 아침 자습
            </button>
            <button
              onClick={() => onSessionChange('night')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                session === 'night'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              🌙 야간 자습
            </button>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => onMonthChange(month === 1 ? 12 : month - 1)}
              className="p-1 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-black px-1.5">{year}년 {month}월</span>
            <button
              onClick={() => onMonthChange(month === 12 ? 1 : month + 1)}
              className="p-1 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 필터 및 검색 */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 text-xs font-bold">
            {(['all', 3, 2, 1] as const).map(g => (
              <button
                key={g}
                onClick={() => setSelectedGrade(g)}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  selectedGrade === g
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {g === 'all' ? '전체' : `${g}학년`}
              </button>
            ))}
          </div>

          <div className="relative flex-1 md:w-48">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="이름 또는 학번 검색..."
              className="w-full text-xs pl-8 pr-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
            />
          </div>
        </div>

      </div>

      {/* 월간 출결 테이블 */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[calc(100vh-280px)]">
          <table className="w-full text-xs text-center border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-20 backdrop-blur-xs text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="py-2.5 px-3 sticky left-0 z-30 bg-slate-100 dark:bg-slate-800 min-w-[70px] border-r border-slate-200 dark:border-slate-700">
                  학번
                </th>
                <th className="py-2.5 px-3 sticky left-[70px] z-30 bg-slate-100 dark:bg-slate-800 min-w-[80px] border-r border-slate-200 dark:border-slate-700 shadow-xs">
                  이름
                </th>
                {activeDays.map(d => (
                  <th key={d.dateStr} className="py-2 px-1.5 min-w-[42px] border-r border-slate-200 dark:border-slate-700 font-mono">
                    <div className="text-2xs font-bold text-slate-800 dark:text-slate-200">{d.dayNum}</div>
                    <div className={`text-3xs font-semibold ${d.dayOfWeek === '토' ? 'text-blue-500' : d.dayOfWeek === '일' ? 'text-rose-500' : 'text-slate-400'}`}>
                      {d.dayOfWeek}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
              {filteredStudents.map((st, idx) => {
                const fullCode = `${st.grade}${String(st.classNumber).padStart(2, '0')}${String(st.studentNumber).padStart(2, '0')}`;
                return (
                  <tr key={st.id} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-colors">
                    <td className="py-1.5 px-2 sticky left-0 z-10 bg-white dark:bg-slate-900 font-mono font-bold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800 text-2xs">
                      {fullCode}
                    </td>
                    <td className="py-1.5 px-2 sticky left-[70px] z-10 bg-white dark:bg-slate-900 font-black border-r border-slate-200 dark:border-slate-800 shadow-xs">
                      {st.name}
                    </td>
                    {activeDays.map(d => {
                      const key = getRecordKey(st.id, session, d.dateStr);
                      const rec = records[key];
                      const isExcl = isStudentExcluded(st, session, d.dateStr);

                      if (isExcl) {
                        return (
                          <td key={d.dateStr} className="p-0 border-r border-slate-100 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-950/40 text-slate-300 dark:text-slate-600 select-none">
                            <span className="text-3xs">해당없음</span>
                          </td>
                        );
                      }

                      return (
                        <td
                          key={d.dateStr}
                          onClick={() => handleCellClick(st, d.dateStr)}
                          onContextMenu={e => handleCellContextMenu(e, st, d.dateStr)}
                          className={`p-0 border-r border-slate-100 dark:border-slate-800/60 cursor-pointer transition-all hover:bg-indigo-100/50 dark:hover:bg-indigo-900/40 select-none ${
                            rec?.status === 'PRESENT'
                              ? 'bg-emerald-50/40 dark:bg-emerald-950/20'
                              : rec?.status === 'LATE'
                              ? 'bg-amber-50/40 dark:bg-amber-950/20'
                              : rec?.status === 'ABSENT'
                              ? 'bg-rose-50/40 dark:bg-rose-950/20'
                              : ''
                          }`}
                          title={rec?.reason ? `사유: ${rec.reason}` : undefined}
                        >
                          <div className="h-9 w-full flex flex-col items-center justify-center relative">
                            <StatusIcon status={rec?.status || 'NONE'} />
                            {rec?.reason && (
                              <span className="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-indigo-500" />
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 셀 상세 수정 모달 */}
      {activeCellModal.isOpen && activeCellModal.student && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-5 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-indigo-500" />
                출결 상세 수정 ({activeCellModal.student.name})
              </h3>
              <button
                onClick={() => setActiveCellModal({ isOpen: false })}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-2xs font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  출결 상태 선택
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['PRESENT', 'LATE', 'ABSENT', 'EARLY_LEAVE', 'OFFICIAL_ABSENT', 'NONE'] as const).map(st => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setModalStatus(st)}
                      className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition-all ${
                        modalStatus === st
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {getStatusLabel(st)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-2xs font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  입실 시각 (HH:mm)
                </label>
                <input
                  type="text"
                  value={modalCheckInTime}
                  onChange={e => setModalCheckInTime(e.target.value)}
                  placeholder="예: 07:25"
                  className="w-full text-xs px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="text-2xs font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  사유 및 비고
                </label>
                <textarea
                  value={modalReason}
                  onChange={e => setModalReason(e.target.value)}
                  placeholder="지각/결석/조퇴 사유 입력..."
                  rows={2}
                  className="w-full text-xs p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setActiveCellModal({ isOpen: false })}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveModal}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 shadow-xs"
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
