import React, { useState } from 'react';
import { 
  Eraser, 
  X, 
  Calendar, 
  AlertTriangle, 
  CheckCircle2, 
  Trash2, 
  Layers,
  Sparkles
} from 'lucide-react';
import { SessionType, DayConfig } from '../types/attendance';

interface ClearAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  year: number;
  month: number;
  session: SessionType;
  activeDays: DayConfig[];
  currentSelectedDateStr?: string;
  onClearDate: (dateStr: string, gradeFilter?: number) => void;
  onClearMonthSession: (year: number, month: number, session: SessionType) => void;
  onClearAll: () => void;
}

export const ClearAttendanceModal: React.FC<ClearAttendanceModalProps> = ({
  isOpen,
  onClose,
  year,
  month,
  session,
  activeDays,
  currentSelectedDateStr,
  onClearDate,
  onClearMonthSession,
  onClearAll,
}) => {
  const [clearScope, setClearScope] = useState<'single-day' | 'month-session' | 'all'>('single-day');
  const [targetDateStr, setTargetDateStr] = useState<string>(() => {
    return currentSelectedDateStr || activeDays[0]?.dateStr || `${year}-${String(month).padStart(2, '0')}-19`;
  });
  const [targetGrade, setTargetGrade] = useState<number | 'all'>('all');
  const [isSuccess, setIsSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  if (!isOpen) return null;

  const sessionLabel = session === 'morning' ? '아침 자율학습' : '야간 자율학습';
  const targetDay = activeDays.find(d => d.dateStr === targetDateStr);

  const handleExecuteClear = () => {
    if (clearScope === 'single-day') {
      onClearDate(targetDateStr, targetGrade === 'all' ? undefined : targetGrade);
      const gradeText = targetGrade === 'all' ? '전체 학년' : `${targetGrade}학년`;
      setSuccessMessage(`${targetDateStr} (${sessionLabel}) ${gradeText} 출결 기록이 초기화되었습니다.`);
    } else if (clearScope === 'month-session') {
      onClearMonthSession(year, month, session);
      setSuccessMessage(`${year}년 ${month}월 ${sessionLabel} 전체 출결 기록이 초기화되었습니다.`);
    } else if (clearScope === 'all') {
      onClearAll();
      setSuccessMessage(`모든 기간의 출결 기록이 완전히 초기화되었습니다.`);
    }

    setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold">
              <Eraser className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">
                출결 기록 비우기 (초기화)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                초기화할 범위(특정 날짜 또는 전체)를 선택해 주세요.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {isSuccess ? (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 animate-in zoom-in" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                출결 초기화 완료
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs font-medium">
                {successMessage}
              </p>
            </div>
          ) : (
            <>
              {/* Scope Selection Options */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  초기화 범위 선택
                </label>

                {/* Option 1: Single Date Clear */}
                <div 
                  onClick={() => setClearScope('single-day')}
                  className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                    clearScope === 'single-day'
                      ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-850'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <input
                        type="radio"
                        name="clearScope"
                        checked={clearScope === 'single-day'}
                        onChange={() => setClearScope('single-day')}
                        className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                          1. 특정 날짜만 비우기 (추천)
                        </span>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          선택한 특정 날짜의 출결만 빈칸으로 지웁니다. 다른 날짜의 기록은 안전하게 보존됩니다.
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300 shrink-0">
                      일별 초기화
                    </span>
                  </div>

                  {/* Sub-selectors for Single Day */}
                  {clearScope === 'single-day' && (
                    <div className="mt-3.5 pt-3 border-t border-indigo-100 dark:border-indigo-900/40 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                          초기화할 날짜 선택
                        </label>
                        <select
                          value={targetDateStr}
                          onChange={e => setTargetDateStr(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                        >
                          {activeDays.map(d => (
                            <option key={d.dateStr} value={d.dateStr}>
                              {d.dateStr} ({d.dayOfWeek}요일)
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                          대상 학년
                        </label>
                        <select
                          value={targetGrade}
                          onChange={e => setTargetGrade(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                          className="w-full px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="all">전체 학년 (1~3학년)</option>
                          <option value={3}>3학년만</option>
                          <option value={2}>2학년만</option>
                          <option value={1}>1학년만</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Option 2: Month Session Clear */}
                <div 
                  onClick={() => setClearScope('month-session')}
                  className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                    clearScope === 'month-session'
                      ? 'border-amber-600 bg-amber-50/50 dark:bg-amber-950/40 shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-850'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <input
                        type="radio"
                        name="clearScope"
                        checked={clearScope === 'month-session'}
                        onChange={() => setClearScope('month-session')}
                        className="w-4 h-4 text-amber-600 focus:ring-amber-500"
                      />
                      <div>
                        <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                          2. 이번 달 {sessionLabel} 전체 비우기
                        </span>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          <strong>{year}년 {month}월</strong>의 {sessionLabel} 모든 날짜 출결을 일괄 비웁니다.
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300 shrink-0">
                      월별 초기화
                    </span>
                  </div>
                </div>

                {/* Option 3: All Records Clear */}
                <div 
                  onClick={() => setClearScope('all')}
                  className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                    clearScope === 'all'
                      ? 'border-rose-600 bg-rose-50/50 dark:bg-rose-950/40 shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-850'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <input
                        type="radio"
                        name="clearScope"
                        checked={clearScope === 'all'}
                        onChange={() => setClearScope('all')}
                        className="w-4 h-4 text-rose-600 focus:ring-rose-500"
                      />
                      <div>
                        <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100 text-rose-600 dark:text-rose-400 flex items-center gap-1">
                          <Trash2 className="w-4 h-4" /> 3. 전체 출결 완전 초기화 (모든 기간/세션)
                        </span>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          등록된 모든 아침/야간 출결 데이터를 백지 상태로 깨끗이 초기화합니다. (학생 명단은 안전하게 유지됩니다)
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300 shrink-0">
                      전체 초기화
                    </span>
                  </div>
                </div>

              </div>

              {/* Notice */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <span>
                  초기화를 실행해도 <strong>학생 명단(45명) 및 학생 정보는 삭제되지 않고 안전하게 유지</strong>됩니다.
                </span>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        {!isSuccess && (
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-850 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              취소
            </button>
            <button
              onClick={handleExecuteClear}
              className={`px-5 py-2 rounded-xl text-white text-xs font-black transition-all shadow-xs cursor-pointer flex items-center gap-1.5 ${
                clearScope === 'all'
                  ? 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800'
                  : clearScope === 'month-session'
                  ? 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800'
                  : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800'
              }`}
            >
              <Eraser className="w-4 h-4" />
              {clearScope === 'single-day' ? '해당 날짜 비우기' : clearScope === 'month-session' ? '이번 달 전체 비우기' : '전체 출결 완전 초기화'}
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
