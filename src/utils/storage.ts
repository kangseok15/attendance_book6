import { Student, AttendanceStatus, SessionType, DayConfig, UserRole, SchoolEvent, Grade3ExclusionConfig, AttendanceRecord, DataSnapshot } from '../types/attendance';
import { INITIAL_STUDENTS, generateEmptyRecords, DEFAULT_SCHOOL_EVENTS } from '../data/initialData';
import { 
  getRecordKey, 
  STATUS_META, 
  isStudentExcluded, 
  isStudentExcludedOnDate, 
  getGradeOrder,
  calculateStudentMonthStats, 
  getStudentAcademyDays,
  sortStudents
} from './attendanceHelpers';

const STORAGE_KEYS = {
  STUDENTS: 'soongshin_mirae_students_v11',
  OLD_V10_STUDENTS: 'soongshin_mirae_students_v10',
  OLD_V9_STUDENTS: 'soongshin_mirae_students_v9',
  OLD_V8_STUDENTS: 'soongshin_mirae_students_v8',
  OLD_V7_STUDENTS: 'soongshin_mirae_students_v7',
  OLD_V6_STUDENTS: 'soongshin_mirae_students_v6',
  RECORDS: 'soongshin_mirae_records_v6',
  YEAR: 'soongshin_mirae_year_v6',
  MONTH: 'soongshin_mirae_month_v6',
  CUSTOM_DAYS: 'soongshin_mirae_custom_days_v6',
  USER_ROLE: 'soongshin_mirae_user_role_v1',
  ADMIN_PIN: 'soongshin_mirae_admin_pin_v1',
  SCHOOL_EVENTS: 'soongshin_mirae_school_events_v1',
  INCLUDE_WED_NIGHT: 'soongshin_mirae_include_wed_night_v1',
  GRADE3_EXCLUSION: 'soongshin_mirae_grade3_exclusion_v1',
  SNAPSHOTS: 'soongshin_mirae_snapshots_v1',
};

/**
 * 학년도 계산 (3월 ~ 익년 2월)
 * - 3월 ~ 12월: 해당 연도 학년도 (예: 2026년 8월 -> 2026학년도)
 * - 1월 ~ 2월: 전년도 학년도 (예: 2027년 2월 -> 2026학년도)
 */
export function getAcademicYear(year: number, month: number): number {
  return month >= 3 ? year : year - 1;
}

export function getAcademicYearLabel(year: number, month: number): string {
  const ay = getAcademicYear(year, month);
  return `${ay}학년도 (${ay}.03 ~ ${ay + 1}.02)`;
}

export function loadIncludeWednesdaysInNight(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.INCLUDE_WED_NIGHT);
    if (saved !== null) {
      return saved === 'true';
    }
  } catch (e) {
    console.error('Failed to load include wednesday night setting:', e);
  }
  return false; // 기본값: 수요일 야자 미실시
}

export function saveIncludeWednesdaysInNight(include: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.INCLUDE_WED_NIGHT, String(include));
  } catch (e) {
    console.error('Failed to save include wednesday night setting:', e);
  }
}

export const DEFAULT_GRADE3_EXCLUSION: Grade3ExclusionConfig = {
  enabled: false, // 기본값: 고3 제외 미적용 (정상 순서: 3학년 -> 2학년 -> 1학년)
  startDate: '2026-11-18', // 수능 예비소집일 기준
  reason: '수능 예비소집일 이후 자율학습 제외',
};

export function loadGrade3Exclusion(): Grade3ExclusionConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.GRADE3_EXCLUSION);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (typeof parsed === 'object' && parsed !== null) {
        return {
          enabled: !!parsed.enabled,
          startDate: parsed.startDate || '2026-11-18',
          reason: parsed.reason || '수능 예비소집일 이후 자율학습 제외',
        };
      }
    }
  } catch (e) {
    console.error('Failed to load grade3 exclusion config:', e);
  }
  return DEFAULT_GRADE3_EXCLUSION;
}

export function saveGrade3Exclusion(config: Grade3ExclusionConfig): void {
  try {
    localStorage.setItem(STORAGE_KEYS.GRADE3_EXCLUSION, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save grade3 exclusion config:', e);
  }
}

export function loadSchoolEvents(): SchoolEvent[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.SCHOOL_EVENTS);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load school events:', e);
  }
  saveSchoolEvents(DEFAULT_SCHOOL_EVENTS);
  return DEFAULT_SCHOOL_EVENTS;
}

export function saveSchoolEvents(events: SchoolEvent[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SCHOOL_EVENTS, JSON.stringify(events));
  } catch (e) {
    console.error('Failed to save school events:', e);
  }
}

export function loadUserRole(): UserRole {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.USER_ROLE);
    if (saved === 'admin' || saved === 'teacher' || saved === 'teacher_mobile' || saved === 'student') {
      return saved;
    }
  } catch (e) {
    console.error('Failed to load user role:', e);
  }
  return 'admin';
}

export function saveUserRole(role: UserRole): void {
  try {
    localStorage.setItem(STORAGE_KEYS.USER_ROLE, role);
  } catch (e) {
    console.error('Failed to save user role:', e);
  }
}

export const DEFAULT_ADMIN_PIN = '4706';

export function loadAdminPin(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.ADMIN_PIN) || DEFAULT_ADMIN_PIN;
  } catch {
    return DEFAULT_ADMIN_PIN;
  }
}

export function saveAdminPin(pin: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ADMIN_PIN, pin);
  } catch (e) {
    console.error('Failed to save admin pin:', e);
  }
}

export function loadStudents(): Student[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.STUDENTS);
    if (saved) {
      const parsed: Student[] = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const sorted = sortStudents(parsed, [3, 2, 1], true);
        return sorted;
      }
    }
    // If no v11 saved data, load clean INITIAL_STUDENTS with empty academyDays
    const defaultSorted = sortStudents(INITIAL_STUDENTS, [3, 2, 1], true);
    saveStudents(defaultSorted);
    return defaultSorted;
  } catch (e) {
    console.error('Failed to load students:', e);
  }
  const defaultSorted = sortStudents(INITIAL_STUDENTS, [3, 2, 1], true);
  saveStudents(defaultSorted);
  return defaultSorted;
}

export function saveStudents(students: Student[]): void {
  try {
    // Automatically sort by grade, classNum, studentNum before saving
    const sorted = sortStudents(students, [3, 2, 1], true);
    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(sorted));
  } catch (e) {
    console.error('Failed to save students:', e);
  }
}

export function loadAttendanceRecords(): Record<string, { status: AttendanceStatus; reason?: string }> {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.RECORDS);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load attendance records:', e);
  }
  // Start fresh with blank attendance records
  const initial = generateEmptyRecords();
  saveAttendanceRecords(initial);
  return initial;
}

export function saveAttendanceRecords(records: Record<string, { status: AttendanceStatus; reason?: string }>): void {
  try {
    localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(records));
  } catch (e) {
    console.error('Failed to save attendance records:', e);
  }
}

export function resetToInitialData(): {
  students: Student[];
  records: Record<string, { status: AttendanceStatus; reason?: string }>;
} {
  const students = [...INITIAL_STUDENTS];
  const records = generateEmptyRecords();
  saveStudents(students);
  saveAttendanceRecords(records);
  return { students, records };
}

/**
 * 자동 및 수동 데이터 백업 스냅샷 관리
 */
export function loadSnapshots(): DataSnapshot[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.SNAPSHOTS);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load snapshots:', e);
  }
  return [];
}

export function saveSnapshot(
  reason: string,
  records: Record<string, AttendanceRecord>,
  students: Student[]
): DataSnapshot {
  const snapshots = loadSnapshots();
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const formattedTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  
  const newSnapshot: DataSnapshot = {
    id: `snap_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    timestamp: Date.now(),
    formattedTime,
    reason,
    recordsCount: Object.keys(records || {}).length,
    studentsCount: students?.length || 0,
    records: JSON.parse(JSON.stringify(records || {})),
    students: JSON.parse(JSON.stringify(students || [])),
  };

  // 최대 15개 스냅샷 유지 (최신순)
  const updatedSnapshots = [newSnapshot, ...snapshots].slice(0, 15);
  try {
    localStorage.setItem(STORAGE_KEYS.SNAPSHOTS, JSON.stringify(updatedSnapshots));
  } catch (e) {
    console.error('Failed to save snapshot:', e);
  }

  return newSnapshot;
}

export function deleteSnapshot(id: string): void {
  const snapshots = loadSnapshots().filter(s => s.id !== id);
  try {
    localStorage.setItem(STORAGE_KEYS.SNAPSHOTS, JSON.stringify(snapshots));
  } catch (e) {
    console.error('Failed to delete snapshot:', e);
  }
}

export function clearAllSnapshots(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.SNAPSHOTS);
  } catch (e) {
    console.error('Failed to clear snapshots:', e);
  }
}

/**
 * JSON 백업 파일 생성 및 파싱
 */
export function exportBackupJSON(
  students: Student[],
  records: Record<string, AttendanceRecord>,
  customDays?: any,
  schoolEvents?: any
): string {
  const now = new Date();
  const data = {
    app: '숭신고등학교 미래인재반 출석부',
    version: '1.05',
    exportDate: now.toISOString(),
    formattedDate: `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 ${now.getHours()}시 ${now.getMinutes()}분`,
    studentsCount: students.length,
    recordsCount: Object.keys(records).length,
    students,
    records,
    customDays: customDays || {},
    schoolEvents: schoolEvents || loadSchoolEvents(),
  };
  return JSON.stringify(data, null, 2);
}

export function parseBackupJSON(jsonStr: string): {
  success: boolean;
  students?: Student[];
  records?: Record<string, AttendanceRecord>;
  schoolEvents?: SchoolEvent[];
  error?: string;
} {
  try {
    const data = JSON.parse(jsonStr);
    if (!data || typeof data !== 'object') {
      return { success: false, error: '유효한 JSON 형식이 아닙니다.' };
    }

    // 출결 기록 혹은 학생 명단이 존재하는지 확인
    const students = Array.isArray(data.students) ? data.students : undefined;
    const records = (data.records && typeof data.records === 'object') ? data.records : undefined;
    const schoolEvents = Array.isArray(data.schoolEvents) ? data.schoolEvents : undefined;

    if (!students && !records) {
      return { success: false, error: '백업 파일 안에 학생 명단이나 출결 기록이 포함되어 있지 않습니다.' };
    }

    return {
      success: true,
      students,
      records,
      schoolEvents,
    };
  } catch (e: any) {
    return { success: false, error: e?.message || 'JSON 파싱 실패' };
  }
}

/**
 * Generate TSV (Tab Separated Values) format for Google Sheets copy-pasting.
 * Exactly matches 숭신고등학교 미래인재반 출석부 layout.
 */
export function generateGoogleSheetsTSV(
  title: string,
  session: SessionType,
  year: number,
  month: number,
  activeDays: DayConfig[],
  students: Student[],
  records: Record<string, { status: AttendanceStatus; reason?: string }>
): string {
  const sessionName = session === 'morning' ? '아침' : '야간';
  const rows: string[][] = [];

  // Title Row
  rows.push([`${title || '숭신고등학교 미래인재반'} ${month}월 ${sessionName} 자율학습 출석부`]);
  rows.push([]); // Empty spacing row

  // Header Row 1: Columns
  // 연번, 학년, 반, 번호, 이름, [Day 1, Day 2, ...], 출석, 결석, 지각/인정, 출석률, 비고 (또는 야자 요일)
  const lastColHeader = session === 'night' ? '야자 요일' : '비고';
  const header1 = ['연번', '학년', '반', '번호', '이름', ...activeDays.map(d => String(d.dayNum)), '출석', '결석', '지각/인정', '출석률', lastColHeader];
  const header2 = ['', '', '', '', '', ...activeDays.map(d => d.dayOfWeek), '', '', '', '', ''];
  rows.push(header1);
  rows.push(header2);

  // Group students by grade based on month (Nov/Dec: 2->1->3, otherwise 3->2->1)
  const grades = getGradeOrder(month);

  grades.forEach(grade => {
    const rawGradeStudents = students.filter(s => s.grade === grade && s.active);
    const gradeStudents = sortStudents(rawGradeStudents, [grade], true);
    
    gradeStudents.forEach((st, idx) => {
      const stats = calculateStudentMonthStats(st, session, activeDays, records);
      const academyDays = getStudentAcademyDays(st, month);

      const dayCells = activeDays.map(d => {
        const isExcluded = isStudentExcluded(st, session, d.dateStr, d.dayOfWeek);
        if (isExcluded) {
          return '/';
        }

        const key = getRecordKey(st.id, session, d.dateStr);
        const rec = records[key];
        const status = rec?.status || 'NONE';
        return STATUS_META[status].symbol;
      });

      const lastColValue = session === 'night'
        ? (academyDays.length > 0 ? `학원:${academyDays.join(',')}` : '매일참여')
        : (st.notes || '');

      rows.push([
        String(st.seq || idx + 1),
        String(st.grade),
        String(st.classNum),
        String(st.studentNum),
        st.name,
        ...dayCells,
        String(stats.presentCount),
        String(stats.absentCount),
        String(stats.lateCount + stats.earlyLeaveCount + stats.excusedCount),
        stats.rate,
        lastColValue,
      ]);
    });

    // 3학년 / 2학년 / 1학년 재적 및 현원 행
    const gradePresentRow = [
      `${grade}학년 재적 (${gradeStudents.length}명)`,
      '',
      '',
      '',
      `${grade}학년 현원`,
      ...activeDays.map(d => {
        const eligibleStudents = gradeStudents.filter(st => !isStudentExcluded(st, session, d.dateStr, d.dayOfWeek));
        if (eligibleStudents.length === 0) {
          return '-';
        }
        let pres = 0;
        eligibleStudents.forEach(st => {
          const key = getRecordKey(st.id, session, d.dateStr);
          const stt = records[key]?.status;
          if (stt === 'PRESENT' || stt === 'LATE' || stt === 'EARLY_LEAVE') pres++;
        });
        return String(pres);
      }),
      '',
      '',
      '',
      '',
      '',
    ];
    rows.push(gradePresentRow);

    // 2,3학년 누적 재적 행 (If 2학년)
    if (grade === 2) {
      const g23Students = students.filter(s => (s.grade === 3 || s.grade === 2) && s.active);
      rows.push([
        `2,3학년 재적 (${g23Students.length}명)`,
        '',
        '',
        '',
        '2,3학년 출석 현황',
        ...activeDays.map(d => {
          const eligibleStudents = g23Students.filter(st => !isStudentExcluded(st, session, d.dateStr, d.dayOfWeek));
          if (eligibleStudents.length === 0) return '-';
          let pres = 0;
          eligibleStudents.forEach(st => {
            const key = getRecordKey(st.id, session, d.dateStr);
            const stt = records[key]?.status;
            if (stt === 'PRESENT' || stt === 'LATE' || stt === 'EARLY_LEAVE') pres++;
          });
          return String(pres);
        }),
        '',
        '',
        '',
        '',
        '',
      ]);
    }
  });

  // 1~3학년 총 재적 요약 행
  const allActive = students.filter(s => s.active);
  const totalSummaryRow = [
    `1~3학년 총 재적 (${allActive.length}명)`,
    '',
    '',
    '',
    '총 출석 인원',
    ...activeDays.map(d => {
      const eligibleStudents = allActive.filter(st => !isStudentExcluded(st, session, d.dateStr, d.dayOfWeek));
      if (eligibleStudents.length === 0) return '-';
      let pres = 0;
      eligibleStudents.forEach(st => {
        const key = getRecordKey(st.id, session, d.dateStr);
        const stt = records[key]?.status;
        if (stt === 'PRESENT' || stt === 'LATE' || stt === 'EARLY_LEAVE') pres++;
      });
      return String(pres);
    }),
    '',
    '',
    '',
    '',
    '',
  ];
  rows.push(totalSummaryRow);

  return rows.map(r => r.join('\t')).join('\n');
}

/**
 * Generate CSV file download with UTF-8 BOM
 */
export function downloadCSV(
  filename: string,
  session: SessionType,
  year: number,
  month: number,
  activeDays: DayConfig[],
  students: Student[],
  records: Record<string, { status: AttendanceStatus; reason?: string }>
): void {
  const tsv = generateGoogleSheetsTSV('숭신고등학교 미래인재반', session, year, month, activeDays, students, records);
  const csvContent = tsv
    .split('\n')
    .map(line =>
      line
        .split('\t')
        .map(cell => `"${(cell || '').replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\r\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Generate TSV for Analytics (통계 분석 구글 스프레드시트/엑셀 연동용)
 */
export function generateAnalyticsTSV(
  title: string,
  session: SessionType,
  year: number,
  month: number,
  activeDays: DayConfig[],
  students: Student[],
  records: Record<string, { status: AttendanceStatus; reason?: string }>
): string {
  const sessionName = session === 'morning' ? '아침' : '야간';
  const rows: string[][] = [];

  // Title & Meta
  rows.push([`${title || '숭신고등학교 미래인재반'} ${month}월 ${sessionName} 자율학습 출결 통계 분석표`]);
  rows.push([`기준년월\t${year}년 ${month}월`, `총 운영일수\t${activeDays.length}일`, `총 재적학생\t${students.filter(s => s.active).length}명`]);
  rows.push([]);

  // Section 1: Grade Summary
  rows.push(['[ 1. 학년별 출결 집계 요약 ]']);
  rows.push(['학년', '재적인원', '총 출석대상(연인원)', '총 출석(합산)', '출석(○)', '지각(△)', '조퇴(Ø)', '인정(인)', '총 결석(X+미체크)', '평균 출석률']);

  const gradeOrder = getGradeOrder(month);

  gradeOrder.forEach(grade => {
    const gStudents = students.filter(s => s.grade === grade && s.active);
    let totalTarget = 0;
    let totalP = 0;
    let totalL = 0;
    let totalE = 0;
    let totalExc = 0;
    let totalA = 0;

    gStudents.forEach(st => {
      const stats = calculateStudentMonthStats(st, session, activeDays, records);
      totalTarget += stats.totalDays;
      totalP += stats.rawPresentCount;
      totalL += stats.lateCount;
      totalE += stats.earlyLeaveCount;
      totalExc += stats.excusedCount;
      totalA += stats.absentCount;
    });

    const attended = totalP + totalL + totalE + totalExc;
    const rate = totalTarget > 0 ? `${Math.round((attended / totalTarget) * 100)}%` : '-';
    rows.push([
      `${grade}학년`,
      `${gStudents.length}명`,
      String(totalTarget),
      String(attended),
      String(totalP),
      String(totalL),
      String(totalE),
      String(totalExc),
      String(totalA),
      rate,
    ]);
  });

  rows.push([]);

  // Section 2: Student Detail Table
  rows.push(['[ 2. 학생별 상세 출결 통계 및 관리 분석 ]']);
  rows.push(['연번', '학년', '반', '번호', '이름', '출석예정(일)', '총 출석(합산)', '출석(○)', '지각(△)', '총 결석(X+미체크)', '조퇴(Ø)', '인정(인)', '출석률', '출결상태', '비고']);

  let globalIdx = 1;
  gradeOrder.forEach(grade => {
    const rawGStudents = students.filter(s => s.grade === grade && s.active);
    const gStudents = sortStudents(rawGStudents, [grade], true);
    gStudents.forEach(st => {
      const stats = calculateStudentMonthStats(st, session, activeDays, records);

      let statusLabel = '정상';
      if (stats.isFullyExcluded) statusLabel = '수능후제외';
      else if (stats.rateNum >= 95) statusLabel = '성실우수';
      else if (stats.absentCount >= 2 || stats.rateNum < 80) statusLabel = '관심/상담권장';

      rows.push([
        String(st.seq || globalIdx++),
        String(st.grade),
        String(st.classNum),
        String(st.studentNum),
        st.name,
        String(stats.totalDays),
        String(stats.presentCount),
        String(stats.rawPresentCount),
        String(stats.lateCount),
        String(stats.absentCount),
        String(stats.earlyLeaveCount),
        String(stats.excusedCount),
        stats.rate,
        statusLabel,
        st.notes || '',
      ]);
    });
  });

  return rows.map(r => r.join('\t')).join('\n');
}

/**
 * Download Analytics CSV file
 */
export function downloadAnalyticsCSV(
  filename: string,
  session: SessionType,
  year: number,
  month: number,
  activeDays: DayConfig[],
  students: Student[],
  records: Record<string, { status: AttendanceStatus; reason?: string }>
): void {
  const tsv = generateAnalyticsTSV('숭신고등학교 미래인재반', session, year, month, activeDays, students, records);
  const csvContent = tsv
    .split('\n')
    .map(line =>
      line
        .split('\t')
        .map(cell => `"${(cell || '').replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\r\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

