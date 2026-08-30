import React, { useRef, useState } from 'react';
import { 
  Printer, 
  X, 
  Copy, 
  Check, 
  ExternalLink,
  Download,
  Loader2,
  Calendar,
  Sun,
  Moon,
  FileSpreadsheet
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { 
  Student, 
  SessionType, 
  DayConfig, 
  AttendanceRecord 
} from '../types/attendance';
import { 
  calculateStudentMonthStats, 
  STATUS_META, 
  getRecordKey, 
  isStudentExcluded,
  isStudentExcludedOnDate,
  getStudentAcademyDays,
  sortStudents 
} from '../utils/attendanceHelpers';

interface PrintAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  year: number;
  month: number;
  session: SessionType;
  students: Student[];
  activeDays: DayConfig[];
  records: Record<string, AttendanceRecord>;
  onSelectMonth?: (month: number) => void;
  onSelectSession?: (session: SessionType) => void;
}

export const PrintAttendanceModal: React.FC<PrintAttendanceModalProps> = ({
  isOpen,
  onClose,
  year,
  month,
  session,
  students,
  activeDays,
  records,
  onSelectMonth,
  onSelectSession,
}) => {
  const [selectedGrade, setSelectedGrade] = useState<number | 'all'>('all');
  const [copied, setCopied] = useState(false);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const sessionWord = session === 'morning' ? '아침' : '야간';
  const plainTitle = `미래인재반 ${month}월 ${sessionWord} 자율학습 출석부`;
  const availableMonths = [8, 9, 10, 11, 12];

  const filteredStudents = sortStudents(
    students.filter(s => selectedGrade === 'all' || s.grade === selectedGrade),
    [3, 2, 1],
    true
  );

  // Calculate Grade-level and Total Stats for Summary Rows
  const getGradeSummary = (gradeNum: number) => {
    const gradeStudents = students.filter(s => s.grade === gradeNum);
    const dayStats = activeDays.map(day => {
      let presentCount = 0;
      let activeCount = 0;

      gradeStudents.forEach(st => {
        const isExcluded = isStudentExcluded(st, session, day.dateStr, day.dayOfWeek);
        if (!isExcluded) {
          activeCount++;
          const rec = records[getRecordKey(st.id, session, day.dateStr)];
          if (rec?.status === 'PRESENT' || rec?.status === 'LATE' || rec?.status === 'EARLY_LEAVE') {
            presentCount++;
          }
        }
      });

      return { presentCount, activeCount };
    });

    // Total month stats for this grade
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalPossible = 0;

    gradeStudents.forEach(st => {
      const stStats = calculateStudentMonthStats(st, session, activeDays, records);
      totalPresent += stStats.presentCount;
      totalAbsent += stStats.absentCount;
      totalPossible += stStats.totalDays;
    });

    const rate = totalPossible > 0 ? Math.round((totalPresent / totalPossible) * 100) : 0;

    return {
      grade: gradeNum,
      studentCount: gradeStudents.length,
      dayStats,
      totalPresent,
      totalAbsent,
      rate,
    };
  };

  const grade3Summary = getGradeSummary(3);
  const grade2Summary = getGradeSummary(2);
  const grade1Summary = getGradeSummary(1);

  // Overall Total Summary
  const overallDayStats = activeDays.map((day, idx) => {
    const present = grade3Summary.dayStats[idx].presentCount + grade2Summary.dayStats[idx].presentCount + grade1Summary.dayStats[idx].presentCount;
    const active = grade3Summary.dayStats[idx].activeCount + grade2Summary.dayStats[idx].activeCount + grade1Summary.dayStats[idx].activeCount;
    return { present, active };
  });

  const totalPresentAll = grade3Summary.totalPresent + grade2Summary.totalPresent + grade1Summary.totalPresent;
  const totalAbsentAll = grade3Summary.totalAbsent + grade2Summary.totalAbsent + grade1Summary.totalAbsent;
  const totalPossibleAll = (grade3Summary.totalPresent + grade3Summary.totalAbsent) + (grade2Summary.totalPresent + grade2Summary.totalAbsent) + (grade1Summary.totalPresent + grade1Summary.totalAbsent);
  const overallRate = totalPossibleAll > 0 ? Math.round((totalPresentAll / totalPossibleAll) * 100) : 0;

  // Generate pure self-contained HTML for printing in hidden iframe or popup
  const generatePrintableHTML = () => {
    let tableHeaderCells = `
      <th style="width: 24px; font-size: 8.5pt; font-weight: bold; background-color: #f1f5f9;">연번</th>
      <th style="width: 22px; font-size: 8.5pt; font-weight: bold; background-color: #f1f5f9;">학년</th>
      <th style="width: 20px; font-size: 8.5pt; font-weight: bold; background-color: #f1f5f9;">반</th>
      <th style="width: 20px; font-size: 8.5pt; font-weight: bold; background-color: #f1f5f9;">번호</th>
      <th style="width: 58px; font-size: 9.5pt; font-weight: 900; background-color: #f1f5f9;">이름</th>
    `;

    activeDays.forEach(d => {
      const isSun = d.dayOfWeek === '일';
      const isSat = d.dayOfWeek === '토';
      const dayColor = isSun ? 'color: #dc2626;' : isSat ? 'color: #2563eb;' : '';
      tableHeaderCells += `<th style="font-size: 8.5pt; font-weight: bold; ${dayColor}">${d.dayNum}<br/><span style="font-size: 7.5pt; font-weight: normal;">${d.dayOfWeek}</span></th>`;
    });

    tableHeaderCells += `
      <th style="width: 68px; font-size: 8.5pt; font-weight: bold; background-color: #f8fafc;">학원/미참여</th>
    `;

    // Helper for generating grade summary rows in HTML
    const makeSummaryRowHTML = (title: string, summary: typeof grade3Summary, bgClass: string, isTotal = false) => {
      let cells = `<td colspan="5" style="text-align: center; font-weight: 900; font-size: 8.5pt; background-color: ${bgClass}; padding: 2px 0; color: #0f172a; border-right: 2px solid #0f172a;">${title}</td>`;
      
      summary.dayStats.forEach(ds => {
        cells += `<td style="text-align: center; font-weight: 800; font-size: 8.5pt; background-color: ${bgClass}; color: ${isTotal ? '#1e1b4b' : '#0369a1'}; padding: 2px 0;">${ds.presentCount}</td>`;
      });

      cells += `
        <td style="text-align: center; font-size: 7.5pt; font-weight: 800; color: #475569; background-color: ${bgClass}; padding: 2px 0;">${isTotal ? '총 출석' : `${summary.grade}학년 합계`}</td>
      `;

      const borderTop = isTotal ? 'border-top: 2.5px solid #0f172a;' : 'border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a;';
      return `<tr style="${borderTop} height: 20px; background-color: ${bgClass};">${cells}</tr>`;
    };

    // Helper for overall total row
    const makeOverallRowHTML = () => {
      let cells = `<td colspan="5" style="text-align: center; font-weight: 900; font-size: 9pt; background-color: #e0e7ff; padding: 2.5px 0; color: #1e1b4b; border-right: 2px solid #0f172a;">총 합계 (${filteredStudents.length}명)</td>`;
      
      overallDayStats.forEach(ods => {
        cells += `<td style="text-align: center; font-weight: 900; font-size: 9pt; background-color: #e0e7ff; color: #1e1b4b; padding: 2.5px 0;">${ods.present}</td>`;
      });

      cells += `
        <td style="text-align: center; font-weight: 900; font-size: 8pt; color: #3730a3; background-color: #e0e7ff; padding: 2.5px 0;">전체 출석</td>
      `;

      return `<tr style="border-top: 2.5px solid #0f172a; height: 22px; background-color: #e0e7ff;">${cells}</tr>`;
    };

    let rowsHTML = '';
    filteredStudents.forEach((student, idx) => {
      const academyDaysStr = (student.academyDays && student.academyDays.length > 0)
        ? student.academyDays.join(',')
        : '-';

      const nextStudent = filteredStudents[idx + 1];
      const isGradeEnd = nextStudent && nextStudent.grade !== student.grade;
      const isLastStudent = idx === filteredStudents.length - 1;
      const borderBottomStyle = (isGradeEnd || isLastStudent) ? 'border-bottom: 1.5px solid #64748b;' : 'border-bottom: 1px solid #cbd5e1;';

      let cellsHTML = `
        <td style="text-align: center; font-size: 8pt; color: #475569; padding: 2px 0;">${student.seq || idx + 1}</td>
        <td style="text-align: center; font-weight: bold; font-size: 8.5pt; padding: 2px 0;">${student.grade}</td>
        <td style="text-align: center; font-size: 8.5pt; padding: 2px 0;">${student.classNum}</td>
        <td style="text-align: center; font-size: 8.5pt; padding: 2px 0;">${student.studentNum}</td>
        <td style="text-align: center; font-weight: 900; font-size: 9.5pt; white-space: nowrap; padding: 2px 1px; color: #0f172a;">${student.name}</td>
      `;

      activeDays.forEach(day => {
        const isPostNov17 = isStudentExcludedOnDate(student.grade, day.dateStr);
        if (isPostNov17) {
          cellsHTML += `<td style="background-color: #f1f5f9; color: #94a3b8; text-align: center; font-size: 8pt; padding: 2px 0;">/</td>`;
          return;
        }

        const academyDays = getStudentAcademyDays(student, day.dateStr);
        const isAcademyDay = session === 'night' && academyDays.includes(day.dayOfWeek);
        const isWedNight = session === 'night' && day.dayOfWeek === '수';

        if (isWedNight) {
          cellsHTML += `<td style="background-color: #f1f5f9; color: #94a3b8; text-align: center; font-size: 8pt; padding: 2px 0;">/</td>`;
          return;
        }

        const key = getRecordKey(student.id, session, day.dateStr);
        const rec = records[key];
        const status = rec?.status || 'NONE';
        const meta = STATUS_META[status];

        // 학원일인데 출결 입력이 없는 경우 빈 슬래시/기본 처리
        if (isAcademyDay && status === 'NONE') {
          cellsHTML += `<td style="background-color: #e2e8f0; color: #64748b; text-align: center; font-size: 7pt; font-weight: bold; padding: 2px 0;">학원</td>`;
          return;
        }

        let sym = meta.symbol || '';
        let color = '#1e293b';
        if (status === 'PRESENT') color = '#059669';
        else if (status === 'LATE') color = '#d97706';
        else if (status === 'EARLY_LEAVE') color = '#9333ea';
        else if (status === 'OFFICIAL_ABSENT') color = '#2563eb';
        else if (status === 'ABSENT') color = '#dc2626';

        // 학원 가는 날인데 야자를 참여하여 출결 표시가 된 경우 회색 바탕(#e2e8f0)으로 변별력 부여
        const bgStyle = isAcademyDay ? 'background-color: #e2e8f0;' : '';

        cellsHTML += `<td style="text-align: center; font-weight: 900; font-size: 9.5pt; color: ${color}; ${bgStyle} padding: 2px 0;">${sym}</td>`;
      });

      cellsHTML += `
        <td style="text-align: center; font-size: 7.5pt; color: #475569; padding: 2px 1px; white-space: nowrap;">${academyDaysStr}</td>
      `;

      rowsHTML += `<tr style="${borderBottomStyle} height: 19.5px;">${cellsHTML}</tr>`;

      // Insert Grade Summary directly below each grade's last student!
      if (isGradeEnd || isLastStudent) {
        if (student.grade === 3 && (selectedGrade === 'all' || selectedGrade === 3)) {
          rowsHTML += makeSummaryRowHTML(`3학년 합계 (${grade3Summary.studentCount}명)`, grade3Summary, '#f8fafc');
        } else if (student.grade === 2 && (selectedGrade === 'all' || selectedGrade === 2)) {
          rowsHTML += makeSummaryRowHTML(`2학년 합계 (${grade2Summary.studentCount}명)`, grade2Summary, '#f8fafc');
        } else if (student.grade === 1 && (selectedGrade === 'all' || selectedGrade === 1)) {
          rowsHTML += makeSummaryRowHTML(`1학년 합계 (${grade1Summary.studentCount}명)`, grade1Summary, '#f8fafc');
        }
      }
    });

    // Overall total summary row at the very bottom
    if (selectedGrade === 'all') {
      rowsHTML += makeOverallRowHTML();
    }

    const pageSizeCSS = orientation === 'portrait' ? 'A4 portrait' : 'A4 landscape';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${plainTitle}</title>
  <style>
    @page {
      size: ${pageSizeCSS};
      margin: 4.5mm 5mm 3.5mm 5mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Malgun Gothic', '맑은 고딕', sans-serif;
      color: #0f172a;
      background: #ffffff;
      -webkit-font-smoothing: antialiased;
    }
    .print-container {
      width: 100%;
      height: 100%;
      min-height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .print-header {
      margin-bottom: 3px;
      border-bottom: 2.5px solid #0f172a;
      padding-bottom: 3px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .print-title {
      font-size: 15pt;
      margin: 0;
      font-weight: 900;
      letter-spacing: -0.3px;
      line-height: 1.1;
    }
    .highlight-red {
      color: #dc2626 !important;
      font-weight: 900;
    }
    .print-subinfo {
      font-size: 8pt;
      margin: 0;
      color: #475569;
      font-weight: 700;
    }
    table.attendance-table {
      width: 100%;
      border-collapse: collapse;
      border: 2px solid #0f172a;
      font-size: 8pt;
      line-height: 1;
      table-layout: fixed;
    }
    table.attendance-table th, 
    table.attendance-table td {
      border: 1px solid #94a3b8;
      padding: 1px 0.5px;
      text-align: center;
      vertical-align: middle;
    }
    table.attendance-table th {
      background-color: #f8fafc;
      font-weight: 800;
      border-bottom: 2px solid #0f172a;
      height: 20px;
      padding: 1.5px 0.5px;
    }
    .legend-box {
      margin-top: 3px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 7pt;
      color: #475569;
      border-top: 1.5px solid #cbd5e1;
      padding-top: 2px;
    }
  </style>
</head>
<body>
  <div class="print-container">
    <div>
      <div class="print-header">
        <div>
          <h1 class="print-title">
            미래인재반 ${month}월 <span class="highlight-red">${sessionWord}</span> 자율학습 출석부
          </h1>
        </div>
        <div class="print-subinfo">
          <span>운영: ${activeDays.length}일 | 대상 학생: ${filteredStudents.length}명</span>
        </div>
      </div>

      <table class="attendance-table">
        <thead>
          <tr>${tableHeaderCells}</tr>
        </thead>
        <tbody>
          ${rowsHTML}
        </tbody>
      </table>
    </div>

    <div class="legend-box">
      <div><strong>출결 기호:</strong> ○ 출석 | △ 지각 | Ø 조퇴 | 인 인정 | X 결석 | / 학원·학사일정 미참여 요일</div>
      <div style="font-weight: bold; color: #1e293b;">숭신고 미래인재반</div>
    </div>
  </div>
</body>
</html>`;
  };

  // 1. 1-Click High-Quality PDF Download (PDF 저장)
  const handleDownloadPDF = async () => {
    if (!printAreaRef.current) return;
    setIsGeneratingPdf(true);
    try {
      const element = printAreaRef.current;
      
      // High-res canvas capture (scale 3 for ultra crisp text)
      const canvas = await html2canvas(element, {
        scale: 3,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');
      
      // A4 dimensions: 210 x 297 mm
      const pdf = new jsPDF({
        orientation: orientation,
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = orientation === 'portrait' ? 210 : 297;
      const pdfHeight = orientation === 'portrait' ? 297 : 210;

      // 5mm margin
      const margin = 5;
      const availableWidth = pdfWidth - (margin * 2);
      const availableHeight = pdfHeight - (margin * 2);

      let finalWidth = availableWidth;
      let finalHeight = (canvas.height * finalWidth) / canvas.width;

      if (finalHeight > availableHeight) {
        finalHeight = availableHeight;
        finalWidth = (canvas.width * finalHeight) / canvas.height;
      }

      const posX = margin + (availableWidth - finalWidth) / 2;
      const posY = margin + (availableHeight - finalHeight) / 2;

      pdf.addImage(imgData, 'PNG', posX, posY, finalWidth, finalHeight, undefined, 'FAST');
      
      const fileName = `숭신고_미래인재반_${year}년_${month}월_${sessionWord}_자율학습_출석부.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('PDF generation failed:', error);
      handleDirectPrint();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // 2. Direct Print using hidden iframe
  const handleDirectPrint = () => {
    try {
      const printHTML = generatePrintableHTML();
      let iframe = document.getElementById('attendance-print-iframe') as HTMLIFrameElement | null;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'attendance-print-iframe';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);
      }

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(printHTML);
        doc.close();

        setTimeout(() => {
          try {
            iframe?.contentWindow?.focus();
            iframe?.contentWindow?.print();
          } catch (e) {
            console.warn('Iframe print focus failed, falling back to window.print', e);
            window.print();
          }
        }, 300);
      } else {
        window.print();
      }
    } catch (err) {
      console.error('Print execution failed:', err);
      window.print();
    }
  };

  // 3. Open printable page in standalone window
  const handleOpenPrintWindow = () => {
    const printHTML = generatePrintableHTML();
    const blob = new Blob([printHTML], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) {
      win.focus();
    } else {
      handleDirectPrint();
    }
  };

  // 4. Copy formatted table HTML to clipboard
  const handleCopyTable = async () => {
    try {
      const printHTML = generatePrintableHTML();
      await navigator.clipboard.writeText(printHTML);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Clipboard copy failed:', e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-5xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[94vh] overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/80 dark:bg-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-600 flex items-center justify-center text-white shadow-xs">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2 flex-wrap">
                <span>출석부 출력 & PDF 저장</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300">
                  A4 1장 꽉 채움 (학년별 합계 & 총합계 포함)
                </span>
              </h2>
              <p className="text-2xs sm:text-xs text-slate-500">
                미래인재반 {month}월 <strong className="text-rose-600 dark:text-rose-400 font-bold">{sessionWord}</strong> 자율학습 (총 {filteredStudents.length}명)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar & Selectors */}
        <div className="p-3 sm:px-5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-2.5 text-xs">
          
          {/* Top Row: Month & Session Selectors */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
            {/* Month Switcher */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-slate-700 dark:text-slate-300 text-xs flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                월 선택:
              </span>
              <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                {availableMonths.map(m => (
                  <button
                    key={`print-m-${m}`}
                    type="button"
                    onClick={() => onSelectMonth && onSelectMonth(m)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                      month === m
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {m}월
                  </button>
                ))}
              </div>
            </div>

            {/* Session Switcher */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-slate-700 dark:text-slate-300 text-xs">
                구분:
              </span>
              <div className="inline-flex p-0.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => onSelectSession && onSelectSession('morning')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1 cursor-pointer ${
                    session === 'morning'
                      ? 'bg-amber-500 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  <Sun className="w-3 h-3" />
                  <span>아침</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectSession && onSelectSession('night')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1 cursor-pointer ${
                    session === 'night'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  <Moon className="w-3 h-3" />
                  <span>야간(야자)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Row: Orientation, Grade Filter and Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Orientation Selection */}
              <div className="inline-flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold">
                <button
                  onClick={() => setOrientation('portrait')}
                  className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    orientation === 'portrait'
                      ? 'bg-white dark:bg-slate-700 text-rose-700 dark:text-rose-300 shadow-2xs font-extrabold'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <span>A4 세로 (1장 완성)</span>
                </button>
                <button
                  onClick={() => setOrientation('landscape')}
                  className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    orientation === 'landscape'
                      ? 'bg-white dark:bg-slate-700 text-rose-700 dark:text-rose-300 shadow-2xs font-extrabold'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <span>A4 가로</span>
                </button>
              </div>

              {/* Grade Filter */}
              <div className="inline-flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold">
                <button
                  onClick={() => setSelectedGrade('all')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    selectedGrade === 'all'
                      ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  전체 ({students.length}명)
                </button>
                {[3, 2, 1].map(g => (
                  <button
                    key={g}
                    onClick={() => setSelectedGrade(g)}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      selectedGrade === g
                        ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {g}학년
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons: PDF 저장 (Primary) + Print */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                onClick={handleCopyTable}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-slate-700 dark:text-slate-300 transition-colors shadow-2xs cursor-pointer"
                title="한글(HWP) 또는 엑셀에 붙여넣을 수 있는 서식 복사"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? '복사 완료!' : '양식 복사'}</span>
              </button>

              <button
                onClick={handleOpenPrintWindow}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-slate-700 dark:text-slate-300 transition-colors shadow-2xs cursor-pointer"
                title="새 창에서 깨끗하게 인쇄창 열기"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>새 창 인쇄</span>
              </button>

              <button
                onClick={handleDirectPrint}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-slate-700 dark:text-slate-300 transition-colors shadow-2xs cursor-pointer"
                title="브라우저 기본 인쇄창 열기"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>인쇄</span>
              </button>

              {/* Primary PDF Download Action */}
              <button
                onClick={handleDownloadPDF}
                disabled={isGeneratingPdf}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:bg-rose-400 text-white font-extrabold shadow-sm transition-all cursor-pointer"
                title="출석부를 고화질 A4 PDF 파일로 즉시 저장 및 다운로드"
              >
                {isGeneratingPdf ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>PDF 생성 중...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>PDF로 저장</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Print Preview Canvas (Live Preview) */}
        <div className="flex-1 overflow-auto p-3 sm:p-5 bg-slate-200/80 dark:bg-slate-950 flex justify-center">
          <div 
            ref={printAreaRef}
            className={`bg-white text-slate-900 shadow-xl border border-slate-300 p-4 sm:p-5 rounded-lg text-xs select-none transition-all flex flex-col justify-between ${
              orientation === 'portrait' ? 'w-full max-w-[700px] min-h-[960px]' : 'w-full max-w-4xl min-h-[640px]'
            }`}
          >
            <div>
              {/* Sheet Header */}
              <div className="flex justify-between items-end border-b-2 border-slate-900 pb-1.5 mb-2">
                <div>
                  <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                    미래인재반 {month}월 <span className="text-rose-600 font-black">{sessionWord}</span> 자율학습 출석부
                  </h1>
                </div>
                <div className="text-3xs text-slate-500 font-bold text-right">
                  총 운영일수: {activeDays.length}일 | 대상 학생: {filteredStudents.length}명
                </div>
              </div>

              {/* Table Preview */}
              <div className="overflow-x-auto border-2 border-slate-900">
                <table className="w-full border-collapse text-3xs text-center">
                  <thead>
                    <tr className="bg-slate-100 border-b-2 border-slate-800 font-bold text-slate-900">
                      <th className="border border-slate-400 py-1 px-0.5 w-6">연번</th>
                      <th className="border border-slate-400 py-1 px-0.5 w-6">학년</th>
                      <th className="border border-slate-400 py-1 px-0.5 w-5">반</th>
                      <th className="border border-slate-400 py-1 px-0.5 w-5">번호</th>
                      <th className="border border-slate-400 py-1 px-1 w-12 font-black text-slate-900">이름</th>

                      {activeDays.map(d => (
                        <th 
                          key={`prev-h-${d.dateStr}`} 
                          className={`border border-slate-400 py-1 px-0.5 min-w-5 ${
                            d.dayOfWeek === '일' ? 'text-rose-600' : d.dayOfWeek === '토' ? 'text-blue-600' : 'text-slate-800'
                          }`}
                        >
                          <div className="font-extrabold text-3xs leading-tight">{d.dayNum}</div>
                          <div className="text-4xs font-normal leading-tight">{d.dayOfWeek}</div>
                        </th>
                      ))}

                      <th className="border border-slate-400 py-1 px-1.5 min-w-[70px] font-medium text-slate-700">학원/미참여</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Student Rows with inline grade summaries */}
                    {filteredStudents.map((student, idx) => {
                      const academyDaysStr = (student.academyDays && student.academyDays.length > 0)
                        ? student.academyDays.join(',')
                        : '-';

                      const nextStudent = filteredStudents[idx + 1];
                      const isGradeEnd = nextStudent && nextStudent.grade !== student.grade;
                      const isLastStudent = idx === filteredStudents.length - 1;

                      return (
                        <React.Fragment key={`prev-frag-${student.id}`}>
                          <tr 
                            key={`prev-row-${student.id}`} 
                            className={`hover:bg-slate-50 ${(isGradeEnd || isLastStudent) ? 'border-b border-slate-400' : 'border-b border-slate-300'}`}
                            style={{ height: '19.5px' }}
                          >
                            <td className="border border-slate-300 py-0.5 px-0.5 font-mono text-slate-500 text-3xs">{student.seq || idx + 1}</td>
                            <td className="border border-slate-300 py-0.5 px-0.5 font-bold">{student.grade}</td>
                            <td className="border border-slate-300 py-0.5 px-0.5">{student.classNum}</td>
                            <td className="border border-slate-300 py-0.5 px-0.5 font-mono">{student.studentNum}</td>
                            <td className="border border-slate-300 py-0.5 px-0.5 font-extrabold whitespace-nowrap text-slate-900">{student.name}</td>

                            {activeDays.map(day => {
                              const isPostNov17 = isStudentExcludedOnDate(student.grade, day.dateStr);
                              if (isPostNov17) {
                                return (
                                  <td 
                                    key={`prev-cell-${student.id}-${day.dateStr}`} 
                                    className="border border-slate-300 bg-slate-100 text-slate-400 font-mono text-4xs py-0.5"
                                  >
                                    /
                                  </td>
                                );
                              }

                              const academyDays = getStudentAcademyDays(student, day.dateStr);
                              const isAcademyDay = session === 'night' && academyDays.includes(day.dayOfWeek);
                              const isWedNight = session === 'night' && day.dayOfWeek === '수';

                              if (isWedNight) {
                                return (
                                  <td 
                                    key={`prev-cell-${student.id}-${day.dateStr}`} 
                                    className="border border-slate-300 bg-slate-100 text-slate-400 font-mono text-4xs py-0.5"
                                  >
                                    /
                                  </td>
                                );
                              }

                              const key = getRecordKey(student.id, session, day.dateStr);
                              const rec = records[key];
                              const status = rec?.status || 'NONE';
                              const meta = STATUS_META[status];

                              // 학원일인데 출결 입력이 없는 경우
                              if (isAcademyDay && status === 'NONE') {
                                return (
                                  <td 
                                    key={`prev-cell-${student.id}-${day.dateStr}`} 
                                    className="border border-slate-300 bg-slate-200 text-slate-600 font-extrabold text-4xs py-0.5"
                                    title="학원일 (야자 미참여)"
                                  >
                                    학원
                                  </td>
                                );
                              }

                              const statusColorClass = 
                                status === 'PRESENT' ? 'text-emerald-700' :
                                status === 'LATE' ? 'text-amber-700' :
                                status === 'ABSENT' ? 'text-rose-700' :
                                status === 'EARLY_LEAVE' ? 'text-purple-700' :
                                status === 'EXCUSED' ? 'text-blue-700' : 'text-slate-400';

                              const cellBg = isAcademyDay ? `bg-slate-200 ${statusColorClass} font-black` : meta.cellClass;

                              return (
                                <td 
                                  key={`prev-cell-${student.id}-${day.dateStr}`} 
                                  className={`border border-slate-300 font-bold text-3xs py-0.5 ${cellBg}`}
                                  title={isAcademyDay ? '학원일 야간자습 참여' : undefined}
                                >
                                  {meta.symbol}
                                </td>
                              );
                            })}

                            <td className="border border-slate-300 text-slate-600 text-4xs py-0.5">{academyDaysStr}</td>
                          </tr>

                          {/* Grade Summary Row directly beneath each grade */}
                          {(isGradeEnd || isLastStudent) && student.grade === 3 && (selectedGrade === 'all' || selectedGrade === 3) && (
                            <tr className="bg-slate-50 font-bold border-t-2 border-b-2 border-slate-700" style={{ height: '20.5px' }}>
                              <td colSpan={5} className="border border-slate-300 py-0.5 px-1 font-black text-slate-800 bg-slate-100 text-center">
                                3학년 합계 ({grade3Summary.studentCount}명)
                              </td>
                              {grade3Summary.dayStats.map((ds, dIdx) => (
                                <td key={`g3-prev-ds-${dIdx}`} className="border border-slate-300 py-0.5 px-0.5 text-blue-700 font-black">
                                  {ds.presentCount}
                                </td>
                              ))}
                              <td className="border border-slate-300 py-0.5 px-0.5 text-slate-600 font-bold text-4xs bg-slate-100">3학년 합계</td>
                            </tr>
                          )}

                          {(isGradeEnd || isLastStudent) && student.grade === 2 && (selectedGrade === 'all' || selectedGrade === 2) && (
                            <tr className="bg-slate-50 font-bold border-t-2 border-b-2 border-slate-700" style={{ height: '20.5px' }}>
                              <td colSpan={5} className="border border-slate-300 py-0.5 px-1 font-black text-slate-800 bg-slate-100 text-center">
                                2학년 합계 ({grade2Summary.studentCount}명)
                              </td>
                              {grade2Summary.dayStats.map((ds, dIdx) => (
                                <td key={`g2-prev-ds-${dIdx}`} className="border border-slate-300 py-0.5 px-0.5 text-blue-700 font-black">
                                  {ds.presentCount}
                                </td>
                              ))}
                              <td className="border border-slate-300 py-0.5 px-0.5 text-slate-600 font-bold text-4xs bg-slate-100">2학년 합계</td>
                            </tr>
                          )}

                          {(isGradeEnd || isLastStudent) && student.grade === 1 && (selectedGrade === 'all' || selectedGrade === 1) && (
                            <tr className="bg-slate-50 font-bold border-t-2 border-b-2 border-slate-700" style={{ height: '20.5px' }}>
                              <td colSpan={5} className="border border-slate-300 py-0.5 px-1 font-black text-slate-800 bg-slate-100 text-center">
                                1학년 합계 ({grade1Summary.studentCount}명)
                              </td>
                              {grade1Summary.dayStats.map((ds, dIdx) => (
                                <td key={`g1-prev-ds-${dIdx}`} className="border border-slate-300 py-0.5 px-0.5 text-blue-700 font-black">
                                  {ds.presentCount}
                                </td>
                              ))}
                              <td className="border border-slate-300 py-0.5 px-0.5 text-slate-600 font-bold text-4xs bg-slate-100">1학년 합계</td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}

                    {/* Total Summary Row at the very bottom */}
                    {selectedGrade === 'all' && (
                      <tr className="bg-indigo-50 font-black border-t-2 border-slate-900" style={{ height: '22px' }}>
                        <td colSpan={5} className="border border-slate-400 py-1 px-1 font-black text-indigo-950 bg-indigo-100/70 text-center">
                          총 합계 ({filteredStudents.length}명)
                        </td>
                        {overallDayStats.map((ods, idx) => (
                          <td key={`total-prev-ods-${idx}`} className="border border-slate-400 py-1 px-0.5 text-indigo-950 font-black bg-indigo-50">
                            {ods.present}
                          </td>
                        ))}
                        <td className="border border-slate-400 py-1 px-0.5 text-indigo-900 font-extrabold text-4xs bg-indigo-100/70">전체 출석</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sheet Footer */}
            <div className="mt-2 flex justify-between items-center text-4xs text-slate-500 border-t-2 border-slate-300 pt-1.5">
              <div><strong>출결 기호:</strong> ○ 출석 | △ 지각 | Ø 조퇴 | 인 인정 | X 결석 | / 학원·학사일정 미참여 요일</div>
              <div className="font-bold text-slate-700">숭신고 미래인재반</div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 sm:px-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-600 dark:text-slate-400 text-2xs sm:text-xs">
            📄 <strong>출석부 출력 및 PDF</strong>: A4 세로 1장 꽉 참, <strong>1·2·3학년 합계 및 총합계</strong> 수록, <span className="text-rose-600 font-bold">'{sessionWord}'</span> 강조
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
          >
            닫기
          </button>
        </div>

      </div>
    </div>
  );
};
