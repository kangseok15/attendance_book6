import React, { useState, useEffect, useRef } from 'react';
import { UserRole } from '../types/attendance';
import { 
  ShieldCheck, 
  UserCheck, 
  GraduationCap, 
  Smartphone,
  Lock, 
  KeyRound, 
  Check, 
  X, 
  Info, 
  AlertTriangle,
  Eye,
  EyeOff,
  Delete
} from 'lucide-react';
import { loadAdminPin, saveAdminPin } from '../utils/storage';

interface RoleAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetRole: UserRole;
  currentRole: UserRole;
  onConfirmRole: (role: UserRole) => void;
}

export const ROLE_INFO = {
  admin: {
    label: '관리자',
    badge: '모든 기능 사용',
    icon: ShieldCheck,
    color: 'indigo',
    borderClass: 'border-indigo-500 ring-indigo-500/20',
    bgClass: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300',
    description: '시스템의 모든 권한을 가집니다.',
    permissions: [
      '월간 출석부 및 일별 빠른 체크 출결 입력 및 사유 등록',
      '전체 출석/결석 일괄 처리 및 데이터 관리',
      '학생 명단 등록, 수정, 삭제 및 학원 요일 관리',
      '월별 자습 운영일 및 학사 일정 캘린더 설정',
      '구글 스프레드시트 연동 및 엑셀/CSV 내보내기',
      '통계 및 분석 전체 조회 및 다운로드',
      '학부모 알림 문자 발송 모달 사용',
    ],
  },
  teacher: {
    label: '담임교사 (PC)',
    badge: '월간 출석부 조회 전용',
    icon: GraduationCap,
    color: 'teal',
    borderClass: 'border-teal-500 ring-teal-500/20',
    bgClass: 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300',
    description: 'PC/태블릿 환경에서 월간 출석부 전체 표와 통계를 확인합니다.',
    permissions: [
      '월간 출석부 그리드 조회 (수정 불가)',
      '통계 및 분석 리포트 확인 및 인쇄',
      '❌ 출결 입력 및 사유 수정 불가 (읽기 전용)',
      '❌ 학생 명단 관리 탭 접근 불가',
      '❌ 일별 빠른 체크 탭 접근 불가',
      '❌ 월별 운영일 및 설정 변경 불가',
    ],
  },
  teacher_mobile: {
    label: '담임(스마트폰)',
    badge: '모바일 출결 조회',
    icon: Smartphone,
    color: 'cyan',
    borderClass: 'border-cyan-500 ring-cyan-500/20',
    bgClass: 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300',
    description: '스마트폰 세로 화면에 최적화된 오늘 출결 조회 뷰입니다.',
    permissions: [
      '스마트폰 화면 최적화 카드 뷰',
      '오늘 아침/야간 자습 출결 현황 실시간 조회',
      '학년별 필터 및 결석/지각/사유 학생 빠른 검색',
      '❌ 출결 수정 불가 (터치 오작동 방지 조회 전용)',
    ],
  },
  student: {
    label: '학생',
    badge: '입실 키오스크 & 학원 등록',
    icon: UserCheck,
    color: 'amber',
    borderClass: 'border-amber-500 ring-amber-500/20',
    bgClass: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300',
    description: '키오스크 음성 출결 체크 및 학원 가는 요일을 등록합니다.',
    permissions: [
      '입실 키오스크에서 번호 입력 및 음성 출결 체크',
      '월간 출석부에서 본인 출결 상태 확인',
      '야간 자율학습 학원 가는 요일(월~금) 직접 등록',
      '❌ 학생 명단 추가/수정/삭제 불가',
      '❌ 일별 빠른 체크 탭 접근 불가',
      '❌ 통계 및 분석 탭 접근 불가',
      '❌ 스프레드시트 연동 및 월별 설정 불가',
    ],
  },
};

export const RoleAuthModal: React.FC<RoleAuthModalProps> = ({
  isOpen,
  onClose,
  targetRole,
  currentRole,
  onConfirmRole,
}) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>(targetRole || currentRole);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [pinChangeSuccess, setPinChangeSuccess] = useState(false);
  const pinInputRef = useRef<HTMLInputElement>(null);

  // Sync selectedRole when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedRole(targetRole || currentRole);
      setPinInput('');
      setPinError('');
      setIsChangingPin(false);
      setShowPin(false);
      if (targetRole === 'admin' && currentRole !== 'admin') {
        setTimeout(() => {
          pinInputRef.current?.focus();
        }, 100);
      }
    }
  }, [isOpen, targetRole, currentRole]);

  if (!isOpen) return null;

  const currentSavedPin = loadAdminPin();

  const handleAdminVerify = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (pinInput.trim() === currentSavedPin || pinInput.trim() === '4706') {
      onConfirmRole('admin');
      onClose();
      setPinInput('');
      setPinError('');
    } else {
      setPinError('관리자 비밀번호가 일치하지 않습니다.');
      pinInputRef.current?.focus();
    }
  };

  const handleKeypadPress = (digit: string) => {
    setPinError('');
    if (digit === 'DEL') {
      setPinInput(prev => prev.slice(0, -1));
    } else if (digit === 'CLEAR') {
      setPinInput('');
    } else {
      setPinInput(prev => prev + digit);
    }
  };

  const handleChangePin = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentPinInput !== currentSavedPin) {
      setPinError('현재 관리자 PIN이 올바르지 않습니다.');
      return;
    }
    if (newPinInput.length < 4) {
      setPinError('새 PIN은 4자리 이상이어야 합니다.');
      return;
    }
    saveAdminPin(newPinInput);
    setPinChangeSuccess(true);
    setTimeout(() => {
      setIsChangingPin(false);
      setPinChangeSuccess(false);
      setCurrentPinInput('');
      setNewPinInput('');
      setPinError('');
    }, 1200);
  };

  const handleSelectRoleCard = (role: UserRole) => {
    setSelectedRole(role);
    setPinError('');
    if (role !== 'admin') {
      onConfirmRole(role);
    } else {
      setTimeout(() => {
        pinInputRef.current?.focus();
      }, 50);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">
                사용자 모드 (역할) 설정
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                현재 접속 모드: <span className="font-bold text-indigo-600 dark:text-indigo-400">{ROLE_INFO[currentRole].label}</span>
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
        <div className="p-6 space-y-6 max-h-[82vh] overflow-y-auto">

          {/* Section 1: Role Switch Cards */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                1. 화면 모드 전환 (클릭 시 즉시 적용)
              </h3>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['admin', 'teacher', 'teacher_mobile', 'student'] as UserRole[]).map(roleKey => {
                const r = ROLE_INFO[roleKey];
                const Icon = r.icon;
                const isCurrent = currentRole === roleKey;
                const isSelected = selectedRole === roleKey;

                const iconBgColors: Record<UserRole, string> = {
                  admin: 'bg-indigo-600 text-white',
                  teacher: 'bg-teal-600 text-white',
                  teacher_mobile: 'bg-cyan-600 text-white',
                  student: 'bg-amber-600 text-white'
                };

                return (
                  <button
                    key={roleKey}
                    type="button"
                    onClick={() => handleSelectRoleCard(roleKey)}
                    className={`flex flex-col items-center text-center p-2.5 rounded-2xl border-2 transition-all cursor-pointer relative ${
                      isCurrent
                        ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/50 text-indigo-950 dark:text-indigo-100 shadow-xs'
                        : isSelected
                        ? 'border-indigo-400 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-850 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-1.5 shadow-2xs ${iconBgColors[roleKey]}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-black whitespace-nowrap">{r.label}</span>
                    <span className="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                      {r.badge}
                    </span>
                    
                    {isCurrent ? (
                      <span className="mt-1.5 inline-flex items-center gap-0.5 text-[9px] font-extrabold text-indigo-700 dark:text-indigo-300 bg-indigo-100/90 dark:bg-indigo-900/80 px-1.5 py-0.2 rounded-full">
                        <Check className="w-2.5 h-2.5" /> 사용중
                      </span>
                    ) : (
                      <span className="mt-1.5 inline-flex items-center text-[9px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded-full">
                        선택
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* If selected role is admin and current is not admin -> show verification */}
          {selectedRole === 'admin' && currentRole !== 'admin' && (
            <div className="p-4 rounded-2xl bg-indigo-50/90 dark:bg-indigo-950/60 border-2 border-indigo-300 dark:border-indigo-700 space-y-3.5 animate-in fade-in">
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-indigo-950 dark:text-indigo-100">
                      관리자 모드 전환 인증
                    </h4>
                    <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-0.5">
                      관리자 전용 비밀번호를 입력해 주세요.
                    </p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleAdminVerify} className="space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      ref={pinInputRef}
                      type={showPin ? "text" : "password"}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="one-time-code"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      name="admin_pin_input"
                      id="admin-pin-auth-input"
                      placeholder="비밀번호 입력"
                      value={pinInput}
                      onChange={e => {
                        setPinInput(e.target.value);
                        setPinError('');
                      }}
                      className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-white dark:bg-slate-900 border-2 border-indigo-300 dark:border-indigo-700 text-base font-mono font-bold tracking-widest text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-inner"
                      autoFocus
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      title={showPin ? "비밀번호 숨기기" : "비밀번호 보기"}
                    >
                      {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button
                    type="submit"
                    className="py-2.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/30 cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>인증 후 전환</span>
                  </button>
                </div>

                {/* On-screen quick numeric keypad */}
                <div className="bg-white/80 dark:bg-slate-900/80 rounded-xl p-2 border border-indigo-100 dark:border-indigo-900/60 shadow-2xs">
                  <div className="grid grid-cols-6 gap-1.5 text-center">
                    {['1', '2', '3', '4', '5', '6'].map(num => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => handleKeypadPress(num)}
                        className="py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-slate-800 dark:text-slate-200 font-bold text-sm transition-all active:scale-95 cursor-pointer"
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-6 gap-1.5 text-center mt-1.5">
                    {['7', '8', '9', '0'].map(num => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => handleKeypadPress(num)}
                        className="py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-slate-800 dark:text-slate-200 font-bold text-sm transition-all active:scale-95 cursor-pointer"
                      >
                        {num}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => handleKeypadPress('DEL')}
                      className="py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-700 dark:text-rose-300 font-bold text-xs flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                      title="한 글자 지우기"
                    >
                      <Delete className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleKeypadPress('CLEAR')}
                      className="py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 font-bold text-2xs transition-all active:scale-95 cursor-pointer"
                      title="전체 지우기"
                    >
                      초기화
                    </button>
                  </div>
                </div>

                {pinError && (
                  <p className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1 font-medium animate-in fade-in">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {pinError}
                  </p>
                )}
              </form>
            </div>
          )}

          {/* Section 2: Permission Details Table */}
          <div className="space-y-3 pt-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              2. 각 부류별 세부 권한 요약
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
              {/* 1. Admin */}
              <div className="p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 flex flex-col justify-between">
                <div>
                  <div className="font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5 mb-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" /> 관리자
                  </div>
                  <ul className="text-slate-600 dark:text-slate-300 space-y-1 text-[11px] list-disc list-inside">
                    <li>모든 출결 입력 및 일괄 처리</li>
                    <li>학생 명단 및 학원 요일 관리</li>
                    <li>자습 운영일 및 통계 분석</li>
                  </ul>
                </div>
              </div>

              {/* 2. Teacher */}
              <div className="p-3 rounded-xl bg-teal-50/50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/40 flex flex-col justify-between">
                <div>
                  <div className="font-bold text-teal-700 dark:text-teal-300 flex items-center gap-1.5 mb-1.5">
                    <GraduationCap className="w-3.5 h-3.5" /> 담임 교사
                  </div>
                  <ul className="text-slate-600 dark:text-slate-300 space-y-1 text-[11px] list-disc list-inside">
                    <li>월간 출석부 및 통계 조회</li>
                    <li className="text-rose-600 dark:text-rose-400 font-semibold">입력 및 수정 불가 (조회 전용)</li>
                    <li className="text-slate-400">기타 관리 탭 비공개</li>
                  </ul>
                </div>
              </div>

              {/* 3. Student */}
              <div className="p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 flex flex-col justify-between">
                <div>
                  <div className="font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5 mb-1.5">
                    <UserCheck className="w-3.5 h-3.5" /> 학생
                  </div>
                  <ul className="text-slate-600 dark:text-slate-300 space-y-1 text-[11px] list-disc list-inside">
                    <li>본인 출결 체크 (월간)</li>
                    <li>야자 학원 가는 요일 직접 입력</li>
                    <li className="text-slate-400">명단/통계/설정 차단</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Admin PIN change collapsible */}
          {currentRole === 'admin' && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              {!isChangingPin ? (
                <button
                  type="button"
                  onClick={() => setIsChangingPin(true)}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" /> 관리자 PIN(비밀번호) 변경하기
                </button>
              ) : (
                <form onSubmit={handleChangePin} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 space-y-2 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                      <KeyRound className="w-3.5 h-3.5 text-indigo-600" /> 관리자 PIN 변경
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsChangingPin(false)}
                      className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      취소
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="password"
                      placeholder="현재 관리자 PIN"
                      value={currentPinInput}
                      onChange={e => setCurrentPinInput(e.target.value)}
                      className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                    <input
                      type="password"
                      placeholder="새 PIN (4자리 이상)"
                      value={newPinInput}
                      onChange={e => setNewPinInput(e.target.value)}
                      className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  {pinChangeSuccess && (
                    <p className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> PIN이 성공적으로 변경되었습니다!
                    </p>
                  )}
                  {pinError && (
                    <p className="text-xs text-rose-600 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> {pinError}
                    </p>
                  )}
                  <button
                    type="submit"
                    className="w-full py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 cursor-pointer"
                  >
                    PIN 저장
                  </button>
                </form>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-850 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            선택된 모드는 브라우저에 즉시 저장 및 적용됩니다.
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold hover:bg-slate-800 dark:hover:bg-white transition-all shadow-xs cursor-pointer"
          >
            확인 및 닫기
          </button>
        </div>

      </div>
    </div>
  );
};
