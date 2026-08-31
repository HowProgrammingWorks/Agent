'use strict';

const { clamp, wrapText } = require('./tui.js');
const { Input } = require('./input.js');
const { renderMarkdown } = require('./markdown.js');

const MAX_ITEMS = 200;
const PREVIEW_CHARS = 240;

const TONES = {
  text: 'agent',
  muted: 'agentMuted',
  faint: 'agentFaint',
  accent: 'agentAccent',
  ok: 'agentSuccess',
  warn: 'agentWarning',
  error: 'agentError',
};

const TOOL_TONE = { ok: 'ok', denied: 'warn' };

const formatTime = () => {
  const now = new Date();
  const hh = `${now.getHours()}`.padStart(2, '0');
  const mm = `${now.getMinutes()}`.padStart(2, '0');
  return `${hh}:${mm}`;
};

const toolLabel = (name, args, argsText) => {
  if (typeof args?.path === 'string' && args.path) {
    return `${name} ${args.path}`;
  }
  if (typeof args?.command === 'string' && args.command) {
    return `${name} ${args.command}`;
  }
  if (argsText) return `${name} ${argsText}`;
  return name;
};

const clipPreview = (text) => {
  const clean = (text ?? '').replaceAll('\n', ' ').trim();
  if (clean.length <= PREVIEW_CHARS) return clean;
  return `${clean.slice(0, PREVIEW_CHARS - 1)}…`;
};

class Chat {
  constructor() {
    this.items = [];
    this.input = new Input();
    this.offset = 0;
    this.lineCount = 0;
  }

  trim() {
    const extra = this.items.length - MAX_ITEMS;
    if (extra > 0) this.items.splice(0, extra);
  }

  push(item) {
    this.items.push(item);
    this.trim();
    this.offset = 0;
  }

  addUser(text) {
    this.push({ kind: 'head', text: `You  ${formatTime()}`, tone: 'accent' });
    this.push({ kind: 'body', text, tone: 'text' });
  }

  addAgent(text) {
    this.push({ kind: 'head', text: `Agent  ${formatTime()}`, tone: 'accent' });
    this.push({ kind: 'body', text, tone: 'text', format: 'md' });
  }

  addStep({ step, maxSteps, model }) {
    const label = `step ${step}/${maxSteps}  ${model}`;
    this.push({ kind: 'step', text: label, tone: 'faint' });
  }

  addPrune({ pruned }) {
    const noun = pruned === 1 ? 'result' : 'results';
    const label = `pruned ${pruned} older tool ${noun}`;
    this.push({ kind: 'step', text: label, tone: 'faint' });
  }

  addTool(name, args, argsText) {
    const label = toolLabel(name, args, argsText);
    this.push({
      kind: 'tool',
      name,
      running: true,
      text: `○ ${label}`,
      tone: 'warn',
    });
  }

  finishTool(status, name, args, preview) {
    const label = toolLabel(name, args, '');
    const last = this.items.findLast((item) => item.running);
    const mark = status === 'ok' ? '✓' : '✗';
    const tone = TOOL_TONE[status] ?? 'error';
    if (last) {
      last.running = false;
      last.text = `${mark} ${label}`;
      last.tone = tone;
    }
    if (status !== 'ok') {
      const detail = clipPreview(preview);
      if (detail) this.push({ kind: 'note', text: detail, tone });
    }
  }

  addNote(text, tone = 'warn') {
    this.push({ kind: 'note', text, tone });
  }

  wrapLines(width) {
    const lines = [];
    for (const item of this.items) {
      if (item.format === 'md') {
        const rendered = renderMarkdown(item.text, width);
        for (const line of rendered) lines.push(line);
      } else {
        const wrapped = wrapText(item.text, width);
        for (const text of wrapped) {
          lines.push({ text, tone: item.tone });
        }
      }
      if (item.kind !== 'step') lines.push({ text: '', tone: 'text' });
    }
    return lines;
  }

  move(delta) {
    const maxOffset = Math.max(0, this.lineCount);
    this.offset = clamp(this.offset + delta, 0, maxOffset);
  }

  setLineCount(count) {
    this.lineCount = count;
    const maxOffset = Math.max(0, count);
    this.offset = clamp(this.offset, 0, maxOffset);
  }
}

module.exports = { Chat, TONES };
