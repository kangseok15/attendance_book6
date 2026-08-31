/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { SessionType, DayConfig } from '../types/attendance';
import { 
  Trash2, 
  AlertTriangle, 
  X, 
  Calendar, 
  Layers, 
  RotateCcw,
  CheckCircle2,
  ShieldAlert
} from 'lucide-react';

interface ClearAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  year: number;
  month: number;
  session: SessionType;
  activeDays: DayConfig[];
  currentSelectedDateStr: string;
  onClearDate: (dateStr: string, gradeFilter?: number) => void;
  onClearMonthSession: (year: number, month: number, session: SessionType) => void;
  onClearAll: () => void;
}

type ClearScope = 'date' | 'month-session' | 'all';

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
  onClearAll
}) => {
  const [scope, setScope] = useState<ClearScope>('date');
  const [targetDateStr, setTargetDateStr] = useState<string>(currentSelectedDateStr);
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [confirmText, setConfirmText] = useState<string>('');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setScope('date');
      // 모달 열릴 때 현재 선택된 날짜 또는 첫 번째 활성 날짜로 초기화
      const defaultDate = (activeDays.some(d => d.dateStr === currentSelectedDateStr))
        ? currentSelectedDateStr
        : (activeDays[0]?.dateStr || currentSelectedDateStr);
      setTargetDateStr(defaultDate);
      setGradeFilter('all');
      setConfirmText('');
      setIsSuccess(false);
    }
  }, [isOpen, currentSelectedDateStr, activeDays]);

  if (!isOpen) return null;

  const sessionName = session === 'morning' ? '아침 자율학습' : '야간 자율학습';

  const handleExecute = () => {
    if (scope === 'all' && confirmText !== '초기화') {
      alert('전체 초기화를 실행하려면 정확히 "초기화"를 입력해야 합니다.');
      return;
    }

    if (scope === 'date') {
      const g = gradeFilter === 'all' ? undefined : parseInt(gradeFilter, 10);
      onClearDate(targetDateStr, g);
    } else if (scope === 'month-session') {
      onClearMonthSession(year, month, session);
    } else if (scope === 'all') {
      onClearAll();
    }

    setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-6 relative overflow-hidden">
        
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>출결 기록 비우기 (초기화)</span>
              </h2>
              <p className="text-2xs text-slate-500 dark:text-slate-400">
                실행 전 현재 상태는 데이터 복구 센터에 자동 백업됩니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isSuccess ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="text-base font-bold text-slate-900 dark:text-white">
              선택한 범위의 출결이 안전하게 비워졌습니다.
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              (필요 시 [데이터 복구] 버튼에서 즉시 롤백할 수 있습니다)
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            
            {/* 초기화 범위 선택 */}
            <div className="space-y-2.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                초기화 범위 선택
              </label>

              {/* 1. 특정 날짜만 비우기 */}
              <div 
                onClick={() => setScope('date')}
                className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                  scope === 'date'
                    ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs'
                    : 'bg-white dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <input 
                      type="radio" 
                      name="clear-scope" 
                      checked={scope === 'date'} 
                      onChange={() => setScope('date')}
                      className="text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                        1. 특정 날짜만 비우기 (추천)
                      </div>
                      <div className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">
                        선택한 특정 날짜의 출결만 빈칸으로 지웁니다. 다른 날짜의 기록은 안전하게 보존됩니다.
                      </div>
                    </div>
                  </div>
                  <span className="text-2xs font-semibold px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 shrink-0">
                    일별 초기화
                  </span>
                </div>

                {scope === 'date' && (
                  <div className="mt-3.5 pt-3.5 border-t border-indigo-100 dark:border-indigo-900/50 grid grid-cols-1 sm:grid-cols-2 gap-2.5 animate-fade-in" onClick={e => e.stopPropagation()}>
                    <div>
                      <label className="text-2xs font-bold text-slate-600 dark:text-slate-400 block mb-1">
                        초기화할 날짜 선택
                      </label>
                      <select
                        value={targetDateStr}
                        onChange={e => setTargetDateStr(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      >
                        {activeDays.map(d => (
                          <option key={d.dateStr} value={d.dateStr}>
                            {d.dateStr} ({d.dayOfWeek}요일)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-2xs font-bold text-slate-600 dark:text-slate-400 block mb-1">
                        대상 학년
                      </label>
                      <select
                        value={gradeFilter}
                        onChange={e => setGradeFilter(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="all">전체 학년 (1~3학년)</option>
                        <option value="3">3학년만</option>
                        <option value="2">2학년만</option>
                        <option value="1">1학년만</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. 현재 월/세션 전체 비우기 */}
              <div 
                onClick={() => setScope('month-session')}
                className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                  scope === 'month-session'
                    ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs'
                    : 'bg-white dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <input 
                      type="radio" 
                      name="clear-scope" 
                      checked={scope === 'month-session'} 
                      onChange={() => setScope('month-session')}
                      className="text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                        2. {year}년 {month}월 [{sessionName}] 전체 비우기
                      </div>
                      <div className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">
                        현재 보고 계신 {month}월의 {sessionName} 한 달 치 출결을 모두 빈칸으로 만듭니다.
                      </div>
                    </div>
                  </div>
                  <span className="text-2xs font-semibold px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 shrink-0">
                    월간 초기화
                  </span>
                </div>
              </div>

              {/* 3. 전체 출결 데이터 영구 초기화 */}
              <div 
                onClick={() => setScope('all')}
                className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                  scope === 'all'
                    ? 'bg-rose-50/70 dark:bg-rose-950/40 border-rose-500 ring-2 ring-rose-500/20 shadow-xs'
                    : 'bg-white dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <input 
                      type="radio" 
                      name="clear-scope" 
                      checked={scope === 'all'} 
                      onChange={() => setScope('all')}
                      className="text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <div className="text-sm font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4" />
                        <span>3. 전체 출결 기록 완전 초기화</span>
                      </div>
                      <div className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">
                        모든 연도와 월, 아침/야간의 출결을 전부 삭제합니다. (학생 명단은 유지됨)
                      </div>
                    </div>
                  </div>
                  <span className="text-2xs font-semibold px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 shrink-0">
                    전체 삭제
                  </span>
                </div>

                {scope === 'all' && (
                  <div className="mt-3.5 pt-3.5 border-t border-rose-200 dark:border-rose-900/50 space-y-2 animate-fade-in" onClick={e => e.stopPropagation()}>
                    <div className="text-2xs font-bold text-rose-600 dark:text-rose-400">
                      정말 전체 기록을 지우시려면 아래 입력창에 <span className="underline font-black">초기화</span> 라고 적어주세요:
                    </div>
                    <input
                      type="text"
                      value={confirmText}
                      onChange={e => setConfirmText(e.target.value)}
                      placeholder="초기화"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-700 text-xs font-bold text-rose-700 dark:text-rose-300 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                )}
              </div>

            </div>

            {/* 안내 및 실행 버튼 */}
            <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800">
              <div className="text-2xs text-slate-400 dark:text-slate-500">
                ※ 실행 즉시 자동 스냅샷 백업이 생성됩니다.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleExecute}
                  disabled={scope === 'all' && confirmText !== '초기화'}
                  className={`px-4 py-2 rounded-xl text-xs font-bold text-white shadow-md transition-all flex items-center gap-1.5 ${
                    scope === 'all'
                      ? (confirmText === '초기화' ? 'bg-rose-600 hover:bg-rose-700 cursor-pointer' : 'bg-rose-400 opacity-50 cursor-not-allowed')
                      : 'bg-indigo-600 hover:bg-indigo-700 cursor-pointer'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>비우기 실행</span>
                </button>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
};
