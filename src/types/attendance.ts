export type SessionType = 'morning' | 'night';

export type UserRole = 'admin' | 'teacher' | 'teacher_mobile' | 'student';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | 'EARLY_LEAVE' | 'NONE';

export interface AttendanceRecord {
  status: AttendanceStatus;
  reason?: string; // e.g. "병결", "학원", "가족행사", "수행평가"
  checkInTime?: string; // e.g. "07:42"
}

export interface Student {
  id: string;
  seq: number;       // 연번 (1~15 per grade or overall)
  grade: 1 | 2 | 3;  // 학년
  classNum: number;  // 반
  studentNum: number;// 번호
  name: string;      // 이름
  seatNum?: string;  // 좌석번호 (e.g. "A-01", "12")
  phone?: string;    // 학생 연락처
  parentPhone?: string; // 학부모 연락처
  notes?: string;    // 비고 (e.g. "화목 학원", "학원 조퇴")
  academyDays?: string[]; // 학원 가는 요일 (체크 시 야자 미참여 음영 처리, e.g. ['화', '목'])
  academyDaysByMonth?: Record<number | string, string[]>; // 월별 독립 학원 요일 (e.g. { 8: ['목'], 9: ['금'] })
  nightDays?: string[]; // 하위 호환용 (참여 요일)
  active: boolean;   // 참여 여부
}

export interface SchoolEvent {
  id: string;
  dateStr: string; // YYYY-MM-DD
  title: string;   // 행사명 e.g. "개교기념일", "중간고사", "수능", "재량휴업일"
  excludeMorning: boolean; // 아침 자율학습 미실시 (출석부에서 삭제)
  excludeNight: boolean;   // 야간 자율학습(야자) 미실시 (출석부에서 삭제)
  isCsat?: boolean;        // 수능일 (이 날짜 이후 고3 출석부 자동 음영 처리)
  isHoliday?: boolean;     // 공휴일 여부
}

export interface Grade3ExclusionConfig {
  enabled: boolean;
  startDate: string; // YYYY-MM-DD (e.g. '2026-11-18')
  reason?: string;   // e.g. "수능 예비소집일 이후 자율학습 제외"
}

export interface DayConfig {
  dateStr: string; // YYYY-MM-DD
  dayNum: number;  // 1~31
  dayOfWeek: string; // "월", "화", "수", "목", "금", "토", "일"
  isHoliday?: boolean;
  label?: string;
  enabled: boolean; // Is self-study active on this day?
}

export interface MonthAttendanceState {
  year: number;
  month: number;
  // key format: `${studentId}_${session}_${dateStr}`
  records: Record<string, AttendanceRecord>;
}

export interface AppSettings {
  defaultSession: SessionType;
  morningTimeRange: string; // "07:30 ~ 08:20"
  nightTimeRange: string;   // "19:00 ~ 21:30"
  schoolName: string;       // "미래인재반"
  autoFillPresent: boolean;
}

export interface DataSnapshot {
  id: string;
  timestamp: number;
  formattedTime: string;
  reason: string;
  recordsCount: number;
  studentsCount: number;
  records: Record<string, AttendanceRecord>;
  students: Student[];
}
