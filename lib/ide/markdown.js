'use strict';

const { colors, clip, textWidth } = require('../tui.js');
const { highlightSource } = require('./highlight.js');

const FENCE_RE = /^(`{3,}|~{3,})\s*(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.+)$/;
const HR_RE = /^(\*{3,}|-{3,}|_{3,})\s*$/;
const UL_RE = /^(\s*)([-*+])\s+(.+)$/;
const OL_RE = /^(\s*)(\d+)[.)]\s+(.+)$/;
const QUOTE_RE = /^>\s?(.*)$/;
const TABLE_RE = /^\s*\|/;

const { text, bright, muted, faint, cyan, yellow, green } = colors.foreground;
const { selected, input, code } = colors.background;

const INLINE_RE =
  /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/g;

const plainText = (spans) => {
  let out = '';
  for (const span of spans) out += span.text;
  return out;
};

const lineOf = (spans, fill) => ({
  text: plainText(spans),
  spans,
  fill,
  tone: 'text',
});

const styleInline = (raw) => {
  const source = raw ?? '';
  const spans = [];
  INLINE_RE.lastIndex = 0;
  let last = 0;
  let match = INLINE_RE.exec(source);
  while (match) {
    if (match.index > last) {
      spans.push({ text: source.slice(last, match.index), color: text });
    }
    const token = match[0];
    if (token.startsWith('`')) {
      spans.push({ text: token.slice(1, -1), color: yellow });
    } else if (token.startsWith('**') || token.startsWith('__')) {
      spans.push({ text: token.slice(2, -2), color: bright });
    } else if (token.startsWith('[')) {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const label = link ? link[1] : token;
      spans.push({ text: label, color: cyan });
    } else {
      spans.push({ text: token.slice(1, -1), color: muted });
    }
    last = match.index + token.length;
    match = INLINE_RE.exec(source);
  }
  if (last < source.length) {
    spans.push({ text: source.slice(last), color: text });
  }
  if (spans.length === 0) spans.push({ text: source, color: text });
  return spans;
};

const wrapSpans = (spans, width) => {
  if (width <= 0) return [spans];
  const lines = [];
  let row = [];
  let used = 0;
  const flush = () => {
    lines.push(row);
    row = [];
    used = 0;
  };
  for (const span of spans) {
    let rest = span.text;
    const color = span.color;
    const bg = span.bg;
    while (rest.length > 0) {
      const room = width - used;
      if (room <= 0) {
        flush();
        continue;
      }
      if (rest.length <= room) {
        row.push({ text: rest, color, bg });
        used += rest.length;
        break;
      }
      const window = rest.slice(0, room);
      let breakAt = window.lastIndexOf(' ');
      if (breakAt <= 0) breakAt = room;
      const piece = rest.slice(0, breakAt).trimEnd();
      if (piece) row.push({ text: piece, color, bg });
      flush();
      rest = rest.slice(breakAt).trimStart();
    }
  }
  if (row.length > 0) lines.push(row);
  if (lines.length === 0) lines.push([{ text: '', color: text }]);
  return lines;
};

const clipSpans = (spans, width) => {
  const out = [];
  let used = 0;
  for (const span of spans) {
    if (used >= width) break;
    const room = width - used;
    const value = clip(span.text, room);
    if (!value) continue;
    out.push({ text: value, color: span.color, bg: span.bg });
    used += textWidth(value);
  }
  return out;
};

const isBreak = (raw) => {
  const line = raw ?? '';
  if (line.trim() === '') return true;
  if (FENCE_RE.test(line)) return true;
  if (HR_RE.test(line.trim())) return true;
  if (HEADING_RE.test(line)) return true;
  if (QUOTE_RE.test(line)) return true;
  if (UL_RE.test(line)) return true;
  if (OL_RE.test(line)) return true;
  if (TABLE_RE.test(line)) return true;
  return false;
};

const takeQuote = (rows, start) => {
  const texts = [];
  let index = start;
  while (index < rows.length) {
    const match = rows[index].match(QUOTE_RE);
    if (!match) break;
    texts.push(match[1]);
    index += 1;
  }
  return { texts, next: index };
};

const takeParagraph = (rows, start) => {
  const parts = [];
  let index = start;
  while (index < rows.length) {
    const line = rows[index];
    if (isBreak(line)) break;
    parts.push(line.trim());
    index += 1;
  }
  const joined = parts.filter(Boolean).join(' ');
  return { joined, next: index };
};

const pushWrapped = (out, spans, width, fill) => {
  const rows = wrapSpans(spans, width);
  for (const row of rows) out.push(lineOf(row, fill));
};

const pushFence = (out, body, lang, width) => {
  const highlighted = highlightSource(body, lang.toLowerCase());
  for (const spans of highlighted) {
    const tinted = [];
    for (const span of spans) {
      tinted.push({ text: span.text, color: span.color, bg: code });
    }
    const clipped = clipSpans(tinted, width);
    if (clipped.length === 0) {
      clipped.push({ text: ' ', color: faint, bg: code });
    }
    out.push(lineOf(clipped, code));
  }
};

const renderMarkdown = (source, width) => {
  const rows = (source ?? '').replaceAll('\r\n', '\n').split('\n');
  const out = [];
  let index = 0;
  let inFence = false;
  let fenceMark = '';
  let fenceLang = '';
  let fenceBody = [];

  const closeFence = () => {
    const body = fenceBody.join('\n');
    pushFence(out, body, fenceLang, width);
    inFence = false;
    fenceMark = '';
    fenceLang = '';
    fenceBody = [];
  };

  while (index < rows.length) {
    const raw = rows[index];
    if (inFence) {
      const close = raw.match(FENCE_RE);
      const same = close && close[1][0] === fenceMark[0];
      const longEnough = close && close[1].length >= fenceMark.length;
      if (same && longEnough) {
        closeFence();
        index += 1;
        continue;
      }
      fenceBody.push(raw);
      index += 1;
      continue;
    }

    const fence = raw.match(FENCE_RE);
    if (fence) {
      inFence = true;
      fenceMark = fence[1];
      fenceLang = (fence[2] || '').trim().split(/\s+/)[0] || '';
      fenceBody = [];
      index += 1;
      continue;
    }

    if (HR_RE.test(raw.trim())) {
      const rule = '─'.repeat(Math.max(1, width));
      out.push(lineOf([{ text: rule, color: faint }]));
      index += 1;
      continue;
    }

    const heading = raw.match(HEADING_RE);
    if (heading) {
      const level = heading[1].length;
      let color = bright;
      let fill = selected;
      if (level >= 3) {
        color = cyan;
        fill = input;
      } else if (level === 2) {
        fill = input;
      }
      const spans = [{ text: heading[2].trim(), color }];
      pushWrapped(out, spans, width, fill);
      index += 1;
      continue;
    }

    const quote = raw.match(QUOTE_RE);
    if (quote) {
      const taken = takeQuote(rows, index);
      const mark = [{ text: '│ ', color: green }];
      for (const line of taken.texts) {
        const inner = Math.max(1, width - 2);
        const wrapped = wrapSpans(styleInline(line), inner);
        for (const row of wrapped) {
          out.push(lineOf([...mark, ...row]));
        }
      }
      index = taken.next;
      continue;
    }

    const ul = raw.match(UL_RE);
    if (ul) {
      const pad = ul[1];
      const bullet = [{ text: `${pad}• `, color: cyan }];
      const hang = [{ text: `${pad}  `, color: text }];
      const inner = Math.max(1, width - pad.length - 2);
      const wrapped = wrapSpans(styleInline(ul[3]), inner);
      for (let row = 0; row < wrapped.length; row += 1) {
        const lead = row === 0 ? bullet : hang;
        out.push(lineOf([...lead, ...wrapped[row]]));
      }
      index += 1;
      continue;
    }

    const ol = raw.match(OL_RE);
    if (ol) {
      const pad = ol[1];
      const num = `${ol[2]}. `;
      const bullet = [{ text: `${pad}${num}`, color: cyan }];
      const hang = [{ text: `${pad}${' '.repeat(num.length)}`, color: text }];
      const inner = Math.max(1, width - pad.length - num.length);
      const wrapped = wrapSpans(styleInline(ol[3]), inner);
      for (let row = 0; row < wrapped.length; row += 1) {
        const lead = row === 0 ? bullet : hang;
        out.push(lineOf([...lead, ...wrapped[row]]));
      }
      index += 1;
      continue;
    }

    if (TABLE_RE.test(raw)) {
      const clipped = clip(raw.trim(), width);
      out.push(lineOf([{ text: clipped, color: muted }]));
      index += 1;
      continue;
    }

    if (raw.trim() === '') {
      out.push(lineOf([{ text: '', color: text }]));
      index += 1;
      continue;
    }

    const para = takeParagraph(rows, index);
    index = para.next;
    if (para.joined) {
      pushWrapped(out, styleInline(para.joined), width);
    }
  }

  if (inFence) closeFence();
  if (out.length === 0) out.push(lineOf([{ text: '', color: text }]));
  return out;
};

module.exports = { renderMarkdown };
