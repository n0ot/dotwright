let context: AudioContext | null = null;
let noise: AudioBuffer | null = null;

/**
 * A short, soft tick like a stylus going through paper, made with Web Audio
 * so there's no sound file to load. The audio context is created on the
 * first tap, since browsers only allow sound after a user gesture.
 */
export function playClick(punched: boolean): void {
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
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
