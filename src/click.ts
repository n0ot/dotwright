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
  // Safari's "ambient" audio session would follow the silent switch, but on
  // iPhone it silenced the sounds even with the ringer on, so it isn't used.
  context ??= new AudioContext();
  if (context.state === 'suspended') void context.resume();
  return context;
}

/** Plays decaying sine partials, starting together. */
function ring(partials: [frequency: number, gain: number, seconds: number][]): void {
  try {
    const ctx = audio();
    const now = ctx.currentTime;
    for (const [frequency, level, seconds] of partials) {
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
