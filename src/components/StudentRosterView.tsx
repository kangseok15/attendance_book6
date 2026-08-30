import React, { useState, useMemo, useEffect } from 'react';
import { Student } from '../types/attendance';
import { WEEKDAYS, getStudentAcademyDays, updateStudentAcademyDaysForMonth, sortStudents } from '../utils/attendanceHelpers';
import { 
  Users, 
  UserPlus, 
  Edit3, 
  Trash2, 
  Search, 
  Upload, 
  Download, 
  Check, 
  X,
  Phone,
  Armchair,
  FileSpreadsheet,
  ShieldAlert,
  Calendar
} from 'lucide-react';
import { UserRole } from '../types/attendance';

interface StudentRosterViewProps {
  students: Student[];
  onUpdateStudents: (students: Student[]) => void;
  userRole?: UserRole;
  currentMonth?: number;
}

export const StudentRosterView: React.FC<StudentRosterViewProps> = ({
  students,
  onUpdateStudents,
  userRole = 'admin',
  currentMonth = 8,
}) => {
  if (userRole !== 'admin') {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 border border-slate-200 dark:border-slate-800 text-center max-w-lg mx-auto my-12 shadow-xs">
        <div className="w-16 h-16 bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
          관리자 전용 메뉴입니다
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          학생 명단 관리 및 개인정보(연락처/비고) 수정은 관리자 권한으로만 접근 가능합니다. 상단 우측의 역할 버튼을 눌러 관리자로 전환해 주세요.
        </p>
      </div>
    );
  }
  const [selectedGrade, setSelectedGrade] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [addErrorMessage, setAddErrorMessage] = useState('');
  const [bulkImportText, setBulkImportText] = useState('');
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [bulkImportError, setBulkImportError] = useState('');

  useEffect(() => {
    if (currentMonth) {
      setSelectedMonth(currentMonth);
    }
  }, [currentMonth]);

  // New Student Form State
  const [newStudent, setNewStudent] = useState<Partial<Student>>({
    grade: 3,
    classNum: 1,
    studentNum: 1,
    name: '',
    seatNum: '',
    phone: '',
    parentPhone: '',
    notes: '',
    academyDays: [], // 학원 가는 요일 (기본: 학원 없음, 매일 정상 참여)
    nightDays: ['월', '화', '수', '목', '금'],
    active: true,
  });

  const filteredStudents = useMemo(() => {
    const list = students.filter(st => {
      if (selectedGrade !== 'all' && st.grade !== selectedGrade) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return st.name.toLowerCase().includes(q) || `${st.grade}${st.classNum}${st.studentNum}`.includes(q);
      }
      return true;
    });
    return sortStudents(list, [3, 2, 1], true);
  }, [students, selectedGrade, searchQuery]);

  const handleSaveEdit = () => {
    if (!editingStudent) return;
    const updated = students.map(s => (s.id === editingStudent.id ? editingStudent : s));
    onUpdateStudents(sortStudents(updated, [3, 2, 1], true));
    setEditingStudent(null);
  };

  const handleConfirmDelete = () => {
    if (!studentToDelete) return;
    const updated = students.filter(s => s.id !== studentToDelete.id);
    onUpdateStudents(sortStudents(updated, [3, 2, 1], true));
    setStudentToDelete(null);
  };

  const handleAddNewStudent = () => {
    if (!newStudent.name?.trim()) {
      setAddErrorMessage('학생 이름을 입력해주세요.');
      return;
    }
    const created: Student = {
      id: `s-${Date.now()}`,
      seq: students.filter(s => s.grade === newStudent.grade).length + 1,
      grade: (newStudent.grade || 1) as 1 | 2 | 3,
      classNum: Number(newStudent.classNum) || 1,
      studentNum: Number(newStudent.studentNum) || 1,
      name: newStudent.name.trim(),
      seatNum: newStudent.seatNum || '',
      phone: newStudent.phone || '',
      parentPhone: newStudent.parentPhone || '',
      notes: newStudent.notes || '',
      academyDays: newStudent.academyDays || [],
      academyDaysByMonth: {
        [selectedMonth]: newStudent.academyDays || [],
      },
      nightDays: newStudent.nightDays && newStudent.nightDays.length > 0 ? newStudent.nightDays : ['월', '화', '수', '목', '금'],
      active: true,
    };

    onUpdateStudents(sortStudents([...students, created], [3, 2, 1], true));
    setIsAddingStudent(false);
    setAddErrorMessage('');
    setNewStudent({
      grade: 3,
      classNum: 1,
      studentNum: 1,
      name: '',
      seatNum: '',
      phone: '',
      parentPhone: '',
      notes: '',
      nightDays: ['월', '화', '수', '목', '금'],
      active: true,
    });
  };

  // Bulk import TSV/CSV format: supports "학년 반 번호 이름 [학생연락처] [학부모연락처]" or "학년 반 번호 이름 [좌석] [비고]"
  const handleBulkImport = () => {
    try {
      setBulkImportError('');
      const lines = bulkImportText.trim().split('\n');
      const imported: Student[] = [];

      lines.forEach((line, idx) => {
        const parts = line.split(/[\t,]/).map(p => p.trim());
        if (parts.length >= 4) {
          const g = parseInt(parts[0], 10);
          const c = parseInt(parts[1], 10);
          const num = parseInt(parts[2], 10);
          const name = parts[3];

          let phone = '';
          let parentPhone = '';
          let seat = '';
          let note = '';

          // Check parts[4] and parts[5] for phone patterns (e.g., starts with 010 or contains '-')
          const isPhonePattern = (s?: string) => !!s && (s.startsWith('010') || /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/.test(s.replace(/\s/g, '')));

          if (parts.length >= 6 && isPhonePattern(parts[4]) && isPhonePattern(parts[5])) {
            phone = parts[4];
            parentPhone = parts[5];
          } else if (parts.length >= 5 && isPhonePattern(parts[4])) {
            phone = parts[4];
            if (parts.length >= 6 && isPhonePattern(parts[5])) {
              parentPhone = parts[5];
            } else if (parts.length >= 6) {
              note = parts[5];
            }
          } else {
            seat = parts[4] || '';
            if (parts.length >= 6 && isPhonePattern(parts[5])) {
              parentPhone = parts[5];
            } else {
              note = parts[5] || '';
            }
            if (parts.length >= 7 && isPhonePattern(parts[6])) {
              parentPhone = parts[6];
            }
          }

          if (!isNaN(g) && !isNaN(c) && !isNaN(num) && name) {
            imported.push({
              id: `s-imp-${Date.now()}-${idx}`,
              seq: idx + 1,
              grade: (g >= 1 && g <= 3 ? g : 1) as 1 | 2 | 3,
              classNum: c,
              studentNum: num,
              name,
              seatNum: seat,
              phone,
              parentPhone,
              notes: note,
              active: true,
            });
          }
        }
      });

      if (imported.length > 0) {
        onUpdateStudents(sortStudents([...students, ...imported], [3, 2, 1], true));
        setShowBulkImportModal(false);
        setBulkImportText('');
      } else {
        setBulkImportError('입력된 데이터 형식을 확인해주세요. (형식: 학년 [탭/쉼표] 반 [탭/쉼표] 번호 [탭/쉼표] 이름 [탭/쉼표] 학생연락처 [탭/쉼표] 학부모연락처)');
      }
    } catch (e) {
      setBulkImportError('일괄 등록 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Action Controls */}
      <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>숭신고등학교 미래인재반 학생 명단 관리</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              총 {students.length}명 등록됨
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            학년별 학생 정보(학년, 반, 번호, 이름, 좌석번호, 학부모 연락처)를 개별 또는 엑셀 복사/붙여넣기로 관리할 수 있습니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowBulkImportModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 transition-colors shadow-2xs"
          >
            <Upload className="w-3.5 h-3.5" />
            엑셀 일괄 등록
          </button>

          <button
            onClick={() => setIsAddingStudent(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-all"
          >
            <UserPlus className="w-4 h-4" />
            학생 직접 추가
          </button>
        </div>
      </div>

      {/* Filter, Month and Search Bar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Grade filter */}
          <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-700/60 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setSelectedGrade('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                selectedGrade === 'all'
                  ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              전체 ({students.length}명)
            </button>
            {[3, 2, 1].map(g => (
              <button
                key={g}
                onClick={() => setSelectedGrade(g)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  selectedGrade === g
                    ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {g}학년 ({students.filter(s => s.grade === g).length}명)
              </button>
            ))}
          </div>

          {/* Month selector for academy days */}
          <div className="inline-flex items-center gap-1.5 p-1 bg-amber-50/80 dark:bg-amber-950/40 rounded-xl text-xs font-medium border border-amber-200 dark:border-amber-800/80">
            <span className="text-2xs font-bold text-amber-900 dark:text-amber-200 px-2 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-amber-600" />
              <span>학원 요일 기준:</span>
            </span>
            {[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setSelectedMonth(m)}
                className={`px-2 py-1 rounded-lg transition-all text-xs font-bold cursor-pointer ${
                  selectedMonth === m
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50'
                }`}
                title={`${m}월 학원 요일 설정 및 조회`}
              >
                {m}월
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="학생 이름 / 번호 검색..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 w-52"
          />
        </div>
      </div>

      {/* Student Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-xs">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300">
              <th className="py-3 px-3 text-center w-12">연번</th>
              <th className="py-3 px-3 text-center w-20 min-w-20 whitespace-nowrap">학년</th>
              <th className="py-3 px-3 text-center w-14 whitespace-nowrap">반</th>
              <th className="py-3 px-3 text-center w-14 whitespace-nowrap">번호</th>
              <th className="py-3 px-3 text-center w-28 whitespace-nowrap">이름</th>
              <th className="py-3 px-3 text-center w-32 whitespace-nowrap">학생 연락처</th>
              <th className="py-3 px-3 w-32 whitespace-nowrap">학부모 연락처</th>
              <th className="py-3 px-3 text-center min-w-44 whitespace-nowrap">
                <span className="inline-flex items-center gap-1">
                  <span>학원 요일 ({selectedMonth}월 기준)</span>
                </span>
              </th>
              <th className="py-3 px-3 text-center w-24 whitespace-nowrap">상태</th>
              <th className="py-3 px-3 text-center w-20 whitespace-nowrap">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700/60">
            {filteredStudents.map((st, idx) => {
              const isEditing = editingStudent?.id === st.id;

              if (isEditing) {
                const editAcademyDays = getStudentAcademyDays(editingStudent, selectedMonth);

                return (
                  <tr key={st.id} className="bg-indigo-50/50 dark:bg-indigo-950/30">
                    <td className="py-2.5 px-3 text-center font-mono">{idx + 1}</td>
                    <td className="py-2.5 px-1 text-center">
                      <select
                        value={editingStudent.grade}
                        onChange={e => setEditingStudent({ ...editingStudent, grade: Number(e.target.value) as 1 | 2 | 3 })}
                        className="border border-slate-300 rounded-lg px-1.5 py-1 text-xs bg-white dark:bg-slate-800"
                      >
                        <option value={3}>3학년</option>
                        <option value={2}>2학년</option>
                        <option value={1}>1학년</option>
                      </select>
                    </td>
                    <td className="py-2.5 px-1 text-center">
                      <input
                        type="number"
                        value={editingStudent.classNum}
                        onChange={e => setEditingStudent({ ...editingStudent, classNum: Number(e.target.value) })}
                        className="w-12 border border-slate-300 rounded-lg px-1.5 py-1 text-xs text-center bg-white dark:bg-slate-800"
                      />
                    </td>
                    <td className="py-2.5 px-1 text-center">
                      <input
                        type="number"
                        value={editingStudent.studentNum}
                        onChange={e => setEditingStudent({ ...editingStudent, studentNum: Number(e.target.value) })}
                        className="w-12 border border-slate-300 rounded-lg px-1.5 py-1 text-xs text-center bg-white dark:bg-slate-800"
                      />
                    </td>
                    <td className="py-2.5 px-2">
                      <input
                        type="text"
                        value={editingStudent.name}
                        onChange={e => setEditingStudent({ ...editingStudent, name: e.target.value })}
                        className="w-24 border border-slate-300 rounded-lg px-1.5 py-1 text-xs bg-white dark:bg-slate-800 font-bold text-center"
                      />
                    </td>
                    <td className="py-2.5 px-2">
                      <input
                        type="text"
                        value={editingStudent.phone || ''}
                        onChange={e => setEditingStudent({ ...editingStudent, phone: e.target.value })}
                        placeholder="010-0000-0000"
                        className="w-full border border-slate-300 rounded-lg px-1.5 py-1 text-xs bg-white dark:bg-slate-800"
                      />
                    </td>
                    <td className="py-2.5 px-2">
                      <input
                        type="text"
                        value={editingStudent.parentPhone || ''}
                        onChange={e => setEditingStudent({ ...editingStudent, parentPhone: e.target.value })}
                        placeholder="010-0000-0000"
                        className="w-full border border-slate-300 rounded-lg px-1.5 py-1 text-xs bg-white dark:bg-slate-800"
                      />
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {WEEKDAYS.map(dayName => {
                          const isAcademy = editAcademyDays.includes(dayName);
                          return (
                            <button
                              key={dayName}
                              type="button"
                              onClick={() => {
                                const nextAcademyDays = isAcademy
                                  ? editAcademyDays.filter(d => d !== dayName)
                                  : [...editAcademyDays, dayName];
                                setEditingStudent(updateStudentAcademyDaysForMonth(editingStudent, selectedMonth, nextAcademyDays));
                              }}
                              className={`w-6 h-6 rounded-md text-2xs font-bold transition-all flex items-center justify-center border cursor-pointer ${
                                isAcademy
                                  ? 'bg-rose-600 border-rose-700 text-white shadow-2xs'
                                  : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400'
                              }`}
                              title={`${dayName}요일: ${isAcademy ? `${selectedMonth}월 학원 (야자 미참여 음영)` : `${selectedMonth}월 학원 없음 (야자 참여 빈칸)`}`}
                            >
                              {dayName}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <button
                        onClick={() => setEditingStudent({ ...editingStudent, active: !editingStudent.active })}
                        className={`text-2xs px-2.5 py-1 rounded-md font-bold ${
                          editingStudent.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {editingStudent.active ? '참여중' : '중단'}
                      </button>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={handleSaveEdit}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded-lg"
                          title="저장"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingStudent(null)}
                          className="p-1.5 text-slate-400 hover:bg-slate-200 rounded-lg"
                          title="취소"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }

              const gradeColor =
                st.grade === 3
                  ? 'text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800'
                  : st.grade === 2
                  ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800'
                  : 'text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800';

              const stAcademyDays = getStudentAcademyDays(st, selectedMonth);

              return (
                <tr key={st.id} className="hover:bg-slate-50 dark:hover:bg-slate-750/50 transition-colors">
                  <td className="py-3 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                  <td className="py-3 px-3 text-center whitespace-nowrap">
                    <span className={`inline-block px-2.5 py-1 rounded-lg font-bold text-xs whitespace-nowrap shadow-2xs ${gradeColor}`}>
                      {st.grade}학년
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center font-medium whitespace-nowrap">{st.classNum}반</td>
                  <td className="py-3 px-3 text-center font-mono font-medium whitespace-nowrap">{st.studentNum}번</td>
                  <td className="py-3 px-3 font-extrabold text-slate-900 dark:text-slate-100 whitespace-nowrap text-center">{st.name}</td>
                  <td className="py-3 px-3 text-center text-slate-600 dark:text-slate-400 font-mono text-2xs whitespace-nowrap">
                    {st.phone ? (
                      <a href={`tel:${st.phone}`} className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline">
                        {st.phone}
                      </a>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">-</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center text-slate-600 dark:text-slate-400 font-mono text-2xs whitespace-nowrap">
                    {st.parentPhone ? (
                      <a href={`tel:${st.parentPhone}`} className="hover:text-indigo-600 dark:hover:text-indigo-400 font-medium text-slate-800 dark:text-slate-200 hover:underline">
                        {st.parentPhone}
                      </a>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">-</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">
                      {WEEKDAYS.map(dayName => {
                        const isAcademy = stAcademyDays.includes(dayName);
                        return (
                          <button
                            key={dayName}
                            type="button"
                            onClick={() => {
                              const nextAcademyDays = isAcademy
                                ? stAcademyDays.filter(d => d !== dayName)
                                : [...stAcademyDays, dayName];
                              const updated = students.map(s => (s.id === st.id ? updateStudentAcademyDaysForMonth(s, selectedMonth, nextAcademyDays) : s));
                              onUpdateStudents(updated);
                            }}
                            className={`w-6 h-6 rounded-md text-2xs font-bold transition-all flex items-center justify-center border cursor-pointer ${
                              isAcademy
                                ? 'bg-rose-600 border-rose-700 text-white shadow-2xs hover:bg-rose-700'
                                : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-200'
                            }`}
                            title={`${st.name}: ${selectedMonth}월 ${dayName}요일 ${isAcademy ? '학원 (야자 미참여, 출석부에 음영 처리)' : '학원 없음 (정상 야자 참여, 출석부에 빈칸)'}`}
                          >
                            {dayName}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-2xs font-bold ${
                        st.active
                          ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400 border border-slate-200'
                      }`}
                    >
                      {st.active ? '참여중' : '비활성'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => setEditingStudent({ ...st })}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        title="수정"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setStudentToDelete(st)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                        title="삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Modal (In-App) */}
      {studentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60">
                <Trash2 className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100">학생 명단 삭제</h3>
                <p className="text-2xs text-slate-500">명단 및 출결 기록에서 완전히 제거됩니다.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-750 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>대상 학생:</span>
                <span className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">
                  {studentToDelete.grade}학년 {studentToDelete.classNum}반 {studentToDelete.studentNum}번 {studentToDelete.name}
                </span>
              </div>
              {studentToDelete.parentPhone && (
                <div className="flex items-center justify-between text-2xs text-slate-500">
                  <span>학부모 연락처:</span>
                  <span className="font-mono">{studentToDelete.parentPhone}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              정말로 <strong className="text-rose-600 font-bold">{studentToDelete.name}</strong> 학생을 미래인재반 명단에서 삭제하시겠습니까?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setStudentToDelete(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-xs transition-all flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Single Student Modal */}
      {isAddingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <h3 className="font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2 text-base">
                <UserPlus className="w-4 h-4 text-indigo-600" />
                새 학생 등록
              </h3>
              <button onClick={() => { setIsAddingStudent(false); setAddErrorMessage(''); }} className="p-1 rounded-lg text-slate-400 hover:text-slate-700">
                ✕
              </button>
            </div>

            {addErrorMessage && (
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                {addErrorMessage}
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-2xs font-bold text-slate-700 dark:text-slate-300 mb-1">학년</label>
                <select
                  value={newStudent.grade}
                  onChange={e => setNewStudent({ ...newStudent, grade: Number(e.target.value) as 1 | 2 | 3 })}
                  className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 font-medium"
                >
                  <option value={3}>3학년</option>
                  <option value={2}>2학년</option>
                  <option value={1}>1학년</option>
                </select>
              </div>

              <div>
                <label className="block text-2xs font-bold text-slate-700 dark:text-slate-300 mb-1">반</label>
                <input
                  type="number"
                  min={1}
                  value={newStudent.classNum}
                  onChange={e => setNewStudent({ ...newStudent, classNum: Number(e.target.value) })}
                  className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 font-medium"
                />
              </div>

              <div>
                <label className="block text-2xs font-bold text-slate-700 dark:text-slate-300 mb-1">번호</label>
                <input
                  type="number"
                  min={1}
                  value={newStudent.studentNum}
                  onChange={e => setNewStudent({ ...newStudent, studentNum: Number(e.target.value) })}
                  className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-2xs font-bold text-slate-700 dark:text-slate-300 mb-1">이름 *</label>
                <input
                  type="text"
                  placeholder="예: 홍길동"
                  value={newStudent.name}
                  onChange={e => {
                    setNewStudent({ ...newStudent, name: e.target.value });
                    if (addErrorMessage) setAddErrorMessage('');
                  }}
                  className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 font-bold"
                />
              </div>

              <div>
                <label className="block text-2xs font-bold text-slate-700 dark:text-slate-300 mb-1">학생 연락처</label>
                <input
                  type="text"
                  placeholder="예: 010-1111-2222"
                  value={newStudent.phone}
                  onChange={e => setNewStudent({ ...newStudent, phone: e.target.value })}
                  className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-2xs font-bold text-slate-700 dark:text-slate-300 mb-1">학부모 연락처 (문자 발송용)</label>
              <input
                type="text"
                placeholder="예: 010-1234-5678"
                value={newStudent.parentPhone}
                onChange={e => setNewStudent({ ...newStudent, parentPhone: e.target.value })}
                className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700"
              />
            </div>

            <div>
              <label className="block text-2xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">학원 가는 요일 (체크 시 야자 미참여 / 출석부에 진회색 음영 처리)</label>
              <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-700/50 p-2.5 rounded-xl border border-slate-300 dark:border-slate-600">
                {WEEKDAYS.map(dayName => {
                  const currentAcademyDays = newStudent.academyDays || [];
                  const isChecked = currentAcademyDays.includes(dayName);

                  return (
                    <label key={dayName} className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-200 select-none">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          const nextAcademyDays = isChecked
                            ? currentAcademyDays.filter(d => d !== dayName)
                            : [...currentAcademyDays, dayName];
                          const allWeekdays = ['월', '화', '수', '목', '금'];
                          const nextNightDays = allWeekdays.filter(d => !nextAcademyDays.includes(d));
                          setNewStudent({ 
                            ...newStudent, 
                            academyDays: nextAcademyDays,
                            nightDays: nextNightDays 
                          });
                        }}
                        className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                      />
                      <span>{dayName}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
              <button
                onClick={() => { setIsAddingStudent(false); setAddErrorMessage(''); }}
                className="px-3.5 py-2 text-xs rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium"
              >
                취소
              </button>
              <button
                onClick={handleAddNewStudent}
                className="px-4 py-2 text-xs rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all shadow-xs"
              >
                추가하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <h3 className="font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2 text-base">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                스프레드시트 학생 명단 일괄 붙여넣기
              </h3>
              <button onClick={() => { setShowBulkImportModal(false); setBulkImportError(''); }} className="p-1 rounded-lg text-slate-400 hover:text-slate-700">
                ✕
              </button>
            </div>

            {bulkImportError && (
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                {bulkImportError}
              </div>
            )}

            <p className="text-xs text-slate-500">
              엑셀이나 구글 스프레드시트에서 <span className="font-bold text-indigo-600">학년, 반, 번호, 이름, [학생연락처], [학부모연락처]</span> 열을 복사한 후 아래에 붙여넣으세요.
            </p>

            <textarea
              rows={8}
              value={bulkImportText}
              onChange={e => {
                setBulkImportText(e.target.value);
                if (bulkImportError) setBulkImportError('');
              }}
              placeholder={`예시:\n3\t1\t19\t김도훈\t010-1234-5678\t010-9876-5432\n2\t1\t6\t김도은\t010-3184-7833\t010-9146-1126`}
              className="w-full p-3 font-mono text-xs rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
              <button
                onClick={() => { setShowBulkImportModal(false); setBulkImportError(''); }}
                className="px-3.5 py-2 text-xs rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium"
              >
                취소
              </button>
              <button
                onClick={handleBulkImport}
                className="px-4 py-2 text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all shadow-xs"
              >
                일괄 등록 실행
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
