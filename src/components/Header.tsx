import React from 'react';
import { 
  Calendar, 
  LayoutGrid, 
  CheckSquare, 
  Users, 
  BarChart3, 
  FileSpreadsheet, 
  Settings2,
  ChevronLeft,
  ChevronRight,
  Eraser,
  ShieldCheck,
  GraduationCap, 
  Smartphone,
  UserCheck, 
  Tablet,
  Sun,
  Moon,
  RefreshCw,
  RotateCcw
} from 'lucide-react';
import { SessionType, UserRole } from '../types/attendance';
import { SchoolLogo } from './SchoolLogo';

export type ViewTab = 'monthly' | 'daily' | 'students' | 'analytics' | 'kiosk' | 'mobile_teacher';

interface HeaderProps {
  activeTab: ViewTab;
  setActiveTab: (tab: ViewTab) => void;
  session: SessionType;
  setSession: (session: SessionType) => void;
  year: number;
  month: number;
  setYearMonth: (year: number, month: number) => void;
  onOpenExportModal: () => void;
  onOpenMonthConfigModal: () => void;
  onClearAttendance: () => void;
  onOpenDataRecoveryModal?: () => void;
  studentCount?: number;
  userRole: UserRole;
  onOpenRoleModal: () => void;
  onDirectSelectRole?: (role: UserRole) => void;
  lastSyncedTime?: string;
  isSyncing?: boolean;
  onSync?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  session,
  setSession,
  year,
  month,
  setYearMonth,
  onOpenExportModal,
  onOpenMonthConfigModal,
  onClearAttendance,
  onOpenDataRecoveryModal,
  studentCount,
  userRole,
  onOpenRoleModal,
  onDirectSelectRole,
  lastSyncedTime,
  isSyncing = false,
  onSync,
}) => {
  const handlePrevMonth = () => {
    if (month === 1) {
      setYearMonth(year - 1, 12);
    } else {
      setYearMonth(year, month - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      setYearMonth(year + 1, 1);
    } else {
      setYearMonth(year, month + 1);
    }
  };

  // Primary semester months (8월 ~ 12월)
  const semesterMonths = [8, 9, 10, 11, 12];
  // Full school year months (1월 ~ 12월)
  const allMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  // Role metadata
  const roleBadgeConfig = {
    admin: {
      label: '관리자',
      badgeClass: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200/50',
      icon: ShieldCheck,
      desc: '모든 권한',
    },
    teacher: {
      label: '담임교사',
      badgeClass: 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-200/50',
      icon: GraduationCap,
      desc: '월간 출석부 조회 (PC)',
    },
    teacher_mobile: {
      label: '담임(스마트폰)',
      badgeClass: 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-cyan-200/50',
      icon: Smartphone,
      desc: '모바일 출결 조회',
    },
    student: {
      label: '학생',
      badgeClass: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-200/50',
      icon: UserCheck,
      desc: '키오스크 입실 체크',
    },
  };

  const currentRoleConfig = roleBadgeConfig[userRole] || roleBadgeConfig.admin;
  const RoleIcon = currentRoleConfig.icon;

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Top single-row navigation contract */}
        <div className="h-16 flex items-center justify-between gap-3">
          
          {/* Brand Zone */}
          <div className="flex items-center gap-2.5 shrink-0">
            <SchoolLogo size="md" className="shadow-md shadow-rose-950/20" />
            <span className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
              숭신고 미래인재반 출석부
            </span>
          </div>

          {/* Center Navigation Zone: Role-based filtering */}
          <nav className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none bg-slate-100/80 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
            
            {/* 1. 월간 출석부: 관리자, 담임 교사(PC), 학생 모드에서 접근 가능 */}
            {(userRole === 'admin' || userRole === 'teacher' || userRole === 'student') && (
              <button
                onClick={() => setActiveTab('monthly')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'monthly'
                    ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-750'
                }`}
              >
                <LayoutGrid className="w-4 h-4 shrink-0" />
                월간 출석부
                {userRole === 'teacher' && <span className="text-[10px] bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-300 px-1 py-0.2 rounded font-bold">조회</span>}
              </button>
            )}

            {/* 2. 담임(스마트폰) 모드: 스마트폰 오늘 현황 전용 탭 */}
            {userRole === 'teacher_mobile' && (
              <button
                onClick={() => setActiveTab('mobile_teacher')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'mobile_teacher'
                    ? 'bg-cyan-600 text-white shadow-xs'
                    : 'text-cyan-800 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/40 hover:bg-cyan-100'
                }`}
              >
                <Smartphone className="w-4 h-4 shrink-0" />
                <span>오늘 출결 현황</span>
                <span className="text-[10px] bg-cyan-100 dark:bg-cyan-900/60 text-cyan-900 dark:text-cyan-200 px-1 py-0.2 rounded font-bold">모바일</span>
              </button>
            )}

            {/* 3. 일별 빠른 체크: 관리자만 접근 가능 */}
            {userRole === 'admin' && (
              <button
                onClick={() => setActiveTab('daily')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'daily'
                    ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-750'
                }`}
              >
                <CheckSquare className="w-4 h-4 shrink-0" />
                일별 빠른 체크
              </button>
            )}

            {/* 4. 학생 명단: 관리자만 접근 가능 */}
            {userRole === 'admin' && (
              <button
                onClick={() => setActiveTab('students')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'students'
                    ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-750'
                }`}
              >
                <Users className="w-4 h-4 shrink-0" />
                학생 명단 ({studentCount ?? 45}명)
              </button>
            )}

            {/* 5. 통계 및 분석: 관리자, 담임교사(PC), 담임(스마트폰) 접근 가능 */}
            {(userRole === 'admin' || userRole === 'teacher' || userRole === 'teacher_mobile') && (
              <button
                onClick={() => setActiveTab('analytics')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'analytics'
                    ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-750'
                }`}
              >
                <BarChart3 className="w-4 h-4 shrink-0" />
                통계 및 분석
              </button>
            )}

            {/* 6. 입실 키오스크: 학생 모드에서만 표시 (관리자 메뉴 간소화 요청으로 관리자 뷰에서는 제외) */}
            {userRole === 'student' && (
              <button
                onClick={() => setActiveTab('kiosk')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'kiosk'
                    ? 'bg-amber-600 text-white shadow-md shadow-amber-200 dark:shadow-amber-950'
                    : 'text-amber-700 dark:text-amber-300 bg-amber-50/60 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-indigo-900/60'
                }`}
                title="교실 앞 전용 자동 음성 출결 키오스크 화면"
              >
                <Tablet className="w-4 h-4 shrink-0" />
                <span>입실 키오스크</span>
              </button>
            )}
          </nav>

          {/* Action Zone: 4-Role Quick Selector & Sync */}
          <div className="flex items-center gap-2 shrink-0">
            
            {/* Quick 4-Role Toggle Segment */}
            <div className="inline-flex p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold shadow-2xs">
              
              {/* 1. 관리자 */}
              <button
                type="button"
                onClick={() => {
                  if (userRole === 'admin') {
                    onOpenRoleModal();
                  } else {
                    onOpenRoleModal(); // Admin requires PIN
                  }
                }}
                className={`px-2 sm:px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                  userRole === 'admin'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
                title="관리자 모드 (모든 권한)"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span className="hidden md:inline">관리자</span>
              </button>

              {/* 2. 담임교사 (PC) */}
              <button
                type="button"
                onClick={() => onDirectSelectRole ? onDirectSelectRole('teacher') : onOpenRoleModal()}
                className={`px-2 sm:px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                  userRole === 'teacher'
                    ? 'bg-teal-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
                title="담임교사 모드 (PC 월간 출석부 조회)"
              >
                <GraduationCap className="w-3.5 h-3.5" />
                <span className="hidden md:inline">담임</span>
                <span className="md:hidden">담임</span>
              </button>

              {/* 3. 담임(스마트폰) */}
              <button
                type="button"
                onClick={() => onDirectSelectRole ? onDirectSelectRole('teacher_mobile') : onOpenRoleModal()}
                className={`px-2 sm:px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                  userRole === 'teacher_mobile'
                    ? 'bg-cyan-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
                title="담임(스마트폰) 모드 (모바일 출결 조회)"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span className="hidden md:inline">스마트폰</span>
                <span className="md:hidden">폰</span>
              </button>

              {/* 4. 학생 */}
              <button
                type="button"
                onClick={() => onDirectSelectRole ? onDirectSelectRole('student') : onOpenRoleModal()}
                className={`px-2 sm:px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                  userRole === 'student'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
                title="학생 모드 (키오스크 입실 체크 & 학원 요일)"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span className="hidden md:inline">학생</span>
                <span className="md:hidden">학생</span>
              </button>
            </div>

          </div>
        </div>

        {/* Secondary Bar: Session Switcher & 8월~12월 Month Bar */}
        {userRole !== 'teacher_mobile' && (
          <div className="py-2.5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 text-sm">
            
            {/* Session Switcher (Morning 07:30~08:40 / Night 17:30~21:30) */}
            {userRole === 'student' && activeTab === 'kiosk' ? (
              /* 학생 모드 + 키오스크: 시간에 따라 자동 단일 세션만 표시 (오전 아침 / 오후 야간) */
              <div className="inline-flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs">
                {session === 'morning' ? (
                  <div className="px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold bg-white dark:bg-slate-700 text-amber-700 dark:text-amber-300 shadow-xs flex items-center gap-1.5">
                    <Sun className="w-4 h-4 text-amber-500" />
                    <span>아침 자율학습 (오전 자동)</span>
                  </div>
                ) : (
                  <div className="px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs flex items-center gap-1.5">
                    <Moon className="w-4 h-4 text-indigo-500" />
                    <span>야간 자율학습 (오후 자동)</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs">
                <button
                  onClick={() => setSession('morning')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                    session === 'morning'
                      ? 'bg-white dark:bg-slate-700 text-amber-700 dark:text-amber-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  <Sun className="w-4 h-4 text-amber-500" />
                  <span>아침 자율학습</span>
                </button>
                <button
                  onClick={() => setSession('night')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                    session === 'night'
                      ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  <Moon className="w-4 h-4 text-indigo-500" />
                  <span>야간 자율학습</span>
                </button>
              </div>
            )}

            {/* Month Stepper & Action Tools */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Month Stepper & Full Month Dropdown */}
              <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-1.5 py-1 shadow-2xs">
                <button
                  onClick={handlePrevMonth}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                  title="이전 달"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                
                <div className="flex items-center gap-1.5 px-2 font-black text-slate-900 dark:text-slate-100 text-xs sm:text-sm whitespace-nowrap">
                  <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>{year}년</span>
                  <select
                    value={month}
                    onChange={(e) => setYearMonth(year, Number(e.target.value))}
                    className="bg-transparent font-black text-slate-900 dark:text-slate-100 cursor-pointer focus:outline-hidden"
                  >
                    {allMonths.map(m => (
                      <option key={m} value={m} className="text-slate-900 bg-white dark:bg-slate-800">
                        {m}월
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleNextMonth}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                  title="다음 달"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Admin only: Google Sheets Export */}
              {userRole === 'admin' && (
                <button
                  onClick={onOpenExportModal}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold transition-all shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
                  title="구글 스프레드시트 복사 및 엑셀 다운로드"
                >
                  <FileSpreadsheet className="w-4 h-4 shrink-0" />
                  <span>스프레드시트</span>
                </button>
              )}

              {/* Admin only: Clear Attendance Records button (Moved to right of Spreadsheet) */}
              {userRole === 'admin' && (
                <button
                  onClick={onClearAttendance}
                  className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/40 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all font-bold cursor-pointer shrink-0"
                  title="현재 출결 기록 비우기"
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">출결</span> 비우기
                </button>
              )}

              {/* Admin only: Month & Calendar Config */}
              {userRole === 'admin' && (
                <button
                  onClick={onOpenMonthConfigModal}
                  className="p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-slate-200 dark:border-slate-700 shadow-2xs shrink-0 cursor-pointer"
                  title="월별 자습 운영일 및 학사일정 설정"
                >
                  <Settings2 className="w-4 h-4" />
                </button>
              )}

              {/* Sync Button with Last Synced Timestamp */}
              {onSync && (
                <button
                  type="button"
                  onClick={onSync}
                  disabled={isSyncing}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all border border-slate-200 dark:border-slate-700 shadow-2xs cursor-pointer disabled:opacity-60 shrink-0"
                  title={`최신 데이터 동기화 (클릭 시 새로고침)${lastSyncedTime ? `\n마지막 동기화: ${lastSyncedTime}` : ''}`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">동기화</span>
                  {lastSyncedTime && (
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono hidden md:inline">
                      {lastSyncedTime}
                    </span>
                  )}
                </button>
              )}

              {/* Admin only: Data Recovery (데이터 복구) button */}
              {userRole === 'admin' && onOpenDataRecoveryModal && (
                <button
                  type="button"
                  onClick={onOpenDataRecoveryModal}
                  className="text-xs text-emerald-700 dark:text-emerald-300 hover:text-emerald-800 dark:hover:text-emerald-200 flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/60 dark:bg-emerald-950/30 hover:bg-emerald-100/70 dark:hover:bg-emerald-900/50 transition-all font-bold cursor-pointer shrink-0 shadow-2xs"
                  title="출결 및 학생 데이터 백업 복구"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>데이터 복구</span>
                </button>
              )}

            </div>

          </div>
        )}
      </div>
    </header>
  );
};
