let context: AudioContext | null = null;
let noise: AudioBuffer | null = null;

/**
 * A short, soft tick like a stylus going through paper, made with Web Audio
 * so there's no sound file to load. The audio context is created on the
 * first tap, since browsers only allow sound after a user gesture.
 */
export function playClick(punched: boolean): void {
  try {
    const context = audio();
    if (!noise) {
      const length = Math.floor(context.sampleRate * 0.03);
      noise = context.createBuffer(1, length, context.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length / 6));
    }
    const source = context.createBufferSource();
    source.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    // Punching sounds sharper than taking a dot out.
    filter.frequency.value = punched ? 3200 : 1400;
    filter.Q.value = 1.2;
    const gain = context.createGain();
    gain.gain.value = punched ? 0.9 : 0.5;
    source.connect(filter).connect(gain).connect(context.destination);
    source.start();
  } catch {
    // No sound; the slate still works.
  }
}

function audio(): AudioContext {
  if (!context) {
    // Safari: sounds follow the iPhone's silent switch and mix with other audio, like a game's effects.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'ambient';
    context = new AudioContext();
  }
  if (context.state === 'suspended') void context.resume();
  return context;
}

/** Plays decaying sine partials, each starting after its delay, if it has one. */
function ring(partials: [frequency: number, gain: number, seconds: number, delay?: number][]): void {
  try {
    const ctx = audio();
    for (const [frequency, level, seconds, delay = 0] of partials) {
      const now = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      osc.frequency.value = frequency;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(level, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + seconds);
    }
  } catch {
    // No sound.
  }
}

/** A small bell, like the margin bell on a braillewriter. */
export function playBell(): void {
  ring([
    [1975, 0.22, 1.1],
    [4970, 0.07, 0.5],
    [7240, 0.03, 0.25],
  ]);
}

/** A dull knock: nothing was written, because the line is full. */
export function playStop(): void {
  ring([
    [180, 0.35, 0.12],
    [260, 0.15, 0.08],
  ]);
}

/**
 * Two soft notes falling: a word has an error, so have a look. It's a nudge,
 * quieter and gentler than the knock or the bell.
 */
export function playError(): void {
  ring([
    [392, 0.12, 0.22],
    [1176, 0.015, 0.08],
    [330, 0.12, 0.32, 0.1],
    [990, 0.015, 0.08, 0.1],
  ]);
}

/** The same two notes rising: a word with an error was put right. */
export function playFixed(): void {
  ring([
    [523.25, 0.09, 0.22],
    [1569.75, 0.012, 0.08],
    [784, 0.09, 0.4, 0.1],
    [2352, 0.012, 0.1, 0.1],
  ]);
}
