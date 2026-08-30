import React, { useState } from 'react';
import { Student, AttendanceStatus, SessionType } from '../types/attendance';
import { Send, Copy, Check, Phone, PhoneCall } from 'lucide-react';

interface ParentNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: SessionType;
  dateStr: string;
  absentList: { student: Student; status: AttendanceStatus; reason?: string }[];
}

export const ParentNotificationModal: React.FC<ParentNotificationModalProps> = ({
  isOpen,
  onClose,
  session,
  dateStr,
  absentList,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [customSchoolName] = useState('숭신고등학교 미래인재반');

  if (!isOpen) return null;

  const sessionName = session === 'morning' ? '아침 자율학습' : '야간 자율학습';

  const generateMessage = (item: { student: Student; status: AttendanceStatus; reason?: string }) => {
    const statusText = item.status === 'LATE' ? '지각' : '미입실(결석)';
    return `[${customSchoolName} 자율학습 출결 안내]
안녕하세요, 학부모님.
${item.student.name} 학생(${item.student.grade}학년 ${item.student.classNum}반 ${item.student.studentNum}번)이 오늘(${dateStr}) ${sessionName}에 ${statusText}하여 안내드립니다.

- 일시: ${dateStr} ${sessionName}
- 상태: ${statusText}${item.reason ? ` (사유: ${item.reason})` : ''}
- 비고: 특이사항이 있으신 경우 지도교사실로 연락 바랍니다.`;
  };

  const handleCopySingle = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyAll = () => {
    const allText = absentList.map(item => generateMessage(item)).join('\n\n====================\n\n');
    navigator.clipboard.writeText(allText);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-700">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100">
                결석 / 지각 학생 학부모 알림 메시지 생성
              </h3>
              <p className="text-xs text-slate-500">
                {dateStr} {session === 'morning' ? '아침 (07:30~08:40)' : '야간 (17:30~21:30)'} 대상자 총 {absentList.length}명
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

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {absentList.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm font-medium">
              해당 일자에 결석 또는 지각 학생이 없습니다. 전원 출석 완료되었습니다! 🎉
            </div>
          ) : (
            <div className="space-y-3">
              {absentList.map(item => {
                const msg = generateMessage(item);
                const isCopied = copiedId === item.student.id;

                return (
                  <div
                    key={item.student.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-750/50 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                          {item.student.name}
                        </span>
                        <span className="text-2xs text-slate-500 font-medium">
                          ({item.student.grade}학년 {item.student.classNum}반 {item.student.studentNum}번)
                        </span>
                        <span
                          className={`text-2xs px-2 py-0.5 rounded-full font-bold ${
                            item.status === 'LATE'
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                              : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                          }`}
                        >
                          {item.status === 'LATE' ? '지각' : '결석'}
                        </span>
                      </div>

                      <button
                        onClick={() => handleCopySingle(item.student.id, msg)}
                        className={`flex items-center gap-1 px-3 py-1 text-xs rounded-lg font-bold transition-all shadow-2xs ${
                          isCopied
                            ? 'bg-emerald-600 text-white'
                            : 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 border border-slate-200 dark:border-slate-600'
                        }`}
                      >
                        {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {isCopied ? '복사 완료' : '문자 복사'}
                      </button>
                    </div>

                    {/* Contact details pill banner */}
                    {(item.student.parentPhone || item.student.phone) && (
                      <div className="flex flex-wrap items-center gap-3 px-3 py-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-2xs">
                        {item.student.parentPhone && (
                          <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 font-medium">
                            <PhoneCall className="w-3.5 h-3.5 text-indigo-500" />
                            <span className="font-bold">학부모 연락처:</span>
                            <span className="font-mono font-bold">{item.student.parentPhone}</span>
                          </div>
                        )}
                        {item.student.phone && (
                          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 font-medium">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            <span>학생 연락처:</span>
                            <span className="font-mono">{item.student.phone}</span>
                          </div>
                        )}
                      </div>
                    )}

                    <pre className="text-2xs font-mono bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700 whitespace-pre-wrap text-slate-700 dark:text-slate-300 leading-relaxed">
                      {msg}
                    </pre>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-800/80 rounded-b-2xl">
          <div className="text-2xs text-slate-500 font-medium">
            * 복사 후 나이스(NEIS) 문자 발송 또는 학부모 카카오톡으로 전송하실 수 있습니다.
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              닫기
            </button>
            {absentList.length > 0 && (
              <button
                onClick={handleCopyAll}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-all flex items-center gap-1.5"
              >
                {copiedAll ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copiedAll ? '전체 복사 완료' : '전체 학생 문자 일괄 복사'}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
