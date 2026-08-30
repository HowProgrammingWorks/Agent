'use strict';

const { spawn } = require('node:child_process');

const COPY_TOOLS = [
  { cmd: 'wl-copy', args: [] },
  { cmd: 'xclip', args: ['-selection', 'clipboard'] },
  { cmd: 'xsel', args: ['--clipboard', '--input'] },
  { cmd: 'pbcopy', args: [] },
];

const PASTE_TOOLS = [
  { cmd: 'wl-paste', args: ['-n'] },
  { cmd: 'xclip', args: ['-selection', 'clipboard', '-o'] },
  { cmd: 'xsel', args: ['--clipboard', '--output'] },
  { cmd: 'pbpaste', args: [] },
];

const TOOL_TIMEOUT_MS = 400;

const asText = (value) => {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return `${value}`;
};

const killQuiet = (child) => {
  try {
    child.kill('SIGKILL');
  } catch {
    // ignore
  }
};

const spawnAt = (tools, index, stdio) => {
  if (index >= tools.length) return null;
  const { cmd, args } = tools[index];
  try {
    return spawn(cmd, args, { stdio });
  } catch {
    return null;
  }
};

const copyText = (text) => {
  const source = asText(text);
  if (!source) return false;

  try {
    const b64 = Buffer.from(source, 'utf8').toString('base64');
    if (b64.length < 120_000) {
      process.stdout.write(`\x1b]52;c;${b64}\x07`);
    }
  } catch {
    // ignore OSC 52 failures
  }

  setImmediate(() => {
    const tryTool = (index) => {
      const child = spawnAt(COPY_TOOLS, index, ['pipe', 'ignore', 'ignore']);
      if (!child) {
        if (index + 1 < COPY_TOOLS.length) tryTool(index + 1);
        return;
      }
      let settled = false;
      let timer = null;
      const ac = new AbortController();
      const { signal } = ac;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        ac.abort();
        if (timer) clearTimeout(timer);
        if (!ok) tryTool(index + 1);
      };
      timer = setTimeout(() => {
        killQuiet(child);
        done(false);
      }, TOOL_TIMEOUT_MS);
      child.on('error', () => done(false), { signal });
      child.on('close', (code) => done(code === 0), { signal });
      try {
        child.stdin.end(source);
      } catch {
        done(false);
      }
    };
    tryTool(0);
  });

  return true;
};

const pasteText = () =>
  new Promise((resolve) => {
    let settled = false;
    const finish = (text) => {
      if (settled) return;
      settled = true;
      resolve(text);
    };
    const tryTool = (index) => {
      const child = spawnAt(PASTE_TOOLS, index, ['ignore', 'pipe', 'ignore']);
      if (!child) {
        if (index + 1 < PASTE_TOOLS.length) tryTool(index + 1);
        else finish('');
        return;
      }
      const chunks = [];
      const ac = new AbortController();
      const { signal } = ac;
      const timer = setTimeout(() => killQuiet(child), TOOL_TIMEOUT_MS);
      child.stdout.on(
        'data',
        (chunk) => {
          chunks.push(chunk);
        },
        { signal },
      );
      child.on(
        'error',
        () => {
          ac.abort();
          clearTimeout(timer);
          tryTool(index + 1);
        },
        { signal },
      );
      child.on(
        'close',
        (code) => {
          ac.abort();
          clearTimeout(timer);
          if (code === 0) {
            finish(Buffer.concat(chunks).toString('utf8'));
            return;
          }
          tryTool(index + 1);
        },
        { signal },
      );
    };
    tryTool(0);
  });

module.exports = { copyText, pasteText };
