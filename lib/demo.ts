// Four original, deterministic musical sketches synthesized entirely on the device.
export function makeDemo(index: number): File {
  const rate = 22050, seconds = 20, n = rate * seconds;
  const bytes = new ArrayBuffer(44 + n * 2), view = new DataView(bytes);
  const str = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  str(0, 'RIFF'); view.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); str(36, 'data'); view.setUint32(40, n * 2, true);
  const notes = [[60, 64, 67, 71, 67, 64, 62, 67], [57, 60, 64, 69, 67, 64, 60, 64], [62, 65, 69, 72, 74, 69, 65, 69], [55, 59, 62, 66, 62, 59, 57, 62]][index];
  const beat = [0.55, 0.75, 0.38, 0.66][index];
  for (let i = 0; i < n; i++) {
    const t = i / rate, step = Math.floor(t / beat), phase = t % beat;
    const freq = 440 * 2 ** ((notes[step % notes.length] - 69) / 12);
    const env = (1 - Math.exp(-phase * 75)) * Math.exp(-phase * (index === 2 ? 7 : 3));
    const melody = (Math.sin(2 * Math.PI * freq * phase) + 0.18 * Math.sin(4 * Math.PI * freq * phase)) * env * 0.17;
    const root = 440 * 2 ** ((notes[Math.floor(step / 8) % 2 ? 2 : 0] - 93) / 12);
    const bass = Math.sin(2 * Math.PI * root * t) * 0.065;
    const pad = (Math.sin(2 * Math.PI * root * 4 * t) + Math.sin(2 * Math.PI * root * 6 * t)) * 0.023;
    const bp = t % (beat * 2);
    const kick = index === 2 ? Math.sin(2 * Math.PI * (50 * bp + 1.1 * (1 - Math.exp(-bp * 35)))) * Math.exp(-bp * 18) * 0.18 : 0;
    const fade = Math.min(1, t / 0.6, (seconds - t) / 2);
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, (melody + bass + pad + kick) * fade)) * 32767, true);
  }
  return new File([bytes], `Onda Demo ${index + 1}.wav`, { type: 'audio/wav', lastModified: 0 });
}
export const demoTags = [
  { title: 'Primo sole', artist: 'Onda Studio', genre: 'Ambient' },
  { title: 'Dopo mezzanotte', artist: 'Onda Studio', genre: 'Ambient' },
  { title: 'In movimento', artist: 'Frequenze', genre: 'Elettronica' },
  { title: 'A occhi chiusi', artist: 'Frequenze', genre: 'Lo-fi' },
];
