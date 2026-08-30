import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Set explicit anti-cache headers for all API requests
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Master state file path
const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'attendance-master.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

// Ensure directories
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// Default initial 45 students list (숭신고 미래인재반)
const DEFAULT_STUDENTS = [
  // 3학년 (15명)
  { id: 's-3-1', seq: 1, grade: 3, classNum: 1, studentNum: 19, name: '최서윤', seatNum: '3-01', phone: '010-6651-6075', parentPhone: '010-7292-1160', academyDays: [], active: true },
  { id: 's-3-2', seq: 2, grade: 3, classNum: 2, studentNum: 18, name: '최시온', seatNum: '3-02', phone: '010-8834-6879', parentPhone: '010-6487-6879', academyDays: [], active: true },
  { id: 's-3-3', seq: 3, grade: 3, classNum: 3, studentNum: 1, name: '강지윤', seatNum: '3-03', phone: '010-4186-6325', parentPhone: '010-8788-6325', academyDays: [], active: true },
  { id: 's-3-4', seq: 4, grade: 3, classNum: 4, studentNum: 11, name: '신예은', seatNum: '3-04', phone: '010-6617-1874', parentPhone: '010-8701-1874', academyDays: [], active: true },
  { id: 's-3-5', seq: 5, grade: 3, classNum: 5, studentNum: 1, name: '강정인', seatNum: '3-05', phone: '010-4915-4450', parentPhone: '010-4919-4450', academyDays: [], active: true },
  { id: 's-3-6', seq: 6, grade: 3, classNum: 5, studentNum: 8, name: '문채원', seatNum: '3-06', phone: '010-3454-6220', parentPhone: '010-2038-6220', academyDays: [], active: true },
  { id: 's-3-7', seq: 7, grade: 3, classNum: 6, studentNum: 18, name: '조성희', seatNum: '3-07', phone: '010-4966-5415', parentPhone: '010-6254-5415', academyDays: [], active: true },
  { id: 's-3-8', seq: 8, grade: 3, classNum: 6, studentNum: 20, name: '최은서', seatNum: '3-08', phone: '010-8315-8118', parentPhone: '010-4296-8118', academyDays: [], active: true },
  { id: 's-3-9', seq: 9, grade: 3, classNum: 7, studentNum: 7, name: '김현서', seatNum: '3-09', phone: '010-2910-2129', parentPhone: '010-3385-2129', academyDays: [], active: true },
  { id: 's-3-10', seq: 10, grade: 3, classNum: 7, studentNum: 9, name: '박주원', seatNum: '3-10', phone: '010-8545-8783', parentPhone: '010-5399-8783', academyDays: [], active: true },
  { id: 's-3-11', seq: 11, grade: 3, classNum: 8, studentNum: 13, name: '오윤서', seatNum: '3-11', phone: '010-7255-6452', parentPhone: '010-2776-4964', academyDays: [], active: true },
  { id: 's-3-12', seq: 12, grade: 3, classNum: 8, studentNum: 16, name: '정시은', seatNum: '3-12', phone: '010-2483-0799', parentPhone: '010-2920-0710', academyDays: [], active: true },
  { id: 's-3-13', seq: 13, grade: 3, classNum: 9, studentNum: 1, name: '강희주', seatNum: '3-13', phone: '010-7616-3151', parentPhone: '010-3899-0097', academyDays: [], active: true },
  { id: 's-3-14', seq: 14, grade: 3, classNum: 9, studentNum: 19, name: '최보윤', seatNum: '3-14', phone: '010-7540-7946', parentPhone: '010-2294-7946', academyDays: [], active: true },
  { id: 's-3-15', seq: 15, grade: 3, classNum: 10, studentNum: 19, name: '현려경', seatNum: '3-15', phone: '010-3218-6822', parentPhone: '010-8430-2722', academyDays: [], active: true },

  // 2학년 (15명)
  { id: 's-2-1', seq: 1, grade: 2, classNum: 1, studentNum: 6, name: '김도은', seatNum: '2-01', phone: '010-3184-7833', parentPhone: '010-9146-1126', academyDays: [], active: true },
  { id: 's-2-2', seq: 2, grade: 2, classNum: 1, studentNum: 8, name: '김태연', seatNum: '2-02', phone: '010-3443-2407', parentPhone: '010-7224-3709', academyDays: [], active: true },
  { id: 's-2-3', seq: 3, grade: 2, classNum: 2, studentNum: 5, name: '김나현', seatNum: '2-03', phone: '010-7687-5637', parentPhone: '010-5311-5637', academyDays: [], active: true },
  { id: 's-2-4', seq: 4, grade: 2, classNum: 2, studentNum: 6, name: '김세빈', seatNum: '2-04', phone: '010-4860-4766', parentPhone: '010-6374-4766', academyDays: [], active: true },
  { id: 's-2-5', seq: 5, grade: 2, classNum: 3, studentNum: 6, name: '김은성', seatNum: '2-05', phone: '010-7401-9775', parentPhone: '010-8884-9775', academyDays: [], active: true },
  { id: 's-2-6', seq: 6, grade: 2, classNum: 4, studentNum: 7, name: '임수민', seatNum: '2-06', phone: '010-9512-4648', parentPhone: '010-9866-7415', academyDays: [], active: true },
  { id: 's-2-7', seq: 7, grade: 2, classNum: 5, studentNum: 5, name: '김은서', seatNum: '2-07', phone: '010-9561-9991', parentPhone: '010-9360-9992', academyDays: [], active: true },
  { id: 's-2-9', seq: 8, grade: 2, classNum: 6, studentNum: 1, name: '권지연', seatNum: '2-08', phone: '010-3993-2294', parentPhone: '010-8324-2294', academyDays: [], active: true },
  { id: 's-2-10', seq: 9, grade: 2, classNum: 6, studentNum: 16, name: '조아인', seatNum: '2-09', phone: '010-9231-1833', parentPhone: '010-8777-8388', academyDays: [], active: true },
  { id: 's-2-11', seq: 10, grade: 2, classNum: 6, studentNum: 19, name: '황하진', seatNum: '2-10', phone: '010-4031-2134', parentPhone: '010-4779-5877', academyDays: [], active: true },
  { id: 's-2-12', seq: 11, grade: 2, classNum: 7, studentNum: 17, name: '조현지', seatNum: '2-11', phone: '010-4192-2465', parentPhone: '010-9247-2465', academyDays: [], active: true },
  { id: 's-2-13', seq: 12, grade: 2, classNum: 7, studentNum: 19, name: '황수연', seatNum: '2-12', phone: '010-6265-6640', parentPhone: '010-4107-6640', academyDays: [], active: true },
  { id: 's-2-14', seq: 13, grade: 2, classNum: 8, studentNum: 14, name: '은예진', seatNum: '2-13', phone: '010-7266-1073', parentPhone: '010-7220-2542', academyDays: [], active: true },
  { id: 's-2-15', seq: 14, grade: 2, classNum: 9, studentNum: 3, name: '김수안', seatNum: '2-14', phone: '010-8616-5414', parentPhone: '010-4876-5414', academyDays: [], active: true },
  { id: 's-2-16', seq: 15, grade: 2, classNum: 9, studentNum: 12, name: '윤시현', seatNum: '2-15', phone: '010-9813-0215', parentPhone: '010-9458-8971', academyDays: [], active: true },

  // 1학년 (15명)
  { id: 's-1-1', seq: 1, grade: 1, classNum: 1, studentNum: 3, name: '김민송', seatNum: '1-01', phone: '010-7648-7440', parentPhone: '010-7608-7440', academyDays: [], active: true },
  { id: 's-1-2', seq: 2, grade: 1, classNum: 1, studentNum: 4, name: '김봄', seatNum: '1-02', phone: '010-4044-4706', parentPhone: '010-9639-1054', academyDays: [], active: true },
  { id: 's-1-3', seq: 3, grade: 1, classNum: 2, studentNum: 10, name: '우채원', seatNum: '1-03', phone: '010-2169-5247', parentPhone: '010-7139-5247', academyDays: [], active: true },
  { id: 's-1-4', seq: 4, grade: 1, classNum: 4, studentNum: 7, name: '문지영', seatNum: '1-04', phone: '010-3974-1251', parentPhone: '010-8238-1251', academyDays: [], active: true },
  { id: 's-1-5', seq: 5, grade: 1, classNum: 4, studentNum: 14, name: '이민준', seatNum: '1-05', phone: '010-2509-1964', parentPhone: '010-3645-1964', academyDays: [], active: true },
  { id: 's-1-6', seq: 6, grade: 1, classNum: 4, studentNum: 18, name: '전은설', seatNum: '1-06', phone: '010-8586-1456', parentPhone: '010-9040-1456', academyDays: [], active: true },
  { id: 's-1-7', seq: 7, grade: 1, classNum: 5, studentNum: 3, name: '김도연', seatNum: '1-07', phone: '010-4079-6507', parentPhone: '010-2896-6507', academyDays: [], active: true },
  { id: 's-1-8', seq: 8, grade: 1, classNum: 5, studentNum: 20, name: '지은서', seatNum: '1-08', phone: '010-2820-4028', parentPhone: '010-6300-4028', academyDays: [], active: true },
  { id: 's-1-9', seq: 9, grade: 1, classNum: 5, studentNum: 21, name: '하윤성', seatNum: '1-09', phone: '010-6709-3245', parentPhone: '010-9960-0838', academyDays: [], active: true },
  { id: 's-1-10', seq: 10, grade: 1, classNum: 8, studentNum: 13, name: '임지호', seatNum: '1-10', phone: '010-9514-4648', parentPhone: '010-9866-7415', academyDays: [], active: true },
  { id: 's-1-11', seq: 11, grade: 1, classNum: 9, studentNum: 3, name: '김민정', seatNum: '1-11', phone: '010-4798-2572', parentPhone: '010-6376-2572', academyDays: [], active: true },
  { id: 's-1-12', seq: 12, grade: 1, classNum: 9, studentNum: 12, name: '양태훈', seatNum: '1-12', phone: '010-9584-5263', parentPhone: '010-9945-5263', academyDays: [], active: true },
  { id: 's-1-13', seq: 13, grade: 1, classNum: 9, studentNum: 20, name: '조하린', seatNum: '1-13', phone: '010-9545-7090', parentPhone: '010-2624-7090', academyDays: [], active: true },
  { id: 's-1-14', seq: 14, grade: 1, classNum: 10, studentNum: 9, name: '배준서', seatNum: '1-14', phone: '010-7554-2898', parentPhone: '010-3063-2898', academyDays: [], active: true },
  { id: 's-1-15', seq: 15, grade: 1, classNum: 10, studentNum: 19, name: '이하영', seatNum: '1-15', phone: '010-9206-4794', parentPhone: '010-5206-4794', academyDays: [], active: true },
];

interface MasterState {
  students: any[];
  records: Record<string, { status: string; reason?: string; checkInTime?: string }>;
  version: number;
  lastModified: number;
}

let masterState: MasterState = {
  students: DEFAULT_STUDENTS,
  records: {},
  version: 1,
  lastModified: Date.now(),
};

// Ensure data dir and load from file if exists
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(STATE_FILE)) {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      // Map students, ensuring empty initial academyDays by default as requested
      const loadedStudents = Array.isArray(parsed.students) && parsed.students.length > 0
        ? parsed.students.map((st: any) => ({
            ...st,
            academyDays: Array.isArray(st.academyDays) ? st.academyDays : []
          }))
        : DEFAULT_STUDENTS;

      masterState = {
        students: loadedStudents,
        records: parsed.records || {},
        version: parsed.version || 1,
        lastModified: parsed.lastModified || Date.now(),
      };
      console.log(`[Master State] Loaded ${Object.keys(masterState.records).length} records from disk.`);
    }
  } else {
    fs.writeFileSync(STATE_FILE, JSON.stringify(masterState, null, 2), 'utf-8');
  }
} catch (e) {
  console.warn('[Master State] Init file warning:', e);
}

function persistState() {
  try {
    masterState.version += 1;
    masterState.lastModified = Date.now();
    fs.writeFileSync(STATE_FILE, JSON.stringify(masterState, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Master State] Persist error:', e);
  }
}

// Helper to create timestamped server backup file
function createServerAutoBackup(label: string) {
  try {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    // Format YYYY-MM-DD_HH-mm-ss
    const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timePart = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const filename = `backup_${datePart}_${timePart}_${label.replace(/[^a-zA-Z0-9가-힣_-]/g, '_')}.json`;
    const filepath = path.join(BACKUP_DIR, filename);

    const backupData = {
      id: `srv_backup_${Date.now()}`,
      timestamp: Date.now(),
      formattedTime: `${datePart} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
      reason: label,
      studentsCount: masterState.students.length,
      recordsCount: Object.keys(masterState.records).length,
      students: masterState.students,
      records: masterState.records,
    };

    fs.writeFileSync(filepath, JSON.stringify(backupData, null, 2), 'utf-8');
    console.log(`[Auto-Save] Created server backup: ${filename}`);

    // Keep latest 30 backup files
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);

    if (files.length > 30) {
      files.slice(30).forEach(f => {
        try { fs.unlinkSync(path.join(BACKUP_DIR, f.name)); } catch {}
      });
    }
  } catch (e) {
    console.error('[Auto-Save] Failed to create server backup:', e);
  }
}

// Scheduled Auto-Save at 08:20 (Morning check-in close) and 18:00 (Afternoon/Night prep)
let lastTriggeredDateString = '';
setInterval(() => {
  try {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const pad = (n: number) => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    
    // 08:20 Morning Auto Backup
    const morningKey = `${todayStr}_08:20`;
    if (hours === 8 && minutes === 20 && lastTriggeredDateString !== morningKey) {
      lastTriggeredDateString = morningKey;
      createServerAutoBackup('아침 08:20 자동 저장 백업');
    }

    // 18:00 Afternoon/Evening Auto Backup
    const eveningKey = `${todayStr}_18:00`;
    if (hours === 18 && minutes === 0 && lastTriggeredDateString !== eveningKey) {
      lastTriggeredDateString = eveningKey;
      createServerAutoBackup('오후 18:00 자동 저장 백업');
    }
  } catch (err) {
    console.error('[Auto-Save Cron Error]:', err);
  }
}, 25000); // Check every 25 seconds

// -------------------------------------------------------------
// API Endpoints
// -------------------------------------------------------------

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: Date.now() });
});

// GET full master state
app.get('/api/attendance/state', (req, res) => {
  res.json({
    success: true,
    students: masterState.students,
    records: masterState.records,
    version: masterState.version,
    lastModified: masterState.lastModified,
  });
});

// POST update single record (Kiosk tablet & Admin)
app.post('/api/attendance/update-record', (req, res) => {
  const { studentId, session, dateStr, status, reason, checkInTime, role } = req.body;

  // Teacher mode is strictly READ-ONLY. Teachers cannot overwrite server master records.
  if (role === 'teacher' || role === 'teacher_mobile') {
    return res.status(403).json({
      success: false,
      error: 'Teacher role is read-only. Modification not allowed.',
    });
  }

  if (!studentId || !session || !dateStr) {
    return res.status(400).json({ success: false, error: 'Missing required parameters' });
  }

  const key = `${studentId}_${session}_${dateStr}`;
  const now = new Date();
  const currentTimestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  let finalCheckInTime = undefined;
  if (status && status !== 'NONE') {
    finalCheckInTime = checkInTime !== undefined ? checkInTime : (masterState.records[key]?.checkInTime || currentTimestamp);
  }

  // If a valid reason string is provided, use it. Otherwise, new attendance data automatically clears any prior reason.
  let finalReason: string | undefined = undefined;
  if (typeof reason === 'string' && reason.trim() !== '') {
    finalReason = reason.trim();
  } else {
    finalReason = undefined;
  }

  if (!status || status === 'NONE') {
    masterState.records[key] = {
      status: 'NONE',
      reason: undefined,
      checkInTime: undefined,
    };
  } else {
    masterState.records[key] = {
      status,
      reason: finalReason,
      checkInTime: finalCheckInTime,
    };
  }

  persistState();

  res.json({
    success: true,
    record: masterState.records[key],
    version: masterState.version,
    lastModified: masterState.lastModified,
  });
});

// POST batch update (Admin only)
app.post('/api/attendance/batch-update', (req, res) => {
  const { updates, role } = req.body;

  if (role === 'teacher' || role === 'teacher_mobile') {
    return res.status(403).json({ success: false, error: 'Teacher role is read-only.' });
  }

  if (Array.isArray(updates)) {
    const now = new Date();
    const currentTimestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    updates.forEach(u => {
      if (u.studentId && u.session && u.dateStr) {
        const key = `${u.studentId}_${u.session}_${u.dateStr}`;
        const newStatus = u.status || 'NONE';

        let finalReason: string | undefined = undefined;
        if (typeof u.reason === 'string' && u.reason.trim() !== '') {
          finalReason = u.reason.trim();
        } else {
          finalReason = undefined;
        }

        if (newStatus === 'NONE') {
          masterState.records[key] = {
            status: 'NONE',
            reason: undefined,
            checkInTime: undefined,
          };
        } else {
          masterState.records[key] = {
            status: newStatus,
            reason: finalReason,
            checkInTime: u.checkInTime || masterState.records[key]?.checkInTime || currentTimestamp,
          };
        }
      }
    });

    persistState();
  }

  res.json({
    success: true,
    records: masterState.records,
    version: masterState.version,
    lastModified: masterState.lastModified,
  });
});

// POST clear attendance (Admin only)
app.post('/api/attendance/clear', (req, res) => {
  const { scope, dateStr, session, year, month, gradeFilter, role } = req.body;

  if (role === 'teacher' || role === 'teacher_mobile') {
    return res.status(403).json({ success: false, error: 'Teacher role is read-only.' });
  }

  if (scope === 'single-day') {
    if (dateStr && session) {
      Object.keys(masterState.records).forEach(key => {
        if (key.includes(`_${session}_${dateStr}`)) {
          // If gradeFilter specified, check student grade
          if (gradeFilter !== undefined && gradeFilter !== 'all') {
            const studentId = key.split('_')[0];
            const st = masterState.students.find(s => s.id === studentId);
            if (st && st.grade === Number(gradeFilter)) {
              delete masterState.records[key];
            }
          } else {
            delete masterState.records[key];
          }
        }
      });
    }
  } else if (scope === 'month-session') {
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
    Object.keys(masterState.records).forEach(key => {
      const parts = key.split('_');
      if (parts.length >= 3) {
        const keySession = parts[1];
        const keyDate = parts[2];
        if (keySession === session && keyDate.startsWith(monthPrefix)) {
          delete masterState.records[key];
        }
      }
    });
  } else if (scope === 'all') {
    masterState.records = {};
  }

  persistState();

  res.json({
    success: true,
    records: masterState.records,
    version: masterState.version,
    lastModified: masterState.lastModified,
  });
});

// POST update student roster (Admin only)
app.post('/api/attendance/students', (req, res) => {
  const { students, role } = req.body;

  if (role === 'teacher' || role === 'teacher_mobile') {
    return res.status(403).json({ success: false, error: 'Teacher role is read-only.' });
  }

  if (Array.isArray(students) && students.length > 0) {
    masterState.students = students;
    persistState();
  }

  res.json({
    success: true,
    students: masterState.students,
    version: masterState.version,
    lastModified: masterState.lastModified,
  });
});

// POST full restore of records and students (Admin only)
app.post('/api/attendance/restore-state', (req, res) => {
  const { records, students, role } = req.body;

  if (role === 'teacher' || role === 'teacher_mobile') {
    return res.status(403).json({ success: false, error: 'Teacher role is read-only.' });
  }

  if (records && typeof records === 'object') {
    masterState.records = { ...records };
  }
  if (Array.isArray(students) && students.length > 0) {
    masterState.students = [...students];
  }

  persistState();

  res.json({
    success: true,
    students: masterState.students,
    records: masterState.records,
    version: masterState.version,
    lastModified: masterState.lastModified,
  });
});

// GET list of server auto/manual backups
app.get('/api/attendance/backups', (req, res) => {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const fullPath = path.join(BACKUP_DIR, f);
        const stats = fs.statSync(fullPath);
        try {
          const content = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
          return {
            id: f,
            timestamp: content.timestamp || stats.mtime.getTime(),
            formattedTime: content.formattedTime || new Date(stats.mtime).toLocaleString('ko-KR'),
            reason: content.reason || '자동 백업',
            studentsCount: content.studentsCount || (content.students?.length || 0),
            recordsCount: content.recordsCount || (Object.keys(content.records || {}).length),
          };
        } catch {
          return {
            id: f,
            timestamp: stats.mtime.getTime(),
            formattedTime: new Date(stats.mtime).toLocaleString('ko-KR'),
            reason: '백업 파일',
            studentsCount: 0,
            recordsCount: 0,
          };
        }
      })
      .sort((a, b) => b.timestamp - a.timestamp);

    res.json({ success: true, backups: files });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST create server backup immediately (Admin only)
app.post('/api/attendance/create-backup', (req, res) => {
  const { reason, role } = req.body;
  if (role === 'teacher' || role === 'teacher_mobile') {
    return res.status(403).json({ success: false, error: 'Teacher role is read-only.' });
  }

  createServerAutoBackup(reason || '관리자 수동 자동저장 백업');
  res.json({ success: true, message: 'Server backup created successfully.' });
});

// POST restore from a server backup file (Admin only)
app.post('/api/attendance/restore-backup-file', (req, res) => {
  const { backupId, role } = req.body;
  if (role === 'teacher' || role === 'teacher_mobile') {
    return res.status(403).json({ success: false, error: 'Teacher role is read-only.' });
  }

  try {
    const fullPath = path.join(BACKUP_DIR, path.basename(backupId));
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, error: 'Backup file not found.' });
    }

    const content = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    if (content.records && typeof content.records === 'object') {
      masterState.records = { ...content.records };
    }
    if (Array.isArray(content.students) && content.students.length > 0) {
      masterState.students = [...content.students];
    }
    persistState();

    res.json({
      success: true,
      students: masterState.students,
      records: masterState.records,
      version: masterState.version,
      lastModified: masterState.lastModified,
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST sync endpoint
app.post('/api/attendance/sync', (req, res) => {
  const { role, localRecords } = req.body;

  // If teacher, strictly return server state without accepting any client records
  if (role === 'teacher') {
    return res.json({
      success: true,
      students: masterState.students,
      records: masterState.records,
      version: masterState.version,
      lastModified: masterState.lastModified,
      readOnly: true,
    });
  }

  // If admin provided initial master upload when server is empty
  if (role === 'admin' && localRecords && Object.keys(masterState.records).length === 0 && Object.keys(localRecords).length > 0) {
    masterState.records = { ...localRecords };
    persistState();
  }

  res.json({
    success: true,
    students: masterState.students,
    records: masterState.records,
    version: masterState.version,
    lastModified: masterState.lastModified,
  });
});

// -------------------------------------------------------------
// Vite Middleware / Static Asset Serving
// -------------------------------------------------------------

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
