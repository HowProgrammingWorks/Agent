'use strict';

const { exec } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');

const { clamp, stripAnsi } = require('../tui.js');
const { Input } = require('./input.js');

const execAsync = promisify(exec);
const MAX_LINES = 500;
const MAX_OUTPUT_CHARS = 50_000;
const COMMAND_TIMEOUT_MS = 30_000;
const MAX_BUFFER = 1024 * 1024;

const TONES = {
  text: 'terminal',
  muted: 'terminalMuted',
  accent: 'terminalAccent',
  ok: 'terminalSuccess',
  warn: 'terminalWarning',
  error: 'terminalError',
};

class Terminal {
  constructor(cwd) {
    this.root = cwd;
    this.cwd = cwd;
    this.lines = [];
    this.input = new Input();
    this.offset = 0;
    this.busy = false;
    this.history = [];
    this.historyIndex = -1;
    this.draft = '';
  }

  echo(text, tone = 'accent') {
    this.append(text, tone);
  }

  append(text, tone = 'text') {
    const clean = stripAnsi(text);
    const chunks = clean.split('\n');
    for (const chunk of chunks) {
      this.lines.push({ text: chunk, tone });
    }
    const extra = this.lines.length - MAX_LINES;
    if (extra > 0) this.lines.splice(0, extra);
    this.offset = 0;
  }

  appendOutput(text, tone = 'text') {
    const clean = stripAnsi(text);
    const clipped =
      clean.length > MAX_OUTPUT_CHARS
        ? `${clean.slice(0, MAX_OUTPUT_CHARS)}\n...[truncated]`
        : clean;
    this.append(clipped, tone);
  }

  recall(delta) {
    if (this.history.length === 0) return;
    if (this.historyIndex < 0) this.draft = this.input.value;
    const next = this.historyIndex + delta;
    if (next < 0) {
      this.historyIndex = -1;
      this.input.value = this.draft;
      this.input.cursor = this.draft.length;
      return;
    }
    this.historyIndex = Math.min(next, this.history.length - 1);
    const item = this.history[this.history.length - 1 - this.historyIndex];
    this.input.value = item;
    this.input.cursor = item.length;
  }

  async tryCd(command) {
    const trimmed = command.trim();
    if (trimmed !== 'cd' && !trimmed.startsWith('cd ')) return false;
    const target = trimmed === 'cd' ? this.root : trimmed.slice(3).trim();
    const next = path.resolve(this.cwd, target || this.root);
    try {
      const stat = await fs.stat(next);
      if (!stat.isDirectory()) {
        this.append('cd: not a directory', 'error');
        return true;
      }
      this.cwd = next;
      this.append(this.cwd, 'muted');
    } catch {
      this.append('cd: no such directory', 'error');
    }
    return true;
  }

  async run(command) {
    const trimmed = command.trim();
    if (!trimmed || this.busy) return;
    this.history.push(trimmed);
    this.historyIndex = -1;
    this.draft = '';
    this.input.clear();
    this.append(`$ ${trimmed}`, 'accent');
    if (await this.tryCd(trimmed)) return;
    this.busy = true;
    try {
      const { stdout = '', stderr = '' } = await execAsync(trimmed, {
        cwd: this.cwd,
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
      });
      if (stdout) this.appendOutput(stdout, 'text');
      if (stderr) this.appendOutput(stderr, 'warn');
    } catch (error) {
      if (error?.killed && error?.signal === 'SIGTERM') {
        this.append('command timed out', 'error');
      } else {
        if (error?.stdout) this.appendOutput(error.stdout, 'text');
        if (error?.stderr) this.appendOutput(error.stderr, 'warn');
        if (!error?.stdout && !error?.stderr) {
          this.append(error.message, 'error');
        }
      }
    }
    this.busy = false;
    this.offset = 0;
  }

  move(delta, viewHeight) {
    const maxOffset = Math.max(0, this.lines.length - viewHeight);
    this.offset = clamp(this.offset + delta, 0, maxOffset);
  }

  ensureVisible(viewHeight) {
    const maxOffset = Math.max(0, this.lines.length - viewHeight);
    this.offset = clamp(this.offset, 0, maxOffset);
  }
}

module.exports = { Terminal, TONES };
