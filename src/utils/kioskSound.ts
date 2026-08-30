/**
 * Sound effects and Korean TTS announcements for Classroom Attendance Kiosk
 */

let isAudioMuted = false;

export function setKioskAudioMuted(muted: boolean) {
  isAudioMuted = muted;
  try {
    localStorage.setItem('soongshin_kiosk_audio_muted', muted ? 'true' : 'false');
  } catch {
    // Ignore storage error
  }
}

export function getKioskAudioMuted(): boolean {
  try {
    const saved = localStorage.getItem('soongshin_kiosk_audio_muted');
    if (saved !== null) {
      isAudioMuted = saved === 'true';
    }
  } catch {
    // Ignore storage error
  }
  return isAudioMuted;
}

/**
 * Play a synthesizer chime using Web Audio API
 */
export function playChimeSound(type: 'present' | 'late' | 'error' | 'click') {
  if (isAudioMuted || typeof window === 'undefined') return;

  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    if (type === 'present') {
      // Cheerful rising two-tone chime (G5 -> C6)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';

      osc1.frequency.setValueAtTime(783.99, now); // G5
      osc1.frequency.setValueAtTime(1046.50, now + 0.12); // C6

      osc2.frequency.setValueAtTime(1318.51, now + 0.12); // E6

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.6);
      osc2.stop(now + 0.6);
    } else if (type === 'late') {
      // Warm notification two-tone chime (F5 -> D5)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(698.46, now); // F5
      osc.frequency.setValueAtTime(587.33, now + 0.15); // D5

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.55);
    } else if (type === 'error') {
      // Low warning buzz
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.setValueAtTime(180, now + 0.1);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'click') {
      // Soft click
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.05);
    }
  } catch (e) {
    console.warn('Could not play Web Audio chime:', e);
  }
}

/**
 * Korean TTS voice announcement for classroom kiosk:
 * e.g., "최서윤 학생 입실 완료(18:42)" or "최서윤 학생 지각 입실 완료(18:42)"
 */
export function announceStudentAttendance(studentName: string, isLate: boolean, timeStr: string) {
  // 1. Play chime sound immediately
  playChimeSound(isLate ? 'late' : 'present');

  if (isAudioMuted || typeof window === 'undefined') return;

  // 2. Korean Speech Synthesis (TTS)
  try {
    if ('speechSynthesis' in window) {
      // Cancel previous pending speech to avoid queuing delays
      window.speechSynthesis.cancel();

      const [hoursStr, minsStr] = (timeStr || '18:00').split(':');
      const hours = parseInt(hoursStr, 10);
      const mins = parseInt(minsStr, 10);

      // Korean natural spoken phrase matching exact user specification:
      // "최서윤 학생 입실 완료(18:42)" or "최서윤 학생 지각 입실 완료(18:42)"
      const text = isLate
        ? `${studentName} 학생 지각 입실 완료. ${hours}시 ${mins > 0 ? `${mins}분` : '정각'}`
        : `${studentName} 학생 입실 완료. ${hours}시 ${mins > 0 ? `${mins}분` : '정각'}`;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = 1.05; // Slightly clear and prompt
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      // Select best Korean voice if available
      const voices = window.speechSynthesis.getVoices();
      const koVoice = voices.find(v => v.lang === 'ko-KR' || v.lang.startsWith('ko'));
      if (koVoice) {
        utterance.voice = koVoice;
      }

      window.speechSynthesis.speak(utterance);
    }
  } catch (e) {
    console.warn('Speech synthesis announcement error:', e);
  }
}
