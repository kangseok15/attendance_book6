import React, { useState } from 'react';
import { Student, SessionType, DayConfig, AttendanceStatus } from '../types/attendance';
import { generateGoogleSheetsTSV, downloadCSV } from '../utils/storage';
import { 
  FileSpreadsheet, 
  Copy, 
  Check, 
  Download, 
  Sparkles 
} from 'lucide-react';

interface GoogleSheetsExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: SessionType;
  year: number;
  month: number;
  activeDays: DayConfig[];
  students: Student[];
  records: Record<string, { status: AttendanceStatus; reason?: string }>;
}

export const GoogleSheetsExportModal: React.FC<GoogleSheetsExportModalProps> = ({
  isOpen,
  onClose,
  session,
  year,
  month,
  activeDays,
  students,
  records,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const sessionLabel = session === 'morning' ? '아침' : '야간';
  const tsvData = generateGoogleSheetsTSV('숭신고등학교 미래인재반', session, year, month, activeDays, students, records);

  const handleCopyClipboard = () => {
    navigator.clipboard.writeText(tsvData);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadCSV = () => {
    downloadCSV(`숭신고등학교_미래인재반_${year}년_${month}월_${sessionLabel}자율학습출석부`, session, year, month, activeDays, students, records);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-700">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100">
                구글 스프레드시트 및 엑셀 내보내기
              </h3>
              <p className="text-xs text-slate-500">
                숭신고등학교 미래인재반 {month}월 {sessionLabel} 자율학습 출석부 서식 그대로 즉시 복사 및 다운로드
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          
          {/* Quick Guide Card */}
          <div className="bg-emerald-50/70 dark:bg-emerald-950/30 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/60 space-y-2">
            <div className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              구글 스프레드시트에 1초 만에 붙여넣는 방법
            </div>
            <ol className="list-decimal list-inside space-y-1 text-emerald-800 dark:text-emerald-300">
              <li>아래 <span className="font-bold bg-emerald-100 dark:bg-emerald-900 px-1 py-0.5 rounded">클립보드에 복사</span> 버튼을 누릅니다.</li>
              <li>사용 중인 구글 스프레드시트의 새 시트(A1 셀)를 클릭합니다.</li>
              <li>단축키 <span className="font-bold font-mono">Ctrl + V</span> (Mac: Cmd + V) 를 누르면 표와 서식이 그대로 깔끔하게 채워집니다.</li>
            </ol>
          </div>

          {/* Action Row */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleCopyClipboard}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm shadow-xs transition-all ${
                copied
                  ? 'bg-emerald-700 text-white scale-[0.99]'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              {copied ? '스프레드시트 형식으로 복사 완료!' : '스프레드시트용 전체 표 복사하기'}
            </button>

            <button
              onClick={handleDownloadCSV}
              className="flex items-center justify-center gap-1.5 py-3 px-4 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-bold transition-colors shadow-2xs"
            >
              <Download className="w-4 h-4" />
              Excel (.CSV) 파일 다운로드
            </button>
          </div>

          {/* Preview Box */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              내보내기 데이터 미리보기 (TSV / Tab-Separated)
            </label>
            <textarea
              readOnly
              rows={9}
              value={tsvData}
              className="w-full p-3 font-mono text-3xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 select-all focus:outline-hidden"
            />
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-800/80 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            닫기
          </button>
        </div>

      </div>
    </div>
  );
};
