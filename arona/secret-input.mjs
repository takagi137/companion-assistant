// Read credentials without echoing them or putting them in process arguments/files.
export function readSecret(prompt) {
  return new Promise((resolve, reject) => {
    const input = process.stdin; let value = '';
    if (input.isTTY) input.setRawMode(true);
    input.setEncoding('utf8'); input.resume();
    const cleanup = () => { input.off('data', onData); if (input.isTTY) input.setRawMode(false); input.pause(); };
    const onData = chunk => {
      for (const char of chunk) {
        if (char === '\u0003') { cleanup(); reject(new Error('输入已取消。')); return; }
        if (char === '\n' || char === '\r') { cleanup(); process.stdout.write('\n'); resolve(value.trim()); value = ''; return; }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1); else value += char;
      }
    };
    input.on('data', onData);
    process.stdout.write(`${prompt}\n`);
  });
}
