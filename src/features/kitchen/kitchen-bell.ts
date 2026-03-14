/**
 * Kitchen bell sound — plays when a new order arrives at the kitchen display
 */
let audioCtx: AudioContext | null = null;

export function playKitchenBell() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    // Two-tone bell: ding-dong
    const now = audioCtx.currentTime;

    // First tone (higher)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0.5, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    osc1.start(now);
    osc1.stop(now + 0.4);

    // Second tone (lower)
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(660, now + 0.15);
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(0.5, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.6);
  } catch {
    // Silently ignore
  }
}
