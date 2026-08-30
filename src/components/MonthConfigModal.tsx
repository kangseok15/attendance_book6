import React, { useState } from 'react';
import { DayConfig, SessionType, SchoolEvent, Grade3ExclusionConfig } from '../types/attendance';
import { 
  Settings2, 
  Calendar, 
  Check, 
  Info, 
  Sun, 
  Moon, 
  Plus, 
  Trash2, 
  GraduationCap, 
  CheckSquare, 
  Square,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Layers,
  CalendarDays,
  UserX,
  ArrowDown
} from 'lucide-react';
import { getAcademicYearLabel, getAcademicYear } from '../utils/storage';

interface MonthConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: SessionType;
  year: number;
  month: number;
  allDaysInMonth: DayConfig[];
  onToggleDay: (dateStr: string) => void;
  onSetPreset: (preset: 'standard' | 'weekdays' | 'sample8' | 'all' | 'none') => void;
  onSelectMonth?: (month: number) => void;
  onSelectSession?: (session: SessionType) => void;
  schoolEvents: SchoolEvent[];
  onAddSchoolEvent: (event: Omit<SchoolEvent, 'id'>) => void;
  onDeleteSchoolEvent: (id: string) => void;
  includeWednesdaysInNight: boolean;
  onToggleWednesdayNight: (include: boolean) => void;
  onResetPastYearEvents: () => void;
  onResetAllEvents: () => void;
  grade3Exclusion: Grade3ExclusionConfig;
  onUpdateGrade3Exclusion: (config: Grade3ExclusionConfig) => void;
}

export const MonthConfigModal: React.FC<MonthConfigModalProps> = ({
  isOpen,
  onClose,
  session,
  year,
  month,
  allDaysInMonth,
  onToggleDay,
  onSetPreset,
  onSelectMonth,
  onSelectSession,
  schoolEvents,
  onAddSchoolEvent,
  onDeleteSchoolEvent,
  includeWednesdaysInNight,
  onToggleWednesdayNight,
  onResetPastYearEvents,
  onResetAllEvents,
  grade3Exclusion,
  onUpdateGrade3Exclusion,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'calendar' | 'events' | 'grade3_exclusion' | 'academic_year'>('calendar');

  // New Event Form State
  const [newEventDate, setNewEventDate] = useState<string>(
    `${year}-${String(month).padStart(2, '0')}-01`
  );
  const [newEventTitle, setNewEventTitle] = useState<string>('');
  const [newExcludeMorning, setNewExcludeMorning] = useState<boolean>(true);
  const [newExcludeNight, setNewExcludeNight] = useState<boolean>(true);
  const [newIsCsat, setNewIsCsat] = useState<boolean>(false);
  const [addSuccessMessage, setAddSuccessMessage] = useState<string | null>(null);

  // Grade 3 Exclusion Form State
  const [g3StartDate, setG3StartDate] = useState<string>(
    grade3Exclusion?.startDate || `${year}-11-18`
  );

  // Reset confirmation dialog states
  const [showPastYearConfirm, setShowPastYearConfirm] = useState<boolean>(false);
  const [showAllEventsConfirm, setShowAllEventsConfirm] = useState<boolean>(false);

  if (!isOpen) return null;

  const activeCount = allDaysInMonth.filter(d => d.enabled).length;
  const sessionLabel = session === 'morning' ? '아침' : '야간';
  const availableMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const academicYearText = getAcademicYearLabel(year, month);
  const currentAcademicYear = getAcademicYear(year, month);

  // Filter events for the current month vs all
  const currentMonthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const currentMonthEvents = schoolEvents.filter(e => e.dateStr.startsWith(currentMonthPrefix));

  // Find CSAT event if any
  const csatEvent = schoolEvents.find(e => e.isCsat || (e.title.includes('수능') && !e.title.includes('예비소집')));

  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim() || !newEventDate) return;

    onAddSchoolEvent({
      dateStr: newEventDate,
      title: newEventTitle.trim(),
      excludeMorning: newExcludeMorning,
      excludeNight: newExcludeNight,
      isCsat: newIsCsat,
    });

    setAddSuccessMessage(`'${newEventTitle.trim()}' 행사가 등록되었습니다.`);
    setNewEventTitle('');
    setNewIsCsat(false);
    setTimeout(() => setAddSuccessMessage(null), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${session === 'morning' ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300' : 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'}`}>
              <Settings2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base text-slate-900 dark:text-slate-100">
                  자율학습 운영일 및 학사일정 설정
                </h3>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  {academicYearText}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {year}년 {month}월 <span className={session === 'morning' ? 'font-bold text-amber-600 dark:text-amber-400' : 'font-bold text-indigo-600 dark:text-indigo-400'}>{sessionLabel} 자율학습</span> (현재 <span className="font-bold text-indigo-600 dark:text-indigo-400">{activeCount}일</span> 운영 중)
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Sub Navigation Tabs */}
        <div className="flex items-center gap-1 px-4 sm:px-5 pt-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850 overflow-x-auto">
          <button
            onClick={() => setActiveSubTab('calendar')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-t-xl text-xs font-bold transition-all border-b-2 cursor-pointer whitespace-nowrap ${
              activeSubTab === 'calendar'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-900 shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>운영일 캘린더 ({month}월)</span>
          </button>

          <button
            onClick={() => setActiveSubTab('events')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-t-xl text-xs font-bold transition-all border-b-2 cursor-pointer whitespace-nowrap ${
              activeSubTab === 'events'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-900 shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            <span>학교 행사 관리</span>
            {schoolEvents.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300 font-black">
                {schoolEvents.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSubTab('grade3_exclusion')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-t-xl text-xs font-bold transition-all border-b-2 cursor-pointer whitespace-nowrap ${
              activeSubTab === 'grade3_exclusion'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-900 shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <GraduationCap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>고3 제외 설정</span>
            {grade3Exclusion?.enabled && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 font-black">
                적용 중
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSubTab('academic_year')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-t-xl text-xs font-bold transition-all border-b-2 cursor-pointer whitespace-nowrap ${
              activeSubTab === 'academic_year'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-900 shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <RotateCcw className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>이전 학년도 행사 초기화</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 text-xs">

          {/* ======================================================== */}
          {/* TAB 1: CALENDAR & OPERATING DAYS                        */}
          {/* ======================================================== */}
          {activeSubTab === 'calendar' && (
            <div className="space-y-4">
              
              {/* Top Controls: Month & Session Selectors */}
              <div className="bg-slate-50 dark:bg-slate-850 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                {/* 1. Month Picker (1월 ~ 12월) */}
                <div className="space-y-1.5">
                  <span className="font-bold text-slate-700 dark:text-slate-300 text-xs flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    월 선택 (1월 ~ 12월 전체 지원):
                  </span>
                  <div className="grid grid-cols-6 sm:grid-cols-12 gap-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                    {availableMonths.map(m => (
                      <button
                        key={`modal-m-${m}`}
                        type="button"
                        onClick={() => onSelectMonth && onSelectMonth(m)}
                        className={`py-1 text-xs font-bold rounded-lg transition-all text-center cursor-pointer ${
                          month === m
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {m}월
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Session Switcher */}
                <div className="flex items-center justify-between gap-2 flex-wrap border-t border-slate-200/60 dark:border-slate-700/60 pt-2.5">
                  <span className="font-bold text-slate-700 dark:text-slate-300 text-xs">
                    자율학습 구분:
                  </span>
                  <div className="inline-flex p-0.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => onSelectSession && onSelectSession('morning')}
                      className={`px-3.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                        session === 'morning'
                          ? 'bg-amber-500 text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      <Sun className="w-3.5 h-3.5" />
                      <span>아침 자율학습</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectSession && onSelectSession('night')}
                      className={`px-3.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                        session === 'night'
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      <Moon className="w-3.5 h-3.5" />
                      <span>야간 자율학습(야자)</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 🌟 KEY REQUIREMENT: Wednesday Night Self-Study Checkbox Toggle */}
              <div className="p-3.5 bg-indigo-50/70 dark:bg-indigo-950/40 border-2 border-indigo-200 dark:border-indigo-800 rounded-xl flex items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <label className="relative flex items-center cursor-pointer mt-0.5">
                    <input
                      type="checkbox"
                      checked={includeWednesdaysInNight}
                      onChange={(e) => onToggleWednesdayNight(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded border-indigo-300 focus:ring-indigo-500 cursor-pointer"
                    />
                  </label>
                  <div>
                    <label 
                      onClick={() => onToggleWednesdayNight(!includeWednesdaysInNight)}
                      className="font-extrabold text-xs text-indigo-950 dark:text-indigo-100 flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>수요일 야간 자율학습(야자) 실시</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                        includeWednesdaysInNight 
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' 
                          : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                        {includeWednesdaysInNight ? '실시 (출석부 포함)' : '미실시 (출석부 제외)'}
                      </span>
                    </label>
                    <p className="text-[11px] text-indigo-800 dark:text-indigo-300 mt-0.5">
                      체크하면 <strong>수요일을 야자 출석부에 포함</strong>하고, 체크를 해제하면 <strong>야자 출석부에서 수요일을 자동으로 제외</strong>합니다.
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick Presets */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  빠른 설정 프리셋 ({sessionLabel} 기준)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => onSetPreset('standard')}
                    className="p-2 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-colors text-center shadow-xs cursor-pointer"
                  >
                    학사일정 기본값
                  </button>
                  <button
                    onClick={() => onSetPreset('weekdays')}
                    className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold hover:bg-slate-100 transition-colors text-center cursor-pointer"
                  >
                    모든 평일 활성화
                  </button>
                  <button
                    onClick={() => onSetPreset('none')}
                    className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium hover:bg-slate-100 transition-colors text-center cursor-pointer"
                  >
                    전체 해제
                  </button>
                </div>
              </div>

              {/* Calendar Day Picker Grid */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    일자별 개별 선택 (클릭하여 켜기/끄기)
                  </label>
                  <span className="text-[11px] text-slate-500">
                    파란색 = 활성 운영일 / 회색 = 미실시일
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {['일', '월', '화', '수', '목', '금', '토'].map((dw, idx) => (
                    <div key={dw} className={`text-center font-bold text-3xs py-1 ${
                      idx === 0 ? 'text-rose-500' : idx === 6 ? 'text-blue-500' : dw === '수' && session === 'night' && !includeWednesdaysInNight ? 'text-indigo-600 dark:text-indigo-400 font-black' : 'text-slate-400'
                    }`}>
                      {dw}{dw === '수' && session === 'night' && !includeWednesdaysInNight ? '(야자X)' : ''}
                    </div>
                  ))}

                  {/* Padding for first day */}
                  {Array.from({ length: new Date(year, month - 1, 1).getDay() }).map((_, padIdx) => (
                    <div key={`cal-pad-${padIdx}`} className="min-h-12 rounded-xl bg-slate-50/40 dark:bg-slate-850/40 border border-dashed border-slate-200/60 dark:border-slate-800 pointer-events-none" />
                  ))}

                  {allDaysInMonth.map(d => {
                    const isSun = d.dayOfWeek === '일';
                    const isSat = d.dayOfWeek === '토';
                    const isWed = d.dayOfWeek === '수';
                    const eventInfo = schoolEvents.find(e => e.dateStr === d.dateStr);

                    return (
                      <button
                        key={d.dateStr}
                        onClick={() => onToggleDay(d.dateStr)}
                        className={`py-2 px-1 rounded-xl border text-xs font-black transition-all flex flex-col items-center justify-center relative min-h-12 cursor-pointer ${
                          d.enabled
                            ? 'bg-indigo-600 border-indigo-700 text-white shadow-xs'
                            : eventInfo
                            ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400'
                            : isWed && session === 'night' && !includeWednesdaysInNight
                            ? 'bg-slate-100 dark:bg-slate-850 border-slate-300 dark:border-slate-700 text-slate-400'
                            : 'bg-slate-50 dark:bg-slate-850 border-slate-200 dark:border-slate-800 text-slate-400 hover:border-slate-300'
                        }`}
                      >
                        <span>{d.dayNum}</span>
                        <span
                          className={`text-3xs font-normal truncate max-w-full px-0.5 ${
                            d.enabled
                              ? 'text-indigo-200'
                              : isSun
                              ? 'text-rose-400'
                              : isSat
                              ? 'text-blue-400'
                              : isWed && session === 'night' && !includeWednesdaysInNight
                              ? 'text-slate-500 font-semibold'
                              : 'text-slate-400'
                          }`}
                        >
                          {eventInfo ? eventInfo.title : (isWed && session === 'night' && !includeWednesdaysInNight ? '수요야자X' : d.dayOfWeek)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: SCHOOL EVENTS & CSAT MANAGEMENT                  */}
          {/* ======================================================== */}
          {activeSubTab === 'events' && (
            <div className="space-y-4">
              
              {/* Event Add Box */}
              <form onSubmit={handleCreateEvent} className="p-4 bg-slate-50 dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <Plus className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    새 학교 행사 및 학사일정 추가
                  </span>
                  <span className="text-[11px] text-slate-500">
                    행사 등록 시 선택된 자율학습이 출석부에서 자동 제외됩니다.
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      행사 일자 (YYYY-MM-DD)
                    </label>
                    <input
                      type="date"
                      value={newEventDate}
                      onChange={e => setNewEventDate(e.target.value)}
                      required
                      className="w-full px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      행사명 (예: 개교기념일, 중간고사, 축제, 수능 등)
                    </label>
                    <input
                      type="text"
                      placeholder="행사명 입력"
                      value={newEventTitle}
                      onChange={e => setNewEventTitle(e.target.value)}
                      required
                      className="w-full px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Exclusion & CSAT Checkboxes */}
                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
                  <span className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    미실시 및 출석부 처리 옵션:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newExcludeMorning}
                        onChange={e => setNewExcludeMorning(e.target.checked)}
                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                      />
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        🌅 아침 자율학습 미실시
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newExcludeNight}
                        onChange={e => setNewExcludeNight(e.target.checked)}
                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                      />
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        🌙 야간 자율학습 미실시
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newIsCsat}
                        onChange={e => {
                          setNewIsCsat(e.target.checked);
                          if (e.target.checked && !newEventTitle) {
                            setNewEventTitle('수능 예비소집일');
                          }
                        }}
                        className="w-4 h-4 text-rose-600 rounded focus:ring-rose-500"
                      />
                      <span className="font-bold text-rose-600 dark:text-rose-400">
                        🎓 수능 예비소집일 지정 (고3 음영)
                      </span>
                    </label>
                  </div>
                  {newIsCsat && (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                      * 수능 예비소집일 이후에는 <strong>3학년(고3) 학생의 출석부가 자동으로 진회색 음영 처리(미실시)</strong>됩니다.
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  {addSuccessMessage ? (
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <Check className="w-4 h-4" /> {addSuccessMessage}
                    </span>
                  ) : <div />}
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    행사 추가하기
                  </button>
                </div>
              </form>

              {/* Registered Events List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs text-slate-800 dark:text-slate-200">
                    등록된 학교 행사 목록 ({schoolEvents.length}개)
                  </span>
                  {csatEvent && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                      🎓 지정 수능/소집일: {csatEvent.dateStr} ({csatEvent.title})
                    </span>
                  )}
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                  {schoolEvents.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                      등록된 학교 행사가 없습니다.
                    </div>
                  ) : (
                    schoolEvents
                      .slice()
                      .sort((a, b) => a.dateStr.localeCompare(b.dateStr))
                      .map(evt => {
                        const isCurrentMonth = evt.dateStr.startsWith(currentMonthPrefix);
                        return (
                          <div
                            key={evt.id}
                            className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-colors ${
                              evt.isCsat || evt.title.includes('수능')
                                ? 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60'
                                : isCurrentMonth
                                ? 'bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/50'
                                : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="font-mono font-bold text-xs text-slate-700 dark:text-slate-300">
                                {evt.dateStr}
                              </span>
                              <span className="font-extrabold text-xs text-slate-900 dark:text-slate-100">
                                {evt.title}
                              </span>
                              <div className="flex items-center gap-1">
                                {evt.excludeMorning && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                    아침X
                                  </span>
                                )}
                                {evt.excludeNight && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                                    야간X
                                  </span>
                                )}
                                {(evt.isCsat || evt.title.includes('수능')) && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                                    🎓 수능 예비소집일 이후 음영
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => onDeleteSchoolEvent(evt.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer"
                              title="행사 삭제"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 3: GRADE 3 EXCLUSION & REORDER SETTINGS               */}
          {/* ======================================================== */}
          {activeSubTab === 'grade3_exclusion' && (
            <div className="space-y-4">
              
              {/* Feature Header Card */}
              <div className="p-4 bg-indigo-50/80 dark:bg-indigo-950/40 rounded-xl border border-indigo-200 dark:border-indigo-800 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-indigo-950 dark:text-indigo-100">
                      고3(3학년) 자율학습 제외 및 1학년 밑으로 이동
                    </h4>
                    <p className="text-xs text-indigo-700 dark:text-indigo-300">
                      수능 예비소집일 이후부터 3학년을 자율학습 출결 대상에서 제외하고 명단 순서를 1학년 밑으로 이동합니다.
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed pl-10">
                  수능 후 고3 자율학습 미실시 기간에는 3학년 학생이 <strong>1학년 밑으로 자동 이동(2학년 → 1학년 → 3학년)</strong>하며, 해당 일자 이후의 출석부는 <strong>진회색 음영 처리(자습 미실시)</strong>되어 1·2학년 중심의 출결 관리가 가능해집니다.
                </p>
              </div>

              {/* Status Banner */}
              <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                grade3Exclusion?.enabled
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200'
                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
              }`}>
                <div className="flex items-center gap-2.5">
                  <span className={`w-3 h-3 rounded-full ${grade3Exclusion?.enabled ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'}`} />
                  <div>
                    <div className="font-extrabold text-xs">
                      {grade3Exclusion?.enabled ? '🟢 고3 제외 적용 중' : '⚪ 고3 제외 미적용 (정상 순서: 3학년 → 2학년 → 1학년)'}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {grade3Exclusion?.enabled
                        ? `기준일자(${grade3Exclusion.startDate || '2026-11-18'})부터 3학년 학생이 1학년 밑으로 내려가고 출석부에서 제외됩니다.`
                        : '모든 월에서 3학년이 최상단(3→2→1)에 위치하며 정상 출결을 진행합니다.'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const nextEnabled = !grade3Exclusion?.enabled;
                    onUpdateGrade3Exclusion({
                      enabled: nextEnabled,
                      startDate: g3StartDate || `${year}-11-18`,
                      reason: '수능 예비소집일 이후 자율학습 제외',
                    });
                  }}
                  className={`px-3.5 py-1.5 rounded-xl font-black text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                    grade3Exclusion?.enabled
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                >
                  {grade3Exclusion?.enabled ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" />
                      고3 제외 해제 (원복)
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      고3 제외 활성화
                    </>
                  )}
                </button>
              </div>

              {/* Date Config Form */}
              <div className="p-4 bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <h5 className="font-extrabold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <span>📅 제외 시작일자 지정</span>
                  <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                    (이 날짜부터 고3이 1학년 밑으로 내려갑니다)
                  </span>
                </h5>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <input
                    type="date"
                    value={g3StartDate}
                    onChange={e => {
                      const newDate = e.target.value;
                      setG3StartDate(newDate);
                      if (grade3Exclusion?.enabled) {
                        onUpdateGrade3Exclusion({
                          ...grade3Exclusion,
                          startDate: newDate,
                        });
                      }
                    }}
                    className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-bold"
                  />

                  <button
                    type="button"
                    onClick={() => {
                      const dateToSet = g3StartDate || `${year}-11-18`;
                      onUpdateGrade3Exclusion({
                        enabled: true,
                        startDate: dateToSet,
                        reason: '수능 예비소집일 이후 자율학습 제외',
                      });
                    }}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    이 날짜부터 고3 제외 적용
                  </button>
                </div>

                {/* Quick Presets */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-slate-500 font-bold">빠른 설정:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const csatDate = `${year}-11-18`;
                      setG3StartDate(csatDate);
                      onUpdateGrade3Exclusion({
                        enabled: true,
                        startDate: csatDate,
                        reason: '수능 예비소집일 이후 자율학습 제외',
                      });
                    }}
                    className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 text-2xs font-bold border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <GraduationCap className="w-3 h-3" />
                    수능 예비소집일({year}.11.18)부터 적용
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                      setG3StartDate(todayStr);
                      onUpdateGrade3Exclusion({
                        enabled: true,
                        startDate: todayStr,
                        reason: '사용자 지정 일자 이후 자율학습 제외',
                      });
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-2xs font-bold border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    오늘부터 즉시 적용
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateGrade3Exclusion({
                        enabled: false,
                        startDate: g3StartDate || `${year}-11-18`,
                        reason: '수능 예비소집일 이후 자율학습 제외',
                      });
                    }}
                    className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-700 dark:text-rose-300 text-2xs font-bold border border-rose-200 dark:border-rose-800 transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    제외 해제 (3→2→1 복구)
                  </button>
                </div>
              </div>

              {/* Order Visual Preview */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <h5 className="font-extrabold text-xs text-slate-800 dark:text-slate-200">
                  📋 명단 순서 및 출석부 반영 안내
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-2xs">
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="font-bold text-slate-500 mb-1">⚪ 고3 제외 해제 시 (기본)</div>
                    <div className="font-mono text-slate-700 dark:text-slate-300 space-y-0.5">
                      <div>1. 3학년 (1번 ~ 15번) - 정상 출결</div>
                      <div>2. 2학년 (1번 ~ 15번) - 정상 출결</div>
                      <div>3. 1학년 (1번 ~ 15번) - 정상 출결</div>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                    <div className="font-bold text-amber-700 dark:text-amber-300 mb-1">🟢 고3 제외 적용 시</div>
                    <div className="font-mono text-slate-800 dark:text-slate-200 space-y-0.5">
                      <div>1. 2학년 (1번 ~ 15번) - 정상 출결</div>
                      <div>2. 1학년 (1번 ~ 15번) - 정상 출결</div>
                      <div className="text-slate-400 dark:text-slate-500 font-bold">3. 3학년 (1번 ~ 15번) - 진회색 음영(미실시)</div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 4: ACADEMIC YEAR (3월 ~ 2월) SCHOOL EVENTS RESET      */}
          {/* ======================================================== */}
          {activeSubTab === 'academic_year' && (
            <div className="space-y-4">
              
              {/* Permanent Attendance Guarantee Banner */}
              <div className="p-4 bg-emerald-50/80 dark:bg-emerald-950/40 rounded-xl border-2 border-emerald-300 dark:border-emerald-800 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black text-sm">
                    🛡️
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-emerald-950 dark:text-emerald-100">
                      출결 기록 100% 영구 보존 안내
                    </h4>
                    <p className="text-xs text-emerald-700 dark:text-emerald-300">
                      과거 모든 연도 및 월의 <strong>출결 기록(출석/결석 등), 학생 명단, 통계는 절대 지워지지 않습니다.</strong>
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed pl-10">
                  선생님께서 기록하신 출결 데이터는 다년간 상시 조회 및 누적 통계를 위해 영구적으로 보존됩니다. 
                  새 학년도(3월~익년 2월)가 시작될 때는 <strong>지난 학년도에 등록했던 학교 행사(개교기념일, 시험, 수능 등 학사일정 목록)</strong>만 새롭게 정리하여 시작할 수 있습니다.
                </p>
              </div>

              {/* Reset Option 1: Clean Past Academic Year Events Only */}
              <div className="p-4 bg-indigo-50/70 dark:bg-indigo-950/30 rounded-xl border border-indigo-200 dark:border-indigo-800 space-y-3">
                <div className="flex items-start gap-2.5">
                  <RotateCcw className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-extrabold text-xs text-indigo-950 dark:text-indigo-100">
                      이전 학년도({currentAcademicYear - 1}학년도 이전) 학교 행사만 정리
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                      지난 학년도의 지난 행사 목록들만 삭제하고, <strong>올해({currentAcademicYear}학년도) 행사와 모든 출결 기록은 안전하게 보존</strong>합니다.
                    </p>
                  </div>
                </div>

                {!showPastYearConfirm ? (
                  <div className="pt-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowPastYearConfirm(true)}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                      이전 학년도 행사 정리 실행
                    </button>
                  </div>
                ) : (
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-indigo-300 dark:border-indigo-800 space-y-2 animate-in fade-in">
                    <p className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                      이전 학년도({currentAcademicYear - 1}학년도 이전)에 등록된 행사 목록을 정리하시겠습니까?
                    </p>
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
                      * 출결 기록과 학생 명단은 절대 삭제되지 않고 그대로 유지됩니다.
                    </p>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowPastYearConfirm(false)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onResetPastYearEvents();
                          setShowPastYearConfirm(false);
                        }}
                        className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-xs cursor-pointer flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        확인 및 이전 행사 정리
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Reset Option 2: Clean All Events for Fresh New Year Start */}
              <div className="p-4 bg-slate-50 dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-start gap-2.5">
                  <Trash2 className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-extrabold text-xs text-slate-900 dark:text-slate-100">
                      등록된 학교 행사 전체 초기화 (새 학년도 백지 등록용)
                    </h5>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      새 학년도를 맞아 등록된 학교 행사 목록 전체를 비우고 새로 등록할 때 사용합니다.
                      <br />
                      <strong className="text-emerald-600 dark:text-emerald-400">* 출결 기록(출결체크)은 전혀 영향받지 않고 100% 안전하게 유지됩니다.</strong>
                    </p>
                  </div>
                </div>

                {!showAllEventsConfirm ? (
                  <div className="pt-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowAllEventsConfirm(true)}
                      className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      학교 행사 전체 초기화
                    </button>
                  </div>
                ) : (
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-300 dark:border-slate-700 space-y-2 animate-in fade-in">
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      등록된 모든 학교 행사 일정을 초기화하시겠습니까?
                    </p>
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
                      * 출결 기록과 학생 명단은 100% 안전하게 보존되며 행사 목록만 초기화됩니다.
                    </p>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAllEventsConfirm(false)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onResetAllEvents();
                          setShowAllEventsConfirm(false);
                        }}
                        className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-xs cursor-pointer flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        확인 및 행사 전체 초기화
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-850 rounded-b-2xl">
          <div className="text-[11px] text-slate-500 font-medium">
            숭신고등학교 미래인재반
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-xs transition-colors cursor-pointer"
          >
            설정 완료
          </button>
        </div>

      </div>
    </div>
  );
};
