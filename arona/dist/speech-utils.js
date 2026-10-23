export function encodeWav(samples, rate = 16000) {
  const data = new ArrayBuffer(44 + samples.length * 2), view = new DataView(data);
  const word = (at, text) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  word(0, 'RIFF'); view.setUint32(4, data.byteLength - 8, true); word(8, 'WAVE'); word(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  word(36, 'data'); view.setUint32(40, samples.length * 2, true);
  samples.forEach((value, i) => { const sample = Math.max(-1, Math.min(1, value)); view.setInt16(44 + i * 2, sample * (sample < 0 ? 32768 : 32767), true); });
  return data;
}
export function speechParts(value) {
  let text = value.replace(/```[\s\S]*?```/g, '（这里有一段代码，请查看文字。）')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '').replace(/[*#`_>|]/g, '').trim();
  const parts = [];
  while (text.length) {
    let end = Math.min(480, text.length);
    if (end < text.length) {
      const first = text.slice(0, end), cut = Math.max(...['。', '！', '？', '\n', '；', '. ', '，', ' '].map(mark => first.lastIndexOf(mark)));
      if (cut > 120) end = cut + 1;
      if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    }
    const part = text.slice(0, end).trim(); if (part) parts.push(part); text = text.slice(end).trim();
  }
  return parts;
}
