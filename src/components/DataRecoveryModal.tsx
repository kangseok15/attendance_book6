/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Student, AttendanceRecord, UserRole } from '../types/attendance';
import { initialStudents } from '../data/initialData';
import { 
  loadSnapshots, 
  deleteSnapshot, 
  clearAllSnapshots, 
  SnapshotItem, 
  saveSnapshot 
} from '../utils/storage';
import { 
  saveBackupToFirestore,
  fetchFirestoreAttendanceState, 
  saveFullRestoreToFirestore 
} from '../utils/firebase';
import { db } from '../utils/firebase';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { 
  X, 
  RotateCcw, 
  Download, 
  Upload, 
  Trash2, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  FileJson, 
  Users, 
  RefreshCw,
  CloudDownload,
  Database,
  CalendarCheck,
  Plus
} from 'lucide-react';

interface DataRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  records: Record<string, AttendanceRecord>;
  onRestoreData: (students?: Student[], records?: Record<string, AttendanceRecord>) => void;
  userRole?: UserRole;
  onSyncServer?: () => Promise<void>;
}

export const DataRecoveryModal: React.FC<DataRecoveryModalProps> = ({
  isOpen,
  onClose,
  students,
  records,
  onRestoreData,
  userRole = 'admin',
  onSyncServer,
}) => {
  const [activeTab, setActiveTab] = useState<'scheduled' | 'snapshots' | 'server' | 'json' | 'reset'>('scheduled');
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [scheduledBackups, setScheduledBackups] = useState<any[]>([]);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<SnapshotItem | null>(null);
  const [selectedScheduledBackup, setSelectedScheduledBackup] = useState<any | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [serverStatus, setServerStatus] = useState<{
    loading: boolean;
    recordsCount: number;
    studentsCount: number;
    lastUpdated?: string;
  }>({
    loading: false,
    recordsCount: Object.keys(records).length,
    studentsCount: students.length
  });

  const loadScheduledBackups = async () => {
    try {
      const q = query(
        collection(db, 'attendance_backups'), 
        orderBy('createdAt', 'desc'), 
        limit(30)
      );
      const querySnap = await getDocs(q);
      const list: any[] = [];
      querySnap.forEach((docItem) => {
        const data = docItem.data();
        list.push({
          id: docItem.id,
          name: data.name || '정기 자동 백업',
          timestamp: data.createdAt,
          createdAt: new Date(data.createdAt || Date.now()).toLocaleString('ko-KR'),
          studentsCount: data.payload?.students?.length || 0,
          recordsCount: Object.keys(data.payload?.records || {}).length,
          payload: data.payload
        });
      });
      setScheduledBackups(list);
    } catch (e) {
      console.warn('Failed to load scheduled backups from Firestore:', e);
      const local = loadSnapshots().filter(s => s.reason.includes('정기 자동') || s.reason.includes('자동 저장'));
      setScheduledBackups(local.map(l => ({
        id: l.id,
        name: l.reason,
        createdAt: new Date(l.timestamp).toLocaleString('ko-KR'),
        studentsCount: l.students.length,
        recordsCount: Object.keys(l.records).length,
        payload: { students: l.students, records: l.records }
      })));
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSnapshots(loadSnapshots());
      loadScheduledBackups();
      setFeedbackMessage(null);
      setSelectedSnapshot(null);
      setSelectedScheduledBackup(null);
      checkServerHealth();
    }
  }, [isOpen]);

  const checkServerHealth = async () => {
    setServerStatus(prev => ({ ...prev, loading: true }));
    try {
      const result = await fetchFirestoreAttendanceState();
      if (result.success && result.records) {
        setServerStatus({
          loading: false,
          recordsCount: Object.keys(result.records).length,
          studentsCount: result.students?.length || 0,
          lastUpdated: new Date().toLocaleTimeString('ko-KR')
        });
      } else {
        setServerStatus(prev => ({ ...prev, loading: false }));
      }
    } catch (e) {
      setServerStatus(prev => ({ ...prev, loading: false }));
    }
  };

  if (!isOpen) return null;

  const showFeedback = (type: 'success' | 'error' | 'info', text: string) => {
    setFeedbackMessage({ type, text });
    setTimeout(() => {
      setFeedbackMessage(null);
    }, 4000);
  };

  // Firestore 클라우드 즉시 백업 저장
  const handleTriggerScheduledBackup = async () => {
    setIsProcessing(true);
    try {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const name = `정기 자동 저장 백업 (${now.toLocaleDateString('ko-KR')} ${timeStr})`;
      
      const payload = {
        students,
        records,
        createdAt: Date.now()
      };

      await saveBackupToFirestore(name, payload);
      saveSnapshot(name, records, students);

      await loadScheduledBackups();
      setSnapshots(loadSnapshots());
      showFeedback('success', `클라우드 자동 저장 백업이 정상 생성되었습니다. (${timeStr})`);
    } catch (e: any) {
      console.error(e);
      showFeedback('error', '자동저장 백업 생성 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  // 자동저장 백업 복구 실행
  const handleRestoreScheduled = async (backupItem: any) => {
    if (!backupItem || !backupItem.payload) return;
    const confirmMsg = `[${backupItem.name || backupItem.createdAt}] 시점의 백업으로 복구하시겠습니까?\n\n- 학생 수: ${backupItem.studentsCount || 0}명\n- 출결 기록: ${backupItem.recordsCount || 0}건\n\n※ 현재 상태는 스냅샷으로 자동 안전 보관됩니다.`;
    if (!window.confirm(confirmMsg)) return;

    setIsProcessing(true);
    try {
      saveSnapshot(`정기 백업 복구 직전 백업 (${backupItem.name || '자동저장'})`, records, students);
      const bStudents = backupItem.payload.students || students;
      const bRecords = backupItem.payload.records || {};

      onRestoreData(bStudents, bRecords);
      await saveFullRestoreToFirestore(bRecords, bStudents);

      showFeedback('success', '클라우드 정기 백업 데이터로 복구가 완료되었습니다!');
      setSelectedScheduledBackup(null);
    } catch (e: any) {
      console.error(e);
      showFeedback('error', '백업 복구에 실패했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  // 스냅샷 복구
  const handleRestoreSnapshot = async (snapshot: SnapshotItem) => {
    const confirmMsg = `[${new Date(snapshot.timestamp).toLocaleString('ko-KR')}] 스냅샷으로 복구하시겠습니까?\n사유: ${snapshot.reason}\n\n※ 현재 상태는 새 스냅샷으로 자동 안전 저장됩니다.`;
    if (!window.confirm(confirmMsg)) return;

    setIsProcessing(true);
    try {
      saveSnapshot(`스냅샷 복구 전 자동 백업 (${snapshot.reason})`, records, students);
      const restoredStudents = snapshot.students || students;
      const restoredRecords = snapshot.records || {};

      onRestoreData(restoredStudents, restoredRecords);
      await saveFullRestoreToFirestore(restoredRecords, restoredStudents);
      setSnapshots(loadSnapshots());
      showFeedback('success', '선택한 스냅샷 데이터로 성공적으로 복구되었습니다.');
      setSelectedSnapshot(null);
    } catch (e: any) {
      showFeedback('error', '스냅샷 복구 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteSnapshot = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('이 스냅샷을 삭제하시겠습니까?')) return;
    deleteSnapshot(id);
    setSnapshots(loadSnapshots());
    if (selectedSnapshot?.id === id) setSelectedSnapshot(null);
    showFeedback('info', '스냅샷이 삭제되었습니다.');
  };

  const handleClearAllSnapshots = () => {
    if (!window.confirm('모든 스냅샷 기록을 완전히 삭제하시겠습니까?\n이 작업은 취소할 수 없습니다.')) return;
    clearAllSnapshots();
    setSnapshots([]);
    setSelectedSnapshot(null);
    showFeedback('info', '모든 스냅샷이 정리되었습니다.');
  };

  // 서버 최신 데이터 즉시 덮어쓰기 복구
  const handleDirectServerRestore = async () => {
    if (!window.confirm('Firestore 클라우드 및 서버 마스터 DB의 최신 데이터로 화면과 로컬 스토리지를 덮어써서 복구하시겠습니까?')) return;
    setIsProcessing(true);
    try {
      saveSnapshot('서버 원본 복구 전 자동 백업', records, students);
      const res = await fetchFirestoreAttendanceState();
      if (res.success && res.records) {
        onRestoreData(res.students, res.records);
        showFeedback('success', '클라우드 마스터 DB 데이터로 즉시 동기화 복구되었습니다.');
        checkServerHealth();
      } else {
        showFeedback('error', '서버 데이터를 가져오지 못했습니다.');
      }
    } catch (e: any) {
      showFeedback('error', '서버 데이터 복구 실패: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // JSON 파일 다운로드
  const handleExportJson = () => {
    try {
      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        exportedBy: userRole,
        students,
        records,
        snapshots: loadSnapshots(),
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
      const downloadAnchor = document.createElement('a');
      const filename = `숭신고_미래인재반_출결전체백업_${new Date().toISOString().slice(0, 10)}.json`;
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", filename);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      showFeedback('success', '출결 전체 백업 JSON 파일이 다운로드되었습니다.');
    } catch (e: any) {
      showFeedback('error', '백업 파일 생성에 실패했습니다: ' + e.message);
    }
  };

  // JSON 파일 업로드 복원
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    fileReader.readAsText(file, "UTF-8");
    fileReader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed.records || typeof parsed.records !== 'object') {
          throw new Error('유효한 출결 백업 파일 형식이 아닙니다.');
        }

        const confirmMsg = `백업 파일 정보를 확인했습니다.\n\n- 내보낸 날짜: ${parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString('ko-KR') : '알 수 없음'}\n- 학생 수: ${parsed.students ? parsed.students.length : students.length}명\n- 출결 기록 수: ${Object.keys(parsed.records).length}건\n\n이 데이터로 현재 출결을 모두 복원하시겠습니까? (현재 상태는 자동 백업됩니다)`;
        if (!window.confirm(confirmMsg)) return;

        setIsProcessing(true);
        saveSnapshot('JSON 파일 복원 전 자동 백업', records, students);

        const restoredStudents = (parsed.students && Array.isArray(parsed.students)) ? parsed.students : students;
        const restoredRecords = parsed.records;

        onRestoreData(restoredStudents, restoredRecords);
        await saveFullRestoreToFirestore(restoredRecords, restoredStudents);

        setSnapshots(loadSnapshots());
        showFeedback('success', 'JSON 백업 파일로부터 데이터가 안전하게 복원되었습니다.');
      } catch (err: any) {
        showFeedback('error', '파일 복원 실패: ' + err.message);
      } finally {
        setIsProcessing(false);
        e.target.value = '';
      }
    };
  };

  // 초기 학생 명단 리셋
  const handleResetInitialStudents = async () => {
    const confirmMsg = '학생 명단을 시스템 기본 초기 명단(45명)으로 재설정하시겠습니까?\n출결 기록은 유지되며, 학생 기본 정보(학번/이름/학원요일)만 초기화됩니다.';
    if (!window.confirm(confirmMsg)) return;

    setIsProcessing(true);
    try {
      saveSnapshot('초기 학생 명단 리셋 전 자동 백업', records, students);
      onRestoreData(initialStudents, records);
      await saveFullRestoreToFirestore(records, initialStudents);
      setSnapshots(loadSnapshots());
      showFeedback('success', '학생 명단이 초기 기본값(45명)으로 안전하게 리셋되었습니다.');
    } catch (e: any) {
      showFeedback('error', '초기화 실패: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-4xl w-full flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-xs">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                데이터 백업 및 복구 센터
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-800">
                  안전 관리
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                아침 08:20 / 오후 18:00 정기 자동 저장 백업 및 1클릭 복구 지원
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedbackMessage && (
          <div className={`px-6 py-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b animate-slideDown ${
            feedbackMessage.type === 'success' 
              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
              : feedbackMessage.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
              : 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
          }`}>
            {feedbackMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {feedbackMessage.type === 'error' && <AlertTriangle className="w-4 h-4 shrink-0" />}
            {feedbackMessage.type === 'info' && <ShieldCheck className="w-4 h-4 shrink-0" />}
            <span>{feedbackMessage.text}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/50 px-6 gap-2 overflow-x-auto text-xs sm:text-sm font-bold">
          <button
            onClick={() => setActiveTab('scheduled')}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'scheduled'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-white dark:bg-slate-800 rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <CalendarCheck className="w-4 h-4" />
            정기 자동저장 (08:20/18:00)
          </button>
          <button
            onClick={() => setActiveTab('snapshots')}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'snapshots'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-800 rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Clock className="w-4 h-4" />
            스냅샷 복구 ({snapshots.length})
          </button>
          <button
            onClick={() => setActiveTab('server')}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'server'
                ? 'border-teal-500 text-teal-600 dark:text-teal-400 bg-white dark:bg-slate-800 rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <CloudDownload className="w-4 h-4" />
            서버 데이터 복구
          </button>
          <button
            onClick={() => setActiveTab('json')}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'json'
                ? 'border-purple-500 text-purple-600 dark:text-purple-400 bg-white dark:bg-slate-800 rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <FileJson className="w-4 h-4" />
            JSON 파일 백업/복원
          </button>
          <button
            onClick={() => setActiveTab('reset')}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'reset'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400 bg-white dark:bg-slate-800 rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Users className="w-4 h-4" />
            초기 명단 복원
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* TAB 1: 정기 자동 저장 백업 */}
          {activeTab === 'scheduled' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 font-bold text-indigo-950 dark:text-indigo-200 text-xs sm:text-sm">
                    <span>서버 자동 저장 백업 스케줄러 가동 중</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                  <p className="text-xs text-indigo-800 dark:text-indigo-300 mt-1 leading-relaxed">
                    매일 <strong className="font-extrabold text-indigo-950 dark:text-white">아침 08:20</strong> (아침 자습 마감 시점)과 <strong className="font-extrabold text-indigo-950 dark:text-white">오후 18:00</strong> (야간 자습 1타임 시작 전 시점)에 서버가 전체 출결 데이터와 학생 명단을 안전한 파일로 자동 저장합니다.
                  </p>
                </div>
              </div>

              {/* 수동 즉시 자동저장 실행 버튼 */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                <div>
                  <div className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200">
                    지금 즉시 서버 자동 저장 실행
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    스케줄 시간 외에도 지금 상태를 서버 자동저장 백업 파일로 즉시 생성합니다[cite: 1].
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleTriggerScheduledBackup}
                  disabled={isProcessing}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>즉시 자동저장</span>
                </button>
              </div>

              <div className="flex items-center justify-between pt-2">
                <h3 className="text-xs sm:text-sm font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <span>서버에 보관된 자동 저장 목록</span>
                </h3>
                <span className="text-xs text-slate-400 font-bold">
                  총 {scheduledBackups.length}개
                </span>
              </div>

              {scheduledBackups.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                  <Clock className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    보관된 정기 자동저장 백업이 없습니다[cite: 1].
                  </p>
                  <p className="text-3xs text-slate-400 dark:text-slate-500 mt-1">
                    위의 '즉시 자동저장' 버튼을 누르거나 08:20 / 18:00 시점에 자동으로 기록됩니다[cite: 1].
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                  {scheduledBackups.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 hover:border-emerald-400 transition-all flex flex-col justify-between gap-3 shadow-2xs"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-2xs font-extrabold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                            정기 백업
                          </span>
                          <span className="text-3xs font-mono text-slate-400">
                            {item.createdAt}
                          </span>
                        </div>
                        <div className="text-xs font-black text-slate-800 dark:text-slate-200 mt-1.5 line-clamp-1">
                          {item.name}
                        </div>
                        <div className="flex items-center gap-3 text-3xs font-bold text-slate-500 dark:text-slate-400 mt-1">
                          <span>학생 {item.studentsCount}명</span>
                          <span>•</span>
                          <span>출결 기록 {item.recordsCount}건</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRestoreScheduled(item)}
                        disabled={isProcessing}
                        className="w-full py-1.5 px-3 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-600 dark:hover:text-white rounded-lg text-xs font-bold transition-all border border-emerald-200 dark:border-emerald-800/80 flex items-center justify-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>이 시점으로 복구</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: 스냅샷 복구 */}
          {activeTab === 'snapshots' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200">
                    작업 직전 자동 백업 스냅샷 목록
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    출결 비우기, 데이터 복구, 명단 수정 등 주요 작업 전 자동으로 저장된 최근 기록입니다[cite: 1].
                  </p>
                </div>
                {snapshots.length > 0 && (
                  <button
                    onClick={handleClearAllSnapshots}
                    className="px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>전체 삭제</span>
                  </button>
                )}
              </div>

              {snapshots.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                  <Clock className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    저장된 스냅샷이 없습니다[cite: 1].
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {snapshots.map((snap) => (
                    <div
                      key={snap.id}
                      onClick={() => setSelectedSnapshot(snap)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        selectedSnapshot?.id === snap.id
                          ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 text-xs font-bold">
                          {Object.keys(snap.records).length}건
                        </div>
                        <div>
                          <div className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                            {snap.reason}
                          </div>
                          <div className="text-3xs text-slate-400 font-mono mt-0.5">
                            {new Date(snap.timestamp).toLocaleString('ko-KR')} • 학생 {snap.students.length}명
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRestoreSnapshot(snap);
                          }}
                          disabled={isProcessing}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>복구</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteSnapshot(snap.id, e)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: 서버 데이터 복구 */}
          {activeTab === 'server' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 flex items-start gap-3">
                <Database className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs sm:text-sm font-bold text-teal-950 dark:text-teal-200">
                    Firestore 클라우드 & 서버 마스터 데이터 복구
                  </div>
                  <p className="text-xs text-teal-800 dark:text-teal-300 mt-1 leading-relaxed">
                    다중 키오스크 태블릿이나 기기 간 불일치가 발생했을 때, Firestore 클라우드 및 서버 마스터 DB의 최신 출결 데이터를 즉시 가져와 화면과 로컬 스토리지를 완벽하게 일치시킵니다[cite: 1].
                  </p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-500" />
                    <span>마스터 데이터베이스 상태</span>
                    <span className="text-2xs px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold">
                      Firestore 클라우드 연동됨
                    </span>
                  </div>
                  <button
                    onClick={checkServerHealth}
                    className="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${serverStatus.loading ? 'animate-spin' : ''}`} />
                    <span>새로고침</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="text-3xs text-slate-400">등록 학생 수</div>
                    <div className="text-base font-black text-slate-800 dark:text-slate-100">{serverStatus.studentsCount}명</div>
                  </div>
                  <div className="p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="text-3xs text-slate-400">전체 출결 기록</div>
                    <div className="text-base font-black text-slate-800 dark:text-slate-100">{serverStatus.recordsCount}건</div>
                  </div>
                  <div className="p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="text-3xs text-slate-400">최종 동기화 시각</div>
                    <div className="text-base font-black text-slate-800 dark:text-slate-100">{serverStatus.lastUpdated || '방금 전'}</div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDirectServerRestore}
                disabled={isProcessing}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md flex items-center justify-center gap-2"
              >
                <CloudDownload className="w-4 h-4" />
                <span>서버/클라우드 데이터로 지금 복구하기</span>
              </button>
            </div>
          )}

          {/* TAB 4: JSON 파일 백업/복원 */}
          {activeTab === 'json' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 flex items-start gap-3">
                <FileJson className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs sm:text-sm font-bold text-purple-950 dark:text-purple-200">
                    JSON 독립 파일 백업 및 복원
                  </div>
                  <p className="text-xs text-purple-800 dark:text-purple-300 mt-1 leading-relaxed">
                    현재 등록된 전체 학생 명단과 전체 출결 기록, 자동 스냅샷을 표준 JSON 파일로 다운로드하여 내 컴퓨터에 안전하게 보관하거나 다른 PC에 그대로 불러올 수 있습니다[cite: 1].
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 flex flex-col justify-between gap-4">
                  <div>
                    <h4 className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <Download className="w-4 h-4 text-purple-600" />
                      <span>파일로 내보내기 (백업)</span>
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      현재 상태의 학생 {students.length}명, 출결 {Object.keys(records).length}건을 JSON 파일로 저장합니다[cite: 1].
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportJson}
                    className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    <span>JSON 백업 파일 다운로드</span>
                  </button>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 flex flex-col justify-between gap-4">
                  <div>
                    <h4 className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <Upload className="w-4 h-4 text-indigo-600" />
                      <span>파일에서 불러오기 (복원)</span>
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      이전에 저장한 JSON 백업 파일을 선택하여 데이터를 완전히 복구합니다[cite: 1].
                    </p>
                  </div>
                  <label className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer text-center">
                    <Upload className="w-4 h-4" />
                    <span>JSON 파일 선택 및 복원</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportJson}
                      className="hidden"
                      disabled={isProcessing}
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: 초기 명단 리셋 */}
          {activeTab === 'reset' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs sm:text-sm font-bold text-amber-950 dark:text-amber-200">
                    초기 기본 명단 복원 (45명)
                  </div>
                  <p className="text-xs text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
                    학생 명단 데이터가 꼬이거나 손상되었을 때, 숭신고 미래인재반 기본 45명 명단으로 안전하게 되돌립니다. 기존 출결 기록은 보존됩니다[cite: 1].
                  </p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <div className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200">
                    기본 학생 45명 명단으로 재설정
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    현재 등록 학생: {students.length}명 ➔ 기본 45명[cite: 1]
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetInitialStudents}
                  disabled={isProcessing}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 shrink-0"
                >
                  <Users className="w-4 h-4" />
                  <span>초기 명단 복원 실행</span>
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1 font-bold text-slate-400">
            <span>※ 모든 복구 실행 시, 현재 상태는 자동 스냅샷으로 안전하게 사전 백업됩니다[cite: 1].</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold transition-colors"
          >
            닫기
          </button>
        </div>

      </div>
    </div>
  );
};
