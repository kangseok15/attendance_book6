import React, { useState, useEffect, useRef } from 'react';
import {
  RotateCcw,
  X,
  History,
  CloudDownload,
  FileJson,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Plus,
  RefreshCw,
  Database,
  Calendar,
  Users,
  HardDrive,
  Clock,
  ShieldCheck
} from 'lucide-react';
import { Student, AttendanceRecord, DataSnapshot, SessionType, UserRole } from '../types/attendance';
import { 
  loadSnapshots, 
  saveSnapshot, 
  deleteSnapshot, 
  clearAllSnapshots, 
  exportBackupJSON, 
  parseBackupJSON, 
  resetToInitialData 
} from '../utils/storage';
import { 
  fetchServerAttendanceState, 
  fetchServerBackups,
  triggerServerBackup,
  restoreServerBackupFile
} from '../utils/apiSync';

interface DataRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  records: Record<string, AttendanceRecord>;
  onRestoreData: (restoredStudents?: Student[], restoredRecords?: Record<string, AttendanceRecord>) => void;
  userRole?: UserRole;
  onSyncServer?: () => void;
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
  const [activeTab, setActiveTab] = useState<'scheduled' | 'snapshots' | 'server' | 'file' | 'reset'>('scheduled');
  const [snapshots, setSnapshots] = useState<DataSnapshot[]>([]);
  const [serverBackups, setServerBackups] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [successToast, setSuccessToast] = useState('');
  const [errorToast, setErrorToast] = useState('');

  // Server state inspection
  const [serverInfo, setServerInfo] = useState<{
    recordsCount: number;
    studentsCount: number;
    lastModified: string;
    loading: boolean;
  }>({
    recordsCount: 0,
    studentsCount: 0,
    lastModified: '',
    loading: false,
  });

  // File import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedFileBackup, setParsedFileBackup] = useState<{
    students?: Student[];
    records?: Record<string, AttendanceRecord>;
    summaryText: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSnapshots(loadSnapshots());
      setErrorToast('');
      setSuccessToast('');
      setParsedFileBackup(null);
      loadServerPreview();
      loadServerBackupList();
    }
  }, [isOpen]);

  const loadServerBackupList = async () => {
    try {
      const res = await fetchServerBackups();
      if (res && res.success && res.backups) {
        setServerBackups(res.backups);
      }
    } catch (e) {
      console.warn('Failed to load server backup list:', e);
    }
  };

  const loadServerPreview = async () => {
    setServerInfo(prev => ({ ...prev, loading: true }));
    try {
      const res = await fetchServerAttendanceState();
      if (res && res.success) {
        const lastMod = res.lastModified ? new Date(res.lastModified).toLocaleString('ko-KR') : '알 수 없음';
        setServerInfo({
          recordsCount: res.records ? Object.keys(res.records).length : 0,
          studentsCount: res.students ? res.students.length : 0,
          lastModified: lastMod,
          loading: false,
        });
      } else {
        setServerInfo(prev => ({ ...prev, loading: false }));
      }
    } catch {
      setServerInfo(prev => ({ ...prev, loading: false }));
    }
  };

  if (!isOpen) return null;

  const showSuccess = (msg: string) => {
    setSuccessToast(msg);
    setErrorToast('');
    setTimeout(() => {
      setSuccessToast('');
    }, 3500);
  };

  const showError = (msg: string) => {
    setErrorToast(msg);
    setSuccessToast('');
    setTimeout(() => {
      setErrorToast('');
    }, 4000);
  };

  // 1. Scheduled Server Auto-Backup Handlers (08:20, 16:00)
  const handleTriggerServerAutoSave = async () => {
    setIsProcessing(true);
    try {
      const ok = await triggerServerBackup('관리자 수동 자동저장 백업', (userRole as UserRole) || 'admin');
      if (ok) {
        await loadServerBackupList();
        showSuccess('현재 시점의 서버 자동저장 백업이 생성되었습니다.');
      } else {
        showError('서버 자동저장 백업 생성에 실패했습니다.');
      }
    } catch (e: any) {
      showError(`오류: ${e?.message || '저장 실패'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestoreServerBackup = async (backupItem: any) => {
    setIsProcessing(true);
    try {
      saveSnapshot('서버 복구 전 자동 백업', records, students);
      const res = await restoreServerBackupFile(backupItem.id, (userRole as UserRole) || 'admin');
      if (res && res.success && res.records && res.students) {
        onRestoreData(res.students, res.records);
        if (onSyncServer) onSyncServer();
        showSuccess(`[${backupItem.formattedTime}] 시점(${backupItem.reason})으로 완벽 복구되었습니다!`);
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        showError(res.error || '백업 복원에 실패했습니다.');
      }
    } catch (e: any) {
      showError(`복구 중 오류가 발생했습니다: ${e?.message || '오류'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. Snapshot Handlers
  const handleCreateManualSnapshot = () => {
    const snap = saveSnapshot('관리자 수동 저장 백업', records, students);
    setSnapshots(loadSnapshots());
    showSuccess(`현재 시점의 백업 스냅샷이 생성되었습니다. (${snap.formattedTime})`);
  };

  const handleRestoreSnapshot = (snap: DataSnapshot) => {
    // 1-Click Restore immediately applied
    onRestoreData(snap.students, snap.records);
    if (onSyncServer) onSyncServer();
    showSuccess(`[${snap.formattedTime}] 시점으로 데이터가 성공적으로 복구되었습니다!`);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  const handleDeleteSnapshot = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSnapshot(id);
    setSnapshots(loadSnapshots());
  };

  // 3. Server Sync Recovery Handler
  const handleRestoreFromServer = async () => {
    setIsProcessing(true);
    try {
      const res = await fetchServerAttendanceState();
      if (res && res.success) {
        saveSnapshot('서버 복구 전 자동 백업', records, students);
        onRestoreData(res.students, res.records);
        if (onSyncServer) onSyncServer();
        showSuccess('서버 최신 마스터 데이터로 완벽하게 복구되었습니다.');
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        showError('서버에서 마스터 데이터를 가져오지 못했습니다.');
      }
    } catch (e: any) {
      showError(`서버 복구 실패: ${e?.message || '오류가 발생했습니다.'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 4. File Backup & Import
  const handleDownloadBackupFile = () => {
    try {
      const jsonContent = exportBackupJSON(students, records);
      const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const filename = `숭신고_미래인재반_출결백업_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.json`;
      
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showSuccess('백업 파일이 다운로드되었습니다.');
    } catch (e) {
      showError('백업 파일 생성 중 오류가 발생했습니다.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const parsed = parseBackupJSON(content);
      if (parsed.success) {
        const studentCnt = parsed.students?.length || 0;
        const recordCnt = parsed.records ? Object.keys(parsed.records).length : 0;
        setParsedFileBackup({
          students: parsed.students,
          records: parsed.records,
          summaryText: `학생 ${studentCnt}명 / 출결 기록 ${recordCnt}건`,
        });
        showSuccess('백업 파일을 정상적으로 읽었습니다. 아래 [파일 데이터로 복원하기] 버튼을 눌러주세요.');
      } else {
        setParsedFileBackup(null);
        showError(`백업 파일 오류: ${parsed.error || '형식이 올바르지 않습니다.'}`);
      }
    };
    reader.onerror = () => {
      showError('파일을 읽는 중 오류가 발생했습니다.');
    };
    reader.readAsText(file);
  };

  const handleApplyFileBackup = () => {
    if (!parsedFileBackup) return;
    saveSnapshot('파일 복원 전 자동 백업', records, students);
    onRestoreData(parsedFileBackup.students, parsedFileBackup.records);
    if (onSyncServer) onSyncServer();
    showSuccess('파일의 백업 데이터로 복원되었습니다.');
    setParsedFileBackup(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  // 5. Initial Data Reset
  const handleResetToInitial = () => {
    saveSnapshot('초기화 복구 전 자동 백업', records, students);
    const initial = resetToInitialData();
    onRestoreData(initial.students, initial.records);
    if (onSyncServer) onSyncServer();
    showSuccess('숭신고 미래인재반 45명 기본 명단으로 초기화 복원되었습니다.');
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-5 sm:px-6 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-850/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>데이터 백업 및 복구 센터</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  안전 관리
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                아침 08:20 / 오후 18:00 정기 자동 저장 백업 및 1클릭 복구 지원
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-4 sm:px-6 pt-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1 sm:gap-2 overflow-x-auto text-[11px] sm:text-xs font-bold scrollbar-none">
          <button
            onClick={() => setActiveTab('scheduled')}
            className={`pb-2 px-2 sm:px-2.5 border-b-2 transition-all flex items-center gap-1 sm:gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'scheduled'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>정기 자동저장 (08:20/18:00)</span>
          </button>

          <button
            onClick={() => setActiveTab('snapshots')}
            className={`pb-2 px-2 sm:px-2.5 border-b-2 transition-all flex items-center gap-1 sm:gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'snapshots'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>스냅샷 복구 ({snapshots.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('server')}
            className={`pb-2 px-2 sm:px-2.5 border-b-2 transition-all flex items-center gap-1 sm:gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'server'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <CloudDownload className="w-3.5 h-3.5" />
            <span>서버 데이터 복구</span>
          </button>

          <button
            onClick={() => setActiveTab('file')}
            className={`pb-2 px-2 sm:px-2.5 border-b-2 transition-all flex items-center gap-1 sm:gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'file'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <FileJson className="w-3.5 h-3.5" />
            <span>JSON 파일 백업/복원</span>
          </button>

          <button
            onClick={() => setActiveTab('reset')}
            className={`pb-2 px-2 sm:px-2.5 border-b-2 transition-all flex items-center gap-1 sm:gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'reset'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>초기 명단 복원</span>
          </button>
        </div>

        {/* Notifications */}
        {successToast && (
          <div className="mx-5 sm:mx-6 mt-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-200 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successToast}</span>
          </div>
        )}

        {errorToast && (
          <div className="mx-5 sm:mx-6 mt-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 flex items-center gap-2 text-xs font-bold text-rose-800 dark:text-rose-200 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorToast}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="p-5 sm:p-6 max-h-[60vh] overflow-y-auto">
          
          {/* TAB 0: Scheduled Auto-Save (08:20, 18:00) */}
          {activeTab === 'scheduled' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-indigo-600 text-white shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                    <span>서버 자동 저장 백업 스케줄러 가동 중</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  </h4>
                  <p className="text-2xs text-indigo-800/80 dark:text-indigo-300 leading-relaxed">
                    매일 <strong className="text-indigo-900 dark:text-indigo-100 font-extrabold">아침 08:20</strong> (아침 자습 마감 시점)과 <strong className="text-indigo-900 dark:text-indigo-100 font-extrabold">오후 18:00</strong> (야간 자습 1타임 시작 전 시점)에 서버가 전체 출결 데이터와 학생 명단을 안전한 파일로 자동 저장합니다.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-850 p-3.5 rounded-xl border border-slate-200 dark:border-slate-750">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    지금 즉시 서버 자동 저장 실행
                  </h4>
                  <p className="text-2xs text-slate-500 dark:text-slate-400">
                    스케줄 시간 외에도 지금 상태를 서버 자동저장 백업 파일로 즉시 생성합니다.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleTriggerServerAutoSave}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all shrink-0 disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>즉시 자동저장</span>
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-2xs font-bold text-slate-500 uppercase tracking-wider px-1">
                  <span>서버에 보관된 자동 저장 목록</span>
                  <span>총 {serverBackups.length}개</span>
                </div>

                {serverBackups.length === 0 ? (
                  <div className="py-8 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/30">
                    <Clock className="w-7 h-7 text-slate-400 mx-auto mb-2 opacity-50" />
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-400">
                      보관된 정기 자동저장 백업이 없습니다.
                    </p>
                    <p className="text-2xs text-slate-400 mt-0.5">
                      위의 '즉시 자동저장' 버튼을 누르거나 08:20 / 18:00 시점에 자동으로 기록됩니다.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {serverBackups.map((item) => (
                      <div
                        key={item.id}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-850 hover:border-indigo-300 dark:hover:border-indigo-800 transition-all flex items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100">
                              {item.formattedTime}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                              {item.reason}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-2xs text-slate-500 dark:text-slate-400">
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3 text-indigo-500" />
                              <span>학생: {item.studentsCount}명</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-emerald-500" />
                              <span>출결 기록: {item.recordsCount}건</span>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleRestoreServerBackup(item)}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 shadow-2xs cursor-pointer transition-all disabled:opacity-50"
                            title="이 시점으로 전체 복구"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>1클릭 복구</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 1: Auto Snapshots */}
          {activeTab === 'snapshots' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-850 p-3.5 rounded-xl border border-slate-200 dark:border-slate-750">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    현재 상태 수동 백업 생성
                  </h4>
                  <p className="text-2xs text-slate-500 dark:text-slate-400">
                    지금 시점의 출결 및 학생 데이터를 스냅샷으로 즉시 보관합니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCreateManualSnapshot}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>스냅샷 저장</span>
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-2xs font-bold text-slate-500 uppercase tracking-wider px-1">
                  <span>보관된 복구 시점 목록 (최신순)</span>
                  <span>총 {snapshots.length}개</span>
                </div>

                {snapshots.length === 0 ? (
                  <div className="py-10 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/30">
                    <History className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-50" />
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-400">
                      아직 보관된 스냅샷이 없습니다.
                    </p>
                    <p className="text-2xs text-slate-400 mt-0.5">
                      '출결 비우기'를 실행하거나 상단의 '스냅샷 저장' 버튼을 누르면 자동으로 생성됩니다.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {snapshots.map((snap) => (
                      <div
                        key={snap.id}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-850 hover:border-emerald-300 dark:hover:border-emerald-800 transition-all flex items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100">
                              {snap.formattedTime}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-750 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              {snap.reason}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-2xs text-slate-500 dark:text-slate-400">
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3 text-indigo-500" />
                              <span>학생: {snap.studentsCount}명</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-emerald-500" />
                              <span>출결 기록: {snap.recordsCount}건</span>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleRestoreSnapshot(snap)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 shadow-2xs cursor-pointer transition-all"
                            title="이 시점으로 전체 복구"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>1클릭 복구</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteSnapshot(snap.id, e)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer transition-colors"
                            title="스냅샷 삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Server & Firestore Cloud State */}
          {activeTab === 'server' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-850 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-emerald-600" />
                    <span>마스터 데이터베이스 상태</span>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      Firestore 클라우드 연동됨
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={loadServerPreview}
                    disabled={serverInfo.loading}
                    className="text-2xs text-emerald-600 hover:text-emerald-700 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${serverInfo.loading ? 'animate-spin' : ''}`} />
                    <span>새로고침</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">등록 학생 수</div>
                    <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">
                      {serverInfo.studentsCount}명
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">전체 출결 기록</div>
                    <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">
                      {serverInfo.recordsCount}건
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">최종 동기화 시각</div>
                    <div className="text-2xs font-extrabold text-slate-900 dark:text-slate-100 mt-0.5 truncate" title={serverInfo.lastModified}>
                      {serverInfo.lastModified || '-'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 space-y-2">
                <h4 className="text-xs font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                  <CloudDownload className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Firestore 클라우드 & 서버 마스터 데이터 복구</span>
                </h4>
                <p className="text-2xs text-emerald-800/80 dark:text-emerald-300 leading-relaxed">
                  다중 키오스크 태블릿이나 기기 간 불일치가 발생했을 때, Firestore 클라우드 및 서버 마스터 DB의 최신 출결 데이터를 즉시 가져와 화면과 로컬 스토리지를 완벽하게 일치시킵니다.
                </p>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleRestoreFromServer}
                  className="w-full mt-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-all disabled:opacity-50"
                >
                  <CloudDownload className="w-4 h-4" />
                  <span>{isProcessing ? '복구 진행 중...' : '서버/클라우드 데이터로 지금 복구하기'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: File Import / Export */}
          {activeTab === 'file' && (
            <div className="space-y-4">
              {/* Export */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-850 space-y-2">
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Download className="w-4 h-4 text-indigo-600" />
                  <span>내 컴퓨터에 백업 파일(.json) 저장하기</span>
                </h4>
                <p className="text-2xs text-slate-500 dark:text-slate-400">
                  현재 등록된 학생 45명 명단과 전체 출결 기록을 JSON 파일로 안전하게 다운로드합니다.
                </p>
                <button
                  type="button"
                  onClick={handleDownloadBackupFile}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>백업 파일 다운로드 (JSON)</span>
                </button>
              </div>

              {/* Import */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-850 space-y-3">
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Upload className="w-4 h-4 text-emerald-600" />
                  <span>백업 파일(.json) 업로드하여 복원하기</span>
                </h4>
                <p className="text-2xs text-slate-500 dark:text-slate-400">
                  이전에 저장해 둔 JSON 백업 파일을 선택하여 출결 기록을 복원합니다.
                </p>
                
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json"
                  onChange={handleFileUpload}
                  className="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 dark:file:bg-emerald-950 dark:file:text-emerald-300 cursor-pointer"
                />

                {parsedFileBackup && (
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 space-y-2">
                    <div className="text-2xs font-bold text-emerald-800 dark:text-emerald-200">
                      선택된 백업 파일 정보:
                    </div>
                    <div className="text-xs font-extrabold text-emerald-900 dark:text-emerald-100">
                      {parsedFileBackup.summaryText}
                    </div>
                    <button
                      type="button"
                      onClick={handleApplyFileBackup}
                      className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1 shadow-sm cursor-pointer transition-all"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>파일 데이터로 복원하기</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: Initial Reset */}
          {activeTab === 'reset' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20 space-y-2">
                <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 font-extrabold text-xs">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span>숭신고 미래인재반 45명 초기 기본 상태 복원</span>
                </div>
                <p className="text-2xs text-rose-600/90 dark:text-rose-300/80 leading-relaxed">
                  모든 출결 기록을 비우고, 시스템에 내장된 숭신고 미래인재반 45명(3학년 14명, 2학년 16명, 1학년 15명) 기본 명단으로 깨끗하게 초기 복원합니다.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleResetToInitial}
                    className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-all"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>숭신고 기본 명단으로 초기 복원</span>
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 flex items-center justify-between text-2xs text-slate-500">
          <span>※ 모든 복구 실행 시, 현재 상태는 자동 스냅샷으로 안전하게 사전 백업됩니다.</span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750 font-bold cursor-pointer"
          >
            닫기
          </button>
        </div>

      </div>
    </div>
  );
};
