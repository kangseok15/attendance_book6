import { AttendanceStatus, SessionType, Student, DayConfig, SchoolEvent, Grade3ExclusionConfig } from '../types/attendance';
import { DEFAULT_SCHOOL_EVENTS } from '../data/initialData';
import { loadSchoolEvents, loadIncludeWednesdaysInNight, loadGrade3Exclusion } from './storage';

export const DEFAULT_STATUS_META = {
  symbol: '',
  label: '미체크',
  badgeClass: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  cellClass: 'text-slate-300 dark:text-slate-600 font-normal bg-transparent',
  bgHover: 'hover:bg-slate-100 dark:hover:bg-slate-800',
  description: '미입력 (빈칸)',
};

export const STATUS_META: Record<
  AttendanceStatus,
  {
    symbol: string;
    label: string;
    badgeClass: string;
    cellClass: string;
    bgHover: string;
    description: string;
  }
> = {
  PRESENT: {
    symbol: '○',
    label: '출석',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700',
    cellClass: 'text-emerald-700 dark:text-emerald-400 font-black bg-emerald-50/60 dark:bg-emerald-950/30',
    bgHover: 'hover:bg-emerald-100/70 dark:hover:bg-emerald-900/40',
    description: '정상 입실 및 학습 (○)',
  },
  LATE: {
    symbol: '△',
    label: '지각',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700',
    cellClass: 'text-amber-700 dark:text-amber-400 font-black bg-amber-50/70 dark:bg-amber-950/30',
    bgHover: 'hover:bg-amber-100/70 dark:hover:bg-amber-900/40',
    description: '지정 시간 이후 입실 (△)',
  },
  ABSENT: {
    symbol: 'X',
    label: '결석',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-700',
    cellClass: 'text-rose-600 dark:text-rose-400 font-black bg-rose-50/50 dark:bg-rose-950/30',
    bgHover: 'hover:bg-rose-100/70 dark:hover:bg-rose-900/40',
    description: '미입실 (X: 결석)',
  },
  NONE: {
    symbol: '', // 기본 미입력 빈칸
    label: '미체크',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    cellClass: 'text-slate-300 dark:text-slate-600 font-normal bg-transparent',
    bgHover: 'hover:bg-slate-100 dark:hover:bg-slate-800',
    description: '미입력 (빈칸)',
  },
  EXCUSED: {
    symbol: '인',
    label: '인정',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-700',
    cellClass: 'text-blue-700 dark:text-blue-400 font-bold bg-blue-50/60 dark:bg-blue-950/20',
    bgHover: 'hover:bg-blue-100 dark:hover:bg-blue-900/40',
    description: '공식 행사, 병결, 사유 인정 (인정결석)',
  },
  EARLY_LEAVE: {
    symbol: 'Ø', // 동그라미(○)에 슬래시(/)가 관통된 조퇴 기호
    label: '조퇴',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-700',
    cellClass: 'text-purple-700 dark:text-purple-400 font-black bg-purple-50/60 dark:bg-purple-950/20',
    bgHover: 'hover:bg-purple-100 dark:hover:bg-purple-900/40',
    description: '중도 퇴실 (조퇴: ○에 슬래시 관통)',
  },
};

/**
 * 학생 모드 시간별 자동 세션 계산:
 * - 오전 00:00 ~ 12:00 -> 'morning' (아침 자율학습)
 * - 오후 12:01 ~ 23:59 -> 'night' (야간 자율학습)
 */
export function getAutoSessionByCurrentTime(): SessionType {
  const now = new Date();
  const totalMins = now.getHours() * 60 + now.getMinutes();
  // 12:00은 720분. 0~720분(오전 00:00~12:00)은 아침 자율학습, 721분 이상은 야간 자율학습
  return totalMins <= 720 ? 'morning' : 'night';
}

/**
 * 상태값 조회 방어 헬퍼 (White Screen Crash 방지)
 */
export function getStatusMeta(status?: AttendanceStatus | string | null) {
  if (!status) return DEFAULT_STATUS_META;
  if (status === 'OFFICIAL_ABSENT') return STATUS_META.EXCUSED;
  return STATUS_META[status as AttendanceStatus] || DEFAULT_STATUS_META;
}

/**
 * 클릭 순서: 빈칸 → 출석(또는 시간초과시 지각) → 조퇴 → 인정(인) → 결석(X) → 빈칸
 * - 아침 자율학습(morning): 07:30 이후 체크 시 지각(△)으로 자동 표시
 * - 야간 자율학습(night): 17:30 이후 체크 시 지각(△)으로 자동 표시
 */
export function getNextAttendanceStatus(
  curStatus: AttendanceStatus,
  session: SessionType,
  timeStr?: string
): { nextStatus: AttendanceStatus; checkInTime: string } {
  const now = new Date();
  const currentTime = timeStr || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // 1. 빈칸(NONE)에서 클릭 -> 출석 또는 지각 자동 판정
  if (curStatus === 'NONE') {
    const [hours, minutes] = currentTime.split(':').map(Number);
    const timeInMinutes = hours * 60 + minutes;

    let isLate = false;
    if (session === 'morning') {
      // 아침: 07:30 (450분) 이후는 지각
      isLate = timeInMinutes > (7 * 60 + 30);
    } else {
      // 야간: 17:30 (1050분) 이후는 지각
      isLate = timeInMinutes > (17 * 60 + 30);
    }

    return {
      nextStatus: isLate ? 'LATE' : 'PRESENT',
      checkInTime: currentTime,
    };
  }

  // 2. 출석(PRESENT) 또는 지각(LATE)에서 클릭 -> 조퇴(EARLY_LEAVE)
  if (curStatus === 'PRESENT' || curStatus === 'LATE') {
    return {
      nextStatus: 'EARLY_LEAVE',
      checkInTime: currentTime,
    };
  }

  // 3. 조퇴(EARLY_LEAVE)에서 클릭 -> 인정(EXCUSED)
  if (curStatus === 'EARLY_LEAVE') {
    return {
      nextStatus: 'EXCUSED',
      checkInTime: currentTime,
    };
  }

  // 4. 인정(EXCUSED)에서 클릭 -> 결석(ABSENT)
  if (curStatus === 'EXCUSED') {
    return {
      nextStatus: 'ABSENT',
      checkInTime: currentTime,
    };
  }

  // 5. 결석(ABSENT)에서 클릭 -> 빈칸(NONE)
  return {
    nextStatus: 'NONE',
    checkInTime: '',
  };
}

export const NEXT_STATUS_CYCLE: Record<AttendanceStatus, AttendanceStatus> = {
  NONE: 'PRESENT',
  PRESENT: 'EARLY_LEAVE',
  LATE: 'EARLY_LEAVE',
  EARLY_LEAVE: 'EXCUSED',
  EXCUSED: 'ABSENT',
  ABSENT: 'NONE',
};

/**
 * 오늘 한국 표준시(KST) 날짜 객체 반환
 */
export function getKoreanDate(): { year: number; month: number; day: number; dateStr: string } {
  try {
    const formatter = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(new Date());
    const y = parseInt(parts.find(p => p.type === 'year')?.value || '2026', 10);
    const m = parseInt(parts.find(p => p.type === 'month')?.value || '8', 10);
    const d = parseInt(parts.find(p => p.type === 'day')?.value || '28', 10);
    return {
      year: y,
      month: m,
      day: d,
      dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    };
  } catch {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    return {
      year: y,
      month: m,
      day: d,
      dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    };
  }
}

/**
 * 오늘 날짜 문자열 (YYYY-MM-DD)
 */
export function getTodayDateStr(): string {
  return getKoreanDate().dateStr;
}

/**
 * 활성 일자 중 오늘 날짜(또는 오늘 이전의 가장 최근 활성 일자) 반환
 * - 오늘이 활성일이면 오늘 날짜 반환 (예: 29일이 평일이면 29일)
 * - 오늘(29일)이 주말/휴일 등으로 활성일이 아니면, 이전 평일/활성일인 28일(금) 반환
 * - 이전 활성일이 없으면(월초 개학 전 등) 첫 번째 활성일 반환
 */
export function getTodayOrClosestActiveDate(activeDays: DayConfig[], currentYear?: number, currentMonth?: number): string {
  if (!activeDays || activeDays.length === 0) {
    return getTodayDateStr();
  }

  const kDate = getKoreanDate();
  
  // activeDays의 연도와 월 추출
  const [activeYearStr, activeMonthStr] = activeDays[0].dateStr.split('-');
  const aYear = currentYear || parseInt(activeYearStr, 10);
  const aMonth = currentMonth || parseInt(activeMonthStr, 10);

  // 현재 보고 있는 월의 오늘 기준 날짜 (예: 2026-08-29)
  const targetDayNum = Math.min(31, Math.max(1, kDate.day));
  const targetDateStr = `${aYear}-${String(aMonth).padStart(2, '0')}-${String(targetDayNum).padStart(2, '0')}`;

  // 1. 오늘 날짜가 활성 일자에 정확히 있으면 반환 (예: 29일이 활성일인 경우)
  const exactMatch = activeDays.find(d => d.dateStr === targetDateStr);
  if (exactMatch) {
    return exactMatch.dateStr;
  }

  // 2. 오늘 이전의 가장 최근 활성 일자 찾기 (예: 오늘이 29일(토)이면 28일(금) 반환)
  const pastDays = activeDays.filter(d => d.dateStr <= targetDateStr);
  if (pastDays.length > 0) {
    return pastDays[pastDays.length - 1].dateStr;
  }

  // 3. 없으면 첫 번째 활성 일자
  return activeDays[0].dateStr;
}

/**
 * 활성 일자 중 오늘 날짜(또는 fallback/가장 가까운 일자) 반환
 */
export function getBestActiveDate(activeDays: DayConfig[], fallbackDateStr?: string): string {
  if (!activeDays || activeDays.length === 0) {
    return fallbackDateStr || getTodayDateStr();
  }
  
  // 만약 지정된 fallbackDateStr가 활성 일자에 존재하면 유지
  if (fallbackDateStr) {
    const fallbackMatch = activeDays.find(d => d.dateStr === fallbackDateStr);
    if (fallbackMatch) {
      return fallbackMatch.dateStr;
    }
  }
  
  return getTodayOrClosestActiveDate(activeDays);
}

/**
 * 학년 정렬 순서 반환:
 * - 기본값: [3, 2, 1] (3학년 -> 2학년 -> 1학년)
 * - 고3 제외 설정이 활성화되어 있고, 지정일자 이후(또는 해당 월)인 경우:
 *   [2, 1, 3] (2학년 -> 1학년 -> 3학년)으로 고3이 1학년 밑으로 이동
 * - 11월, 12월도 고3 제외 설정이 켜져있지 않으면 기본 [3, 2, 1] 순서 유지
 */
export function getGradeOrder(
  month?: number,
  dateStr?: string,
  grade3Config?: Grade3ExclusionConfig
): number[] {
  let cfg = grade3Config;
  if (!cfg) {
    try {
      cfg = loadGrade3Exclusion();
    } catch {
      cfg = { enabled: false, startDate: '2026-11-18' };
    }
  }

  // 고3 제외 설정이 꺼져 있으면 모든 월/일자 원래 순서 [3, 2, 1] 유지
  if (!cfg || !cfg.enabled) {
    return [3, 2, 1];
  }

  // 날짜 기준 판별
  if (dateStr) {
    if (!cfg.startDate || dateStr >= cfg.startDate) {
      return [2, 1, 3]; // 고3이 1학년 밑으로 내려감
    }
    return [3, 2, 1];
  }

  // 월 기준 판별
  if (month && cfg.startDate) {
    const parts = cfg.startDate.split('-');
    const startMonth = parseInt(parts[1], 10);
    // 제외 시작월 이상이거나 1~2월(이듬해 2월까지)인 경우 고3이 밑으로 내려감
    if (month >= startMonth || month <= 2) {
      return [2, 1, 3];
    }
    return [3, 2, 1];
  }

  return cfg.enabled ? [2, 1, 3] : [3, 2, 1];
}

/**
 * 학생 자동 정렬 함수 (학년 -> 반 -> 번호 -> 이름 순)
 * - 학년 순서: gradeOrder (기본 [3, 2, 1] 또는 월별 getGradeOrder(month))
 * - 반 (classNum 오름차순: 1반 -> 2반 -> 3반 ...)
 * - 번호 (studentNum 오름차순: 1번 -> 2번 -> 3번 ...)
 * - 이름 (가나다 오름차순)
 *
 * reassignSeq: true일 경우 학년별 연번(seq: 1, 2, 3...)을 순서대로 자동 재부여합니다.
 */
export function sortStudents(
  students: Student[],
  gradeOrder: number[] = [3, 2, 1],
  reassignSeq: boolean = true
): Student[] {
  const sorted = [...students].sort((a, b) => {
    // 1. 학년 순서 비교
    const aGradeIdx = gradeOrder.indexOf(a.grade);
    const bGradeIdx = gradeOrder.indexOf(b.grade);
    const aOrder = aGradeIdx === -1 ? 99 : aGradeIdx;
    const bOrder = bGradeIdx === -1 ? 99 : bGradeIdx;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }

    // 2. 반 (classNum 오름차순)
    const aClass = Number(a.classNum) || 0;
    const bClass = Number(b.classNum) || 0;
    if (aClass !== bClass) {
      return aClass - bClass;
    }

    // 3. 번호 (studentNum 오름차순)
    const aNum = Number(a.studentNum) || 0;
    const bNum = Number(b.studentNum) || 0;
    if (aNum !== bNum) {
      return aNum - bNum;
    }

    // 4. 이름 (가나다 오름차순)
    return (a.name || '').localeCompare(b.name || '', 'ko');
  });

  if (reassignSeq) {
    let currentGrade = -1;
    let gradeSeq = 0;

    return sorted.map(st => {
      if (st.grade !== currentGrade) {
        currentGrade = st.grade;
        gradeSeq = 1;
      } else {
        gradeSeq++;
      }
      return {
        ...st,
        seq: gradeSeq,
      };
    });
  }

  return sorted;
}

/**
 * 5자리 학번 코드 생성 헬퍼
 * 예: 3학년 1반 19번 -> "30119" (3 + 01 + 19)
 * 2학년 4반 7번 -> "20407" (2 + 04 + 07)
 */
export function getStudentCode5Digit(student: Student | { grade: number; classNum: number; studentNum: number }): string {
  const g = String(student.grade || 0);
  const c = String(student.classNum || 0).padStart(2, '0');
  const n = String(student.studentNum || 0).padStart(2, '0');
  return `${g}${c}${n}`;
}

export const WEEKDAYS = ['월', '화', '수', '목', '금'] as const;
export const DEFAULT_NIGHT_DAYS = ['월', '화', '수', '목', '금'];

/**
 * 특정 일자/학년별 제외 여부 (수능 예비소집일/수능일 이후 고3 출석부 자동 음영 처리)
 * 1. 고3 제외 설정(grade3Config)이 켜져 있는 경우: 지정된 제외 시작일 이후 3학년 자동 음영 처리
 * 2. 등록된 학교 행사 중 수능일(isCsat=true)이 있는 경우: 수능일 이후 3학년 자동 음영 처리
 */
export function isStudentExcludedOnDate(
  grade: number,
  dateStr: string,
  customEvents?: SchoolEvent[],
  grade3Config?: Grade3ExclusionConfig
): boolean {
  if (grade !== 3) return false;

  let cfg = grade3Config;
  if (!cfg) {
    try {
      cfg = loadGrade3Exclusion();
    } catch {
      cfg = { enabled: false, startDate: '2026-11-18' };
    }
  }

  // 1. 고3 제외 탭 설정이 활성화된 경우
  if (cfg && cfg.enabled) {
    if (!cfg.startDate || dateStr >= cfg.startDate) {
      return true;
    }
  }

  // 2. 등록된 학교 행사 중 수능일(isCsat=true) 연동
  let events: SchoolEvent[];
  try {
    events = customEvents || loadSchoolEvents();
  } catch {
    events = DEFAULT_SCHOOL_EVENTS;
  }

  const dateParts = dateStr.split('-');
  const dateYear = parseInt(dateParts[0], 10);
  const dateMonth = parseInt(dateParts[1], 10);
  const currentAcademicYear = dateMonth >= 3 ? dateYear : dateYear - 1;

  const csatEvent = events.find(e => {
    if (!e.isCsat && !e.title.includes('수능')) return false;
    if (e.title.includes('모의')) return false;
    const eParts = e.dateStr.split('-');
    const eYear = parseInt(eParts[0], 10);
    const eMonth = parseInt(eParts[1], 10);
    const eAcademicYear = eMonth >= 3 ? eYear : eYear - 1;
    return eAcademicYear === currentAcademicYear;
  });

  if (csatEvent && dateStr >= csatEvent.dateStr) {
    return true; // 수능일 이후 고3 출석부 음영 처리
  }

  return false;
}

export function getKoreanDayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return days[d.getDay()];
}

/**
 * 학생의 학원 가는 요일(야자 미참여 요일) 목록 조회
 * monthOrDate (예: 8, 9, '2026-08-25', '2026-08')가 주어지면 해당 월의 학원 요일을 우선 반환
 * 체크된 요일 = 학원 가는 날 (야자 미참여 / 출석부 진회색 음영 처리)
 */
export function getStudentAcademyDays(student: Student, monthOrDate?: number | string): string[] {
  let targetMonth: number | undefined;
  if (typeof monthOrDate === 'number') {
    targetMonth = monthOrDate;
  } else if (typeof monthOrDate === 'string' && monthOrDate.trim()) {
    if (monthOrDate.includes('-')) {
      const parts = monthOrDate.split('-');
      if (parts.length >= 2) {
        const parsed = parseInt(parts[1], 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 12) {
          targetMonth = parsed;
        }
      }
    } else {
      const parsed = parseInt(monthOrDate, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 12) {
        targetMonth = parsed;
      }
    }
  }

  // 1. 월별 독립 저장소(academyDaysByMonth)에 해당 월의 설정이 있는 경우
  if (targetMonth !== undefined && student.academyDaysByMonth) {
    if (student.academyDaysByMonth[targetMonth] !== undefined) {
      return student.academyDaysByMonth[targetMonth];
    }
    if (student.academyDaysByMonth[String(targetMonth)] !== undefined) {
      return student.academyDaysByMonth[String(targetMonth)];
    }
  }

  // 2. 기본 academyDays 배열 (하위 호환)
  if (Array.isArray(student.academyDays)) {
    return student.academyDays;
  }

  // 3. 이전 nightDays 데이터 하위 호환
  if (Array.isArray(student.nightDays)) {
    const allWeekdays = ['월', '화', '수', '목', '금'];
    return allWeekdays.filter(d => !student.nightDays!.includes(d));
  }

  return [];
}

/**
 * 특정 월의 학생 학원 가는 요일 독립 업데이트
 * 이전 월의 설정은 그대로 유지하고 지정된 월만 독립적으로 변경
 */
export function updateStudentAcademyDaysForMonth(
  student: Student,
  month: number,
  nextAcademyDays: string[]
): Student {
  const existingByMonth: Record<number | string, string[]> = { ...(student.academyDaysByMonth || {}) };

  // 만약 academyDaysByMonth가 비어있는 상태에서 최초로 특정 월을 수정할 경우,
  // 기존 academyDays가 있었다면 다른 월들도 기존 값으로 초기화하여 과거 월이 소급 변경되는 것 방지
  if (Object.keys(existingByMonth).length === 0 && Array.isArray(student.academyDays) && student.academyDays.length > 0) {
    [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2].forEach(m => {
      if (m !== month) {
        existingByMonth[m] = [...student.academyDays!];
      }
    });
  }

  existingByMonth[month] = nextAcademyDays;

  const allWeekdays = ['월', '화', '수', '목', '금'];
  const nextNightDays = allWeekdays.filter(d => !nextAcademyDays.includes(d));

  return {
    ...student,
    academyDays: nextAcademyDays, // 최신 값 동기화
    academyDaysByMonth: existingByMonth,
    nightDays: nextNightDays
  };
}

/**
 * 학생이 특정 일자/세션에서 제외(음영 처리) 대상인지 판별
 * 1. 3학년 수능 예비소집일/수능일 이후 아침/야간 공통 음영 처리 (고3 제외 설정 또는 수능일 등록 시 자동 적용)
 * 2. 아침 자율학습: 전원 의무 참여 (학원 요일 음영 처리 안 함, 전원 출결 대상)
 * 3. 야간 자율학습: 
 *    - 수요일 야자 실시 옵션이 꺼져있으면 수요일 전원 음영 처리
 *    - 학생이 체크한 학원 가는 요일(화, 목 등)은 야자 미참여일이므로 진회색 음영 처리 (출결 표시 불가)
 */
export function isStudentExcluded(
  student: Student,
  session: SessionType,
  dateStr: string,
  dayOfWeek?: string,
  customEvents?: SchoolEvent[],
  includeWednesdaysInNight?: boolean,
  grade3Config?: Grade3ExclusionConfig
): boolean {
  // 1. 3학년 수능 예비소집일/수능 후 제외 (아침/야간 공통)
  if (isStudentExcludedOnDate(student.grade, dateStr, customEvents, grade3Config)) {
    return true;
  }

  // 2. 야간 자율학습(night)의 경우:
  if (session === 'night') {
    const dayName = dayOfWeek || getKoreanDayOfWeek(dateStr);
    
    let allowWedNight = includeWednesdaysInNight;
    if (allowWedNight === undefined) {
      try {
        allowWedNight = loadIncludeWednesdaysInNight();
      } catch {
        allowWedNight = false;
      }
    }

    if (dayName === '수' && !allowWedNight) {
      return true; // 수요일 야자 미실시 -> 전교생 야자 음영 제외
    }

    const academyDays = getStudentAcademyDays(student, dateStr);
    if (academyDays.includes(dayName)) {
      return true; // 야간 학원 가는 날 -> 야자 미참여 진회색 음영 처리 (출결 표시 X)
    }
  }

  return false;
}

export function getRecordKey(studentId: string, session: SessionType, dateStr: string): string {
  return `${studentId}_${session}_${dateStr}`;
}

export function formatStudentCode(student: Student): string {
  return `${student.grade}학년 ${student.classNum}반 ${String(student.studentNum).padStart(2, '0')}번`;
}

export function formatShortCode(student: Student): string {
  return `${student.grade}-${student.classNum}-${student.studentNum}`;
}

export function calculateDayStats(
  students: Student[],
  session: SessionType,
  dateStr: string,
  records: Record<string, { status: AttendanceStatus; reason?: string }>,
  dayOfWeek?: string
) {
  const activeStudents = students.filter(s => s.active);
  const byGrade = {
    1: { total: 0, present: 0, absent: 0, late: 0, excused: 0, early: 0, rate: 0, isExcluded: false },
    2: { total: 0, present: 0, absent: 0, late: 0, excused: 0, early: 0, rate: 0, isExcluded: false },
    3: { total: 0, present: 0, absent: 0, late: 0, excused: 0, early: 0, rate: 0, isExcluded: false },
  };

  let totalEnrolled = 0;
  let totalPresent = 0;
  let totalAbsent = 0;
  let totalLate = 0;
  let totalExcused = 0;
  let totalEarly = 0;

  activeStudents.forEach(st => {
    const g = st.grade;
    const isExcluded = isStudentExcluded(st, session, dateStr, dayOfWeek);
    
    if (isExcluded) {
      return;
    }

    const key = getRecordKey(st.id, session, dateStr);
    const rec = records[key];
    const status = rec?.status || 'NONE';

    byGrade[g].total++;
    totalEnrolled++;

    if (status === 'PRESENT') {
      byGrade[g].present += 1;
      totalPresent += 1;
    } else if (status === 'LATE') {
      byGrade[g].late += 1;
      totalLate += 1;
      // 지각: 출석 1로 계산
      byGrade[g].present += 1;
      totalPresent += 1;
    } else if (status === 'EXCUSED') {
      byGrade[g].excused += 1;
      totalExcused += 1;
      // 공결/인정도 출석으로 인정
      byGrade[g].present += 1;
      totalPresent += 1;
    } else if (status === 'EARLY_LEAVE') {
      byGrade[g].early += 1;
      totalEarly += 1;
      // 조퇴: 출석 1로 계산
      byGrade[g].present += 1;
      totalPresent += 1;
    } else if (status === 'ABSENT') {
      byGrade[g].absent += 1;
      totalAbsent += 1;
    }
  });

  [1, 2, 3].forEach(g => {
    const gr = byGrade[g as 1 | 2 | 3];
    const checked = gr.present + gr.absent;
    gr.rate = checked > 0 ? Math.round((gr.present / checked) * 100) : (gr.total > 0 ? 0 : 0);
  });

  const checkedTotal = totalPresent + totalAbsent;
  const overallRate = checkedTotal > 0 ? Math.round((totalPresent / checkedTotal) * 100) : 0;

  return {
    byGrade,
    totalEnrolled,
    totalPresent,
    totalAbsent,
    totalLate,
    totalExcused,
    totalEarly,
    overallRate,
  };
}

export function formatKoreanDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  const dateObj = new Date(parseInt(parts[0], 10), m - 1, d);
  const dayName = ['일', '월', '화', '수', '목', '금', '토'][dateObj.getDay()] || '';
  return `${m}월 ${d}일 (${dayName})`;
}

export function calculateStudentMonthStats(
  student: Student,
  session: SessionType,
  activeDays: DayConfig[],
  records: Record<string, { status: AttendanceStatus; reason?: string }>,
  targetDateStr?: string
) {
  const todayStr = targetDateStr || getTodayDateStr();

  // 제외 대상 날짜 필터링 (3학년 11/17 이후 제외 + 야간자율학습 미신청 요일 음영 제외)
  const studentActiveDays = activeDays.filter(d => !isStudentExcluded(student, session, d.dateStr, d.dayOfWeek));
  const fullMonthDays = studentActiveDays.length; // 이번달 전체 운영일수

  let rawPresentCount = 0; // 순수 출석(○)
  let lateCount = 0;       // 지각(△)
  let excusedCount = 0;    // 인정(인/공)
  let earlyLeaveCount = 0; // 조퇴(⊘)
  let rawAbsentCount = 0;  // 기록된 결석(X)
  let unrecordedCount = 0; // 오늘까지의 빈칸(미체크)
  let futureRecordedCount = 0; // 미래 날짜에 미리 기록된 수
  let elapsedTargetDays = 0; // 오늘까지 출석해야 하는 총 운영일수

  studentActiveDays.forEach(day => {
    const key = getRecordKey(student.id, session, day.dateStr);
    const rec = records[key];
    const status = rec?.status || 'NONE';
    const isPastOrToday = day.dateStr <= todayStr;

    if (isPastOrToday) {
      elapsedTargetDays++;
      if (status === 'PRESENT') rawPresentCount++;
      else if (status === 'LATE') lateCount++;
      else if (status === 'EXCUSED') excusedCount++;
      else if (status === 'EARLY_LEAVE') earlyLeaveCount++;
      else if (status === 'ABSENT') rawAbsentCount++;
      else unrecordedCount++; // 오늘 및 과거의 미체크 빈칸은 결석으로 처리
    } else {
      // 미래 일자: 빈칸(NONE)은 아직 오지 않은 날이므로 결석으로 치지 않음!
      if (status === 'PRESENT') {
        rawPresentCount++;
        futureRecordedCount++;
      } else if (status === 'LATE') {
        lateCount++;
        futureRecordedCount++;
      } else if (status === 'EXCUSED') {
        excusedCount++;
        futureRecordedCount++;
      } else if (status === 'EARLY_LEAVE') {
        earlyLeaveCount++;
        futureRecordedCount++;
      } else if (status === 'ABSENT') {
        rawAbsentCount++;
        futureRecordedCount++;
      }
    }
  });

  // 오늘 날짜 기준 출석 대상 일수 (미래에 미리 체크된 것이 있다면 포함)
  const totalDays = elapsedTargetDays + futureRecordedCount;

  // 지각(△), 조퇴(⊘), 공결/인정(인)은 출석 1로 계산 (출석 인정)
  const presentCount = rawPresentCount + lateCount + earlyLeaveCount + excusedCount;
  
  // 결석 = 기록된 결석(X) + 오늘까지의 미체크 빈칸
  const absentCount = rawAbsentCount + unrecordedCount;

  // 체크 완료된 기록 수 (순수 체크된 수)
  const checkedDays = rawPresentCount + lateCount + earlyLeaveCount + excusedCount + rawAbsentCount;
  
  // 오늘 날짜 기준 출석률 계산 (오늘까지 경과된 운영일 기준)
  const clampedRate = totalDays > 0 ? Math.min(100, Math.max(0, Math.round((presentCount / totalDays) * 100))) : 0;
  const rate = totalDays > 0 ? `${clampedRate}%` : '-';
  const rateNum = clampedRate;

  return {
    totalDays,        // 오늘 날짜 기준 출석 대상 일수 (출석 예정)
    fullMonthDays,    // 이번달 전체 총 운영일수
    rawPresentCount,  // 순수 출석(○)
    rawAbsentCount,   // 기록된 결석(X)
    unrecordedCount,  // 미체크 빈칸
    presentCount,     // 총 출석 합산 (○ + △ + ⊘ + 인)
    absentCount,      // 총 결석 합산 (X + 빈칸)
    lateCount,        // 지각(△)
    excusedCount,     // 인정(인)
    earlyLeaveCount,  // 조퇴(⊘)
    checkedDays,      // 실제 체크된 횟수
    rate,             // 월간 출석률 문자열
    rateNum,          // 월간 출석률 숫자
    isFullyExcluded: fullMonthDays === 0,
  };
}
