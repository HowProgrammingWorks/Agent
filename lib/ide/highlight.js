'use strict';

const { colors } = require('../tui.js');

const JS_EXTS = ['js', 'cjs', 'mjs', 'ts', 'mts', 'cts', 'json'];
const MD_EXTS = ['md', 'markdown', 'mdx'];

const FENCE_LANG = {
  js: 'js',
  javascript: 'js',
  node: 'js',
  mjs: 'mjs',
  cjs: 'cjs',
  ts: 'ts',
  typescript: 'ts',
  mts: 'mts',
  cts: 'cts',
  json: 'json',
};

const FENCE_RE = /^(\s*)(`{3,}|~{3,})(.*)$/;
const HEADING_RE = /^(#{1,6})(\s+)(.*)$/;
const SETEXT_H1 = /^=+\s*$/;
const SETEXT_H2 = /^-{2,}\s*$/;
const HR_RE = /^(\s*)(\*{3,}|-{3,}|_{3,})\s*$/;
const UL_RE = /^(\s*)([-*+])(\s+)(.*)$/;
const OL_RE = /^(\s*)(\d+[.)])(\s+)(.*)$/;
const TASK_RE = /^(\[[ xX]\])(\s*)(.*)$/;
const QUOTE_RE = /^((?:>\s?)+)(.*)$/;
const TABLE_RE = /^\s*\|/;
const INLINE_RE =
  /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|!?\[[^\]]+\]\([^)]+\))/g;

const STORAGE = ['const', 'let', 'var', 'function'];

const KEYWORDS = [
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'from',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'null',
  'of',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'undefined',
  'void',
  'while',
  'with',
  'yield',
  'require',
  'module',
  'exports',
];

const { text, bright, faint, muted, green } = colors.foreground;
const { yellow, purple, cyan, orange, blue } = colors.foreground;

const isIdentStart = (ch) => {
  if (ch === '_' || ch === '$') return true;
  return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z');
};

const isIdentPart = (ch) => {
  if (isIdentStart(ch)) return true;
  return ch >= '0' && ch <= '9';
};

const readString = (line, start) => {
  const quote = line[start];
  let index = start + 1;
  while (index < line.length) {
    const ch = line[index];
    if (ch === '\\') {
      index += 2;
      continue;
    }
    if (ch === quote) {
      return { text: line.slice(start, index + 1), end: index + 1 };
    }
    index += 1;
  }
  return { text: line.slice(start), end: line.length };
};

const pushSpan = (spans, value, color) => {
  if (!value) return;
  const last = spans.at(-1);
  if (last && last.color === color) {
    last.text += value;
    return;
  }
  spans.push({ text: value, color });
};

const wordColor = (word) => {
  if (STORAGE.includes(word)) return cyan;
  if (KEYWORDS.includes(word)) return purple;
  return text;
};

const tokenizeJsLine = (line, inBlock) => {
  const spans = [];
  let index = 0;
  let block = inBlock;

  if (block) {
    const end = line.indexOf('*/');
    if (end < 0) {
      pushSpan(spans, line, faint);
      return { spans, inBlock: true };
    }
    pushSpan(spans, line.slice(0, end + 2), faint);
    index = end + 2;
    block = false;
  }

  while (index < line.length) {
    if (line.startsWith('//', index)) {
      pushSpan(spans, line.slice(index), faint);
      break;
    }
    if (line.startsWith('/*', index)) {
      const end = line.indexOf('*/', index + 2);
      if (end < 0) {
        pushSpan(spans, line.slice(index), faint);
        block = true;
        break;
      }
      pushSpan(spans, line.slice(index, end + 2), faint);
      index = end + 2;
      continue;
    }
    const ch = line[index];
    if (ch === '"' || ch === "'" || ch === '`') {
      const taken = readString(line, index);
      pushSpan(spans, taken.text, green);
      index = taken.end;
      continue;
    }
    if (isIdentStart(ch)) {
      let end = index + 1;
      while (end < line.length && isIdentPart(line[end])) end += 1;
      const word = line.slice(index, end);
      pushSpan(spans, word, wordColor(word));
      index = end;
      continue;
    }
    if (ch >= '0' && ch <= '9') {
      let end = index + 1;
      while (end < line.length && /[0-9_]/.test(line[end])) end += 1;
      pushSpan(spans, line.slice(index, end), yellow);
      index = end;
      continue;
    }
    pushSpan(spans, ch, text);
    index += 1;
  }

  if (spans.length === 0) pushSpan(spans, '', text);
  return { spans, inBlock: block };
};

const plainLine = (line) => [{ text: line, color: text }];

const headingColor = (level) => {
  if (level <= 1) return bright;
  if (level === 2) return cyan;
  return purple;
};

const fenceLangOf = (info) => {
  const lang = info.trim().split(/\s+/)[0].toLowerCase();
  const mapped = FENCE_LANG[lang] || lang;
  return JS_EXTS.includes(mapped) ? mapped : '';
};

const pushInline = (spans, raw, base = text) => {
  const source = raw ?? '';
  INLINE_RE.lastIndex = 0;
  let last = 0;
  let match = INLINE_RE.exec(source);
  while (match) {
    if (match.index > last) {
      pushSpan(spans, source.slice(last, match.index), base);
    }
    const token = match[0];
    if (token.startsWith('`')) {
      pushSpan(spans, '`', faint);
      pushSpan(spans, token.slice(1, -1), yellow);
      pushSpan(spans, '`', faint);
    } else if (token.startsWith('**') || token.startsWith('__')) {
      const mark = token.slice(0, 2);
      pushSpan(spans, mark, faint);
      pushSpan(spans, token.slice(2, -2), bright);
      pushSpan(spans, mark, faint);
    } else if (token.startsWith('[') || token.startsWith('![')) {
      const link = token.match(/^(!?)\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        pushSpan(spans, `${link[1]}[`, faint);
        pushSpan(spans, link[2], cyan);
        pushSpan(spans, '](', faint);
        pushSpan(spans, link[3], blue);
        pushSpan(spans, ')', faint);
      } else {
        pushSpan(spans, token, base);
      }
    } else {
      const mark = token[0];
      pushSpan(spans, mark, faint);
      pushSpan(spans, token.slice(1, -1), purple);
      pushSpan(spans, mark, faint);
    }
    last = match.index + token.length;
    match = INLINE_RE.exec(source);
  }
  if (last < source.length) {
    pushSpan(spans, source.slice(last), base);
  }
};

const tokenizeMdFenceOpen = (line, match) => {
  const spans = [];
  pushSpan(spans, match[1], faint);
  pushSpan(spans, match[2], muted);
  const info = match[3] ?? '';
  const lang = info.trim().split(/\s+/)[0];
  const rest = lang ? info.slice(info.indexOf(lang) + lang.length) : info;
  const lead = lang ? info.slice(0, info.indexOf(lang)) : info;
  pushSpan(spans, lead, faint);
  pushSpan(spans, lang, cyan);
  pushSpan(spans, rest, faint);
  if (spans.length === 0) pushSpan(spans, line, faint);
  return { spans, lang: fenceLangOf(info), mark: match[2] };
};

const tokenizeMdTable = (line) => {
  const spans = [];
  const parts = line.split('|');
  for (let index = 0; index < parts.length; index += 1) {
    if (index > 0) pushSpan(spans, '|', faint);
    const cell = parts[index];
    if (/^\s*:?-{2,}:?\s*$/.test(cell)) {
      pushSpan(spans, cell, faint);
    } else {
      pushInline(spans, cell);
    }
  }
  if (spans.length === 0) pushSpan(spans, line, text);
  return spans;
};

const tokenizeMdLine = (line, prev, next, fence) => {
  if (fence) {
    const close = line.match(FENCE_RE);
    const same = close && close[2][0] === fence.mark[0];
    const longEnough = close && close[2].length >= fence.mark.length;
    if (same && longEnough) {
      const opened = tokenizeMdFenceOpen(line, close);
      return { spans: opened.spans, fence: null, jsBlock: false };
    }
    if (fence.lang) {
      const result = tokenizeJsLine(line, fence.jsBlock);
      return {
        spans: result.spans,
        fence: { ...fence, jsBlock: result.inBlock },
      };
    }
    return { spans: [{ text: line, color: muted }], fence };
  }

  const open = line.match(FENCE_RE);
  if (open) {
    const opened = tokenizeMdFenceOpen(line, open);
    return {
      spans: opened.spans,
      fence: { mark: opened.mark, lang: opened.lang, jsBlock: false },
    };
  }

  if (line.trim().startsWith('<!--')) {
    const spans = [];
    pushSpan(spans, line, faint);
    return { spans, fence: null };
  }

  const heading = line.match(HEADING_RE);
  if (heading) {
    const spans = [];
    const color = headingColor(heading[1].length);
    pushSpan(spans, heading[1], orange);
    pushSpan(spans, heading[2], color);
    pushInline(spans, heading[3], color);
    return { spans, fence: null };
  }

  const setextNext =
    next &&
    line.trim() &&
    (SETEXT_H1.test(next) || SETEXT_H2.test(next)) &&
    !HEADING_RE.test(line) &&
    !FENCE_RE.test(line);
  if (setextNext) {
    const spans = [];
    const color = SETEXT_H1.test(next) ? headingColor(1) : headingColor(2);
    pushInline(spans, line, color);
    return { spans, fence: null };
  }

  const setextHere =
    prev &&
    prev.trim() &&
    !HEADING_RE.test(prev) &&
    (SETEXT_H1.test(line) || SETEXT_H2.test(line));
  if (setextHere) {
    const color = SETEXT_H1.test(line) ? headingColor(1) : headingColor(2);
    return { spans: [{ text: line, color }], fence: null };
  }

  if (HR_RE.test(line)) {
    return { spans: [{ text: line, color: faint }], fence: null };
  }

  const quote = line.match(QUOTE_RE);
  if (quote) {
    const spans = [];
    pushSpan(spans, quote[1], green);
    pushInline(spans, quote[2]);
    return { spans, fence: null };
  }

  const ul = line.match(UL_RE);
  if (ul) {
    const spans = [];
    pushSpan(spans, ul[1], text);
    pushSpan(spans, ul[2], cyan);
    pushSpan(spans, ul[3], text);
    const task = ul[4].match(TASK_RE);
    if (task) {
      const done = /[xX]/.test(task[1]);
      pushSpan(spans, task[1], done ? green : muted);
      pushSpan(spans, task[2], text);
      pushInline(spans, task[3]);
    } else {
      pushInline(spans, ul[4]);
    }
    return { spans, fence: null };
  }

  const ol = line.match(OL_RE);
  if (ol) {
    const spans = [];
    pushSpan(spans, ol[1], text);
    pushSpan(spans, ol[2], cyan);
    pushSpan(spans, ol[3], text);
    pushInline(spans, ol[4]);
    return { spans, fence: null };
  }

  if (TABLE_RE.test(line)) {
    return { spans: tokenizeMdTable(line), fence: null };
  }

  const spans = [];
  pushInline(spans, line);
  if (spans.length === 0) pushSpan(spans, '', text);
  return { spans, fence: null };
};

const highlightJs = (lines) => {
  let inBlock = false;
  return lines.map((line) => {
    const result = tokenizeJsLine(line, inBlock);
    inBlock = result.inBlock;
    return result.spans;
  });
};

const highlightMd = (lines) => {
  let fence = null;
  return lines.map((line, index) => {
    const prev = index > 0 ? lines[index - 1] : '';
    const next = lines[index + 1];
    const result = tokenizeMdLine(line, prev, next, fence);
    fence = result.fence;
    if (result.spans.length === 0) return plainLine(line);
    return result.spans;
  });
};

const highlightSource = (source, ext) => {
  const lines = source.split('\n');
  if (lines.length === 0) return [plainLine('')];
  const kind = (ext || '').toLowerCase();
  if (JS_EXTS.includes(kind)) return highlightJs(lines);
  if (MD_EXTS.includes(kind)) return highlightMd(lines);
  return lines.map(plainLine);
};

module.exports = { highlightSource };
