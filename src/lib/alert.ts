// Rest-over alert: vibration where supported (Android), plus a short beep through
// the phone speaker or headphones. iOS only lets a page play sound after a tap, so
// primeAudio() is called from the set tick to unlock the audio context.

let ctx: AudioContext | null = null;

export function primeAudio() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* audio unavailable */
  }
}

function beep(at: number, freq: number) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = freq;
  osc.type = 'square';
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.25, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.2);
}

export function restOverAlert() {
  navigator.vibrate?.([250, 120, 250]);
  try {
    if (ctx && ctx.state === 'running') {
      const t = ctx.currentTime;
      beep(t, 880);
      beep(t + 0.25, 1175);
    }
  } catch {
    /* ignore */
  }
}

export function tickFeedback() {
  navigator.vibrate?.(15);
  primeAudio();
}
