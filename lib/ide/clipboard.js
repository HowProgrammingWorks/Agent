'use strict';

const { spawn } = require('node:child_process');

const COPY_TOOLS = [
  ['wl-copy', []],
  ['xclip', ['-selection', 'clipboard']],
  ['xsel', ['--clipboard', '--input']],
  ['pbcopy', []],
];

const PASTE_TOOLS = [
  ['wl-paste', ['-n']],
  ['xclip', ['-selection', 'clipboard', '-o']],
  ['xsel', ['--clipboard', '--output']],
  ['pbpaste', []],
];

const asText = (value) => {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return `${value}`;
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
      if (index >= COPY_TOOLS.length) return;
      const pair = COPY_TOOLS[index];
      const cmd = pair[0];
      const args = pair[1];
      let child;
      try {
        child = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'ignore'] });
      } catch {
        tryTool(index + 1);
        return;
      }
      let settled = false;
      let timer = null;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (!ok) tryTool(index + 1);
      };
      timer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
        done(false);
      }, 400);
      child.on('error', () => done(false));
      child.on('close', (code) => done(code === 0));
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
      if (settled) {
        return;
      }
      settled = true;
      resolve(text);
    };
    const tryTool = (index) => {
      if (index >= PASTE_TOOLS.length) {
        finish('');
        return;
      }
      const pair = PASTE_TOOLS[index];
      const cmd = pair[0];
      const args = pair[1];
      let child;
      try {
        child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'] });
      } catch {
        tryTool(index + 1);
        return;
      }
      const chunks = [];
      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
      }, 400);
      child.stdout.on('data', (chunk) => {
        chunks.push(chunk);
      });
      child.on('error', () => {
        clearTimeout(timer);
        tryTool(index + 1);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          finish(Buffer.concat(chunks).toString('utf8'));
          return;
        }
        tryTool(index + 1);
      });
    };
    tryTool(0);
  });

module.exports = { copyText, pasteText };
