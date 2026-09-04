'use strict';

const fs = require('node:fs');

const ESC = '\x1b[';
const RESET = `${ESC}0m`;
const HIDE_CURSOR = `${ESC}?25l`;
const SHOW_CURSOR = `${ESC}?25h`;
const CURSOR_BLOCK_BLINK = '\x1b[1 q';
const CURSOR_RESET = '\x1b[0 q';
const CURSOR_BLINK_ON = `${ESC}?12h`;
const CURSOR_BLINK_OFF = `${ESC}?12l`;
const CURSOR_WHITE = '\x1b]12;#ffffff\x07';
const CURSOR_COLOR_RESET = '\x1b]112\x07';
const ENTER_ALT = `${ESC}?1049h`;
const LEAVE_ALT = `${ESC}?1049l`;
const MOUSE_ON = `${ESC}?1000h${ESC}?1002h${ESC}?1006h`;
const MOUSE_OFF = `${ESC}?1000l${ESC}?1002l${ESC}?1006l`;
const MODIFY_KEYS_ON = `${ESC}>4;2m`;
const MODIFY_KEYS_OFF = `${ESC}>4;0m`;
const SYNC_START = `${ESC}?2026h`;
const SYNC_END = `${ESC}?2026l`;
const WRAP_OFF = `${ESC}?7l`;
const WRAP_ON = `${ESC}?7h`;
const PANEL_PAD = 2;

const MIN_COLS = 120;
const MIN_ROWS = 32;

const ESC_CHAR = String.fromCharCode(27);
const ANSI_RE = new RegExp(`${ESC_CHAR}\\[[0-9;]*m`, 'g');

const rgbFg = (r, g, b) => `${ESC}38;2;${r};${g};${b}m`;
const rgbBg = (r, g, b) => `${ESC}48;2;${r};${g};${b}m`;
const moveTo = (x, y) => `${ESC}${y + 1};${x + 1}H`;

const colors = {
  background: {
    top: rgbBg(10, 12, 15),
    tree: rgbBg(20, 24, 29),
    code: rgbBg(16, 20, 26),
    codeTitle: rgbBg(36, 44, 56),
    terminal: rgbBg(10, 12, 16),
    agent: rgbBg(28, 34, 42),
    selected: rgbBg(42, 52, 64),
    input: rgbBg(38, 46, 56),
    header: rgbBg(0, 0, 0),
    sel: rgbBg(55, 55, 60),
    badgeYellow: rgbBg(221, 190, 82),
    badgeBlue: rgbBg(88, 166, 255),
    badgePurple: rgbBg(191, 140, 220),
    badgeOrange: rgbBg(220, 150, 82),
    badgeMagenta: rgbBg(201, 120, 180),
    badgeCyan: rgbBg(86, 196, 214),
    scroll: rgbBg(36, 42, 52),
    scrollTrack: rgbBg(14, 17, 21),
    cursorIdle: rgbBg(64, 70, 80),
  },
  foreground: {
    text: rgbFg(205, 211, 220),
    bright: rgbFg(235, 239, 244),
    muted: rgbFg(112, 121, 132),
    faint: rgbFg(78, 87, 97),
    cyan: rgbFg(86, 196, 214),
    green: rgbFg(112, 201, 117),
    yellow: rgbFg(221, 190, 82),
    orange: rgbFg(220, 150, 82),
    purple: rgbFg(191, 140, 220),
    red: rgbFg(224, 105, 105),
    header: rgbFg(255, 255, 255),
    sel: rgbFg(220, 220, 225),
    blue: rgbFg(88, 166, 255),
    black: rgbFg(10, 12, 15),
  },
};

const style = (background, foreground) => (value) =>
  `${background}${foreground}${value}${RESET}`;

const styles = {
  top: style(colors.background.top, colors.foreground.text),
  topMuted: style(colors.background.top, colors.foreground.muted),
  topAccent: style(colors.background.top, colors.foreground.cyan),
  tree: style(colors.background.tree, colors.foreground.text),
  treeMuted: style(colors.background.tree, colors.foreground.muted),
  treeFaint: style(colors.background.tree, colors.foreground.faint),
  treeAccent: style(colors.background.tree, colors.foreground.cyan),
  selected: style(colors.background.selected, colors.foreground.bright),
  code: style(colors.background.code, colors.foreground.text),
  codeTitle: style(colors.background.codeTitle, colors.foreground.bright),
  codeMuted: style(colors.background.code, colors.foreground.muted),
  codeFaint: style(colors.background.code, colors.foreground.faint),
  terminal: style(colors.background.terminal, colors.foreground.text),
  terminalMuted: style(colors.background.terminal, colors.foreground.muted),
  terminalAccent: style(colors.background.terminal, colors.foreground.cyan),
  terminalSuccess: style(colors.background.terminal, colors.foreground.green),
  terminalWarning: style(colors.background.terminal, colors.foreground.yellow),
  terminalError: style(colors.background.terminal, colors.foreground.red),
  agent: style(colors.background.agent, colors.foreground.text),
  agentMuted: style(colors.background.agent, colors.foreground.muted),
  agentFaint: style(colors.background.agent, colors.foreground.faint),
  agentAccent: style(colors.background.agent, colors.foreground.cyan),
  agentSuccess: style(colors.background.agent, colors.foreground.green),
  agentWarning: style(colors.background.agent, colors.foreground.yellow),
  agentError: style(colors.background.agent, colors.foreground.red),
  input: style(colors.background.input, colors.foreground.text),
  inputMuted: style(colors.background.input, colors.foreground.muted),
  header: style(colors.background.header, colors.foreground.header),
  headerMuted: style(colors.background.header, colors.foreground.muted),
  headerOk: style(colors.background.header, colors.foreground.green),
  headerWait: style(colors.background.header, colors.foreground.yellow),
  headerClose: style(colors.background.header, colors.foreground.red),
  scrollThumb: style(colors.background.scroll, colors.foreground.bright),
  cursorIdle: style(colors.background.cursorIdle, colors.foreground.bright),
};

const FG = {
  text: colors.foreground.text,
  bright: colors.foreground.bright,
  muted: colors.foreground.muted,
  faint: colors.foreground.faint,
  cyan: colors.foreground.cyan,
  green: colors.foreground.green,
  yellow: colors.foreground.yellow,
  red: colors.foreground.red,
  purple: colors.foreground.purple,
  orange: colors.foreground.orange,
  blue: colors.foreground.blue,
};

const GRAPHEME = new Intl.Segmenter('en', { granularity: 'grapheme' });

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const isZeroWidth = (cp) => {
  if (cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f)) return true;
  if (cp >= 0x300 && cp <= 0x36f) return true;
  if (cp >= 0xfe00 && cp <= 0xfe0f) return true;
  if (cp >= 0xe0100 && cp <= 0xe01ef) return true;
  if (cp === 0x200b || cp === 0x200c || cp === 0x200d) return true;
  if (cp === 0x2060 || cp === 0xfeff) return true;
  return false;
};

const isWide = (cp) => {
  if (cp < 0x1100) return false;
  return (
    cp <= 0x115f ||
    cp === 0x2329 ||
    cp === 0x232a ||
    (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe19) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f000 && cp <= 0x1ffff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
};

const graphemeWidth = (g) => {
  if (!g) return 0;
  if (g.includes('\uFE0F')) return 2;
  if (/\p{Extended_Pictographic}/u.test(g)) return 2;
  if (/\p{Emoji_Presentation}/u.test(g)) return 2;
  let width = 0;
  for (const ch of g) {
    const cp = ch.codePointAt(0);
    if (isZeroWidth(cp)) continue;
    width += isWide(cp) ? 2 : 1;
  }
  return width;
};

const graphemesOf = (value) => {
  const out = [];
  for (const { segment } of GRAPHEME.segment(`${value ?? ''}`)) {
    if (segment === '\uFE0F' || segment === '\uFE0E') {
      const prev = out[out.length - 1];
      if (!prev) continue;
      prev.g += segment;
      if (segment === '\uFE0F') prev.w = 2;
      continue;
    }
    const prev = out[out.length - 1];
    const padAfterEmoji = segment === ' ' && prev && prev.g.includes('\uFE0F');
    if (padAfterEmoji) continue;
    out.push({ g: segment, w: graphemeWidth(segment) });
  }
  return out;
};

const textWidth = (value) => {
  let width = 0;
  for (const { w } of graphemesOf(value)) width += w;
  return width;
};

const sliceWidth = (value, width) => {
  if (width <= 0) return '';
  let out = '';
  let used = 0;
  for (const { g, w } of graphemesOf(value)) {
    if (w > 0 && used + w > width) break;
    out += g;
    used += w;
  }
  return out;
};

const sliceFromWidth = (value, start, len) => {
  if (len <= 0) return '';
  let col = 0;
  let out = '';
  let used = 0;
  for (const { g, w } of graphemesOf(value)) {
    if (w <= 0) {
      if (col >= start && used < len) out += g;
      continue;
    }
    const next = col + w;
    if (next <= start) {
      col = next;
      continue;
    }
    if (used + w > len) break;
    out += g;
    used += w;
    col = next;
    if (used >= len) break;
  }
  return out;
};

const firstGrapheme = (value) => {
  const text = `${value ?? ''}`;
  const segments = GRAPHEME.segment(text);
  const iterator = segments[Symbol.iterator]();
  const next = iterator.next();
  if (next.done) return '';
  return next.value.segment;
};

const repeat = (char, count) => char.repeat(Math.max(0, count));

const clip = (value, width) => {
  if (width <= 0) return '';
  const text = `${value ?? ''}`;
  if (textWidth(text) <= width) return text;
  if (width === 1) return '…';
  return `${sliceWidth(text, width - 1)}…`;
};

const pad = (value, width) => {
  const clipped = clip(value, width);
  return `${clipped}${repeat(' ', width - textWidth(clipped))}`;
};

const stripAnsi = (value) => {
  const text = typeof value === 'string' ? value : `${value ?? ''}`;
  return text.replace(ANSI_RE, '');
};

const DEFAULT_BG = colors.background.header;

let grid = [];
let screenCols = 0;
let screenRows = 0;
let cuts = [];
let painting = false;
let displayActive = false;

const emptyCell = () => ({
  g: ' ',
  w: 1,
  bg: DEFAULT_BG,
  fg: '',
  bold: false,
});

const resetCell = (cell) => {
  cell.g = ' ';
  cell.w = 1;
  cell.bg = DEFAULT_BG;
  cell.fg = '';
  cell.bold = false;
};

const ensureGrid = (cols, rows) => {
  if (cols === screenCols && rows === screenRows) return;
  screenCols = cols;
  screenRows = rows;
  grid = new Array(rows);
  for (let y = 0; y < rows; y += 1) {
    const row = new Array(cols);
    for (let x = 0; x < cols; x += 1) row[x] = emptyCell();
    grid[y] = row;
  }
  cuts = Array.from({ length: rows }, () => []);
};

const clearCuts = () => {
  for (let y = 0; y < screenRows; y += 1) cuts[y].length = 0;
};

const markCut = (x, y) => {
  if (y < 0 || y >= screenRows) return;
  const col = Math.max(0, x);
  cuts[y].push(col);
};

const rowCuts = (y, cols) => {
  const seen = new Set([0, cols]);
  for (const x of cuts[y]) {
    if (x > 0 && x < cols) seen.add(x);
  }
  const list = [...seen];
  list.sort((a, b) => a - b);
  return list;
};

const clearGrid = () => {
  for (let y = 0; y < screenRows; y += 1) {
    const row = grid[y];
    for (let x = 0; x < screenCols; x += 1) resetCell(row[x]);
  }
  clearCuts();
};

const putGlyph = (x, y, g, w, bg, fg, bold) => {
  if (w <= 0) return 0;
  if (y < 0 || y >= screenRows) return w;
  if (x < 0) return w;
  if (x >= screenCols) return w;
  const row = grid[y];
  let width = w;
  let glyph = g;
  if (glyph.includes('\uFE0F') && width < 2) width = 2;
  if (width > 1 && x + width > screenCols) {
    width = 1;
    glyph = ' ';
  }
  const cur = row[x];
  if (cur.w === 0 && x > 0 && row[x - 1].w === 2) {
    resetCell(row[x - 1]);
    resetCell(cur);
  }
  if (cur.w === 2 && x + 1 < screenCols) resetCell(row[x + 1]);
  if (width === 2 && x + 1 < screenCols) {
    const next = row[x + 1];
    if (next.w === 2 && x + 2 < screenCols) resetCell(row[x + 2]);
  }
  cur.g = glyph;
  cur.w = width;
  cur.bg = bg || DEFAULT_BG;
  cur.fg = fg;
  cur.bold = bold;
  if (width === 2) {
    const tail = row[x + 1];
    tail.g = '';
    tail.w = 0;
    tail.bg = cur.bg;
    tail.fg = fg;
    tail.bold = bold;
  }
  return width;
};

const applySgr = (params, state) => {
  if (params === '' || params === '0') {
    state.bg = '';
    state.fg = '';
    state.bold = false;
    return;
  }
  const parts = params.split(';');
  let index = 0;
  while (index < parts.length) {
    const code = Number(parts[index]);
    if (code === 0) {
      state.bg = '';
      state.fg = '';
      state.bold = false;
      index += 1;
      continue;
    }
    if (code === 1) {
      state.bold = true;
      index += 1;
      continue;
    }
    if (code === 22) {
      state.bold = false;
      index += 1;
      continue;
    }
    const isFg = code === 38;
    const isBg = code === 48;
    const rgb = Number(parts[index + 1]) === 2;
    if ((isFg || isBg) && rgb && index + 4 < parts.length) {
      const red = Number(parts[index + 2]);
      const green = Number(parts[index + 3]);
      const blue = Number(parts[index + 4]);
      if (isFg) state.fg = rgbFg(red, green, blue);
      else state.bg = rgbBg(red, green, blue);
      index += 5;
      continue;
    }
    index += 1;
  }
};

const plotAnsi = (x, y, value) => {
  const text = typeof value === 'string' ? value : `${value ?? ''}`;
  const state = { bg: '', fg: '', bold: false };
  let col = x;
  let index = 0;
  while (index < text.length) {
    const isCsi = text.charCodeAt(index) === 0x1b && text[index + 1] === '[';
    if (isCsi) {
      const end = text.indexOf('m', index + 2);
      if (end === -1) break;
      applySgr(text.slice(index + 2, end), state);
      index = end + 1;
      continue;
    }
    const escAt = text.indexOf('\x1b', index);
    const limit = escAt === -1 ? text.length : escAt;
    const chunk = text.slice(index, limit);
    for (const { g, w } of graphemesOf(chunk)) {
      col += putGlyph(col, y, g, w, state.bg, state.fg, state.bold);
      if (col >= screenCols) break;
    }
    index = limit;
  }
};

const flushRun = (parts, y, row, from, to) => {
  const rowNum = y + 1;
  parts.push(`${ESC}${rowNum};${from + 1}H`);
  let lastBg = null;
  let lastFg = null;
  let lastBold = null;
  for (let x = from; x < to; x += 1) {
    const cell = row[x];
    if (x > 0 && row[x - 1].w === 2) continue;
    if (cell.w === 0) continue;
    const sameBg = cell.bg === lastBg;
    const sameFg = cell.fg === lastFg;
    const sameWeight = cell.bold === lastBold;
    if (!sameBg || !sameFg || !sameWeight) {
      parts.push(RESET);
      if (cell.bg) parts.push(cell.bg);
      if (cell.fg) parts.push(cell.fg);
      if (cell.bold) parts.push(`${ESC}1m`);
      lastBg = cell.bg;
      lastFg = cell.fg;
      lastBold = cell.bold;
    }
    parts.push(cell.g || ' ');
    if (cell.w < 2) continue;
    const next = x + cell.w;
    if (next >= to) continue;
    parts.push(`${ESC}${rowNum};${next + 1}H`);
  }
  parts.push(RESET);
};

// Stream between write() columns so a 2-cell emoji is not followed by CUP
// onto its second cell (that prints the next letter over the icon).
const flushRow = (parts, y, row, cols) => {
  const marks = rowCuts(y, cols);
  for (let index = 0; index < marks.length - 1; index += 1) {
    const from = marks[index];
    const to = marks[index + 1];
    if (from >= to) continue;
    flushRun(parts, y, row, from, to);
  }
};

const writeTty = (value) => {
  try {
    fs.writeSync(process.stdout.fd, value);
  } catch {
    process.stdout.write(value);
  }
};

const write = (x, y, value) => {
  if (painting) {
    markCut(x, y);
    plotAnsi(x, y, value);
    return;
  }
  writeTty(`${moveTo(x, y)}${value}`);
};

const beginFrame = (cols, rows) => {
  ensureGrid(cols, rows);
  clearGrid();
  painting = true;
};

const endFrame = (cursor) => {
  if (!painting) return;
  painting = false;
  const parts = [HIDE_CURSOR, SYNC_START, WRAP_OFF];
  for (let y = 0; y < screenRows; y += 1) {
    flushRow(parts, y, grid[y], screenCols);
  }
  if (cursor) {
    parts.push(moveTo(cursor.x, cursor.y), SHOW_CURSOR);
  }
  parts.push(SYNC_END);
  writeTty(parts.join(''));
};

const enterDisplay = () => {
  if (displayActive) return;
  const setup = [
    ENTER_ALT,
    HIDE_CURSOR,
    WRAP_OFF,
    MOUSE_ON,
    MODIFY_KEYS_ON,
    CURSOR_WHITE,
    CURSOR_BLINK_ON,
    CURSOR_BLOCK_BLINK,
  ];
  writeTty(setup.join(''));
  displayActive = true;
};

const resetDisplay = () => {
  if (!displayActive) return;
  displayActive = false;
  painting = false;
  grid = [];
  cuts = [];
  screenCols = 0;
  screenRows = 0;
  const restore = [
    WRAP_ON,
    SYNC_END,
    MOUSE_OFF,
    MODIFY_KEYS_OFF,
    CURSOR_BLINK_OFF,
    CURSOR_COLOR_RESET,
    CURSOR_RESET,
    RESET,
    SHOW_CURSOR,
    LEAVE_ALT,
  ];
  writeTty(restore.join(''));
};

process.on('exit', resetDisplay);

const themeFor = (name) => {
  const bg = colors.background[name];
  const paint = (tone) => style(bg, FG[tone]);
  return {
    bg,
    fg: FG,
    fill: paint('text'),
    text: paint('text'),
    muted: paint('muted'),
    faint: paint('faint'),
    accent: paint('cyan'),
    success: paint('green'),
    warning: paint('yellow'),
    error: paint('red'),
    selected: styles.selected,
  };
};

const fillRect = (panel, renderer) => {
  const line = renderer(repeat(' ', panel.w));
  for (let row = 0; row < panel.h; row += 1) {
    write(panel.x, panel.y + row, line);
  }
};

const overlaySplit = (width, overlay) => {
  if (!overlay || overlay.w <= 0) return width;
  return Math.max(0, width - overlay.w);
};

const writeLine = (panel, row, renderer, options) => {
  const opts = options ?? {};
  const value = opts.value ?? '';
  const padding = opts.padding ?? PANEL_PAD;
  const overlay = opts.overlay ?? null;
  if (row < 0 || row >= panel.h) return;
  const rightPad = overlay ? 0 : padding;
  const width = Math.max(0, panel.w - padding - rightPad);
  const split = overlaySplit(width, overlay);
  const line = pad(value, width);
  if (!overlay || overlay.w <= 0 || split >= width) {
    return void write(panel.x + padding, panel.y + row, renderer(line));
  }
  const head = pad(sliceWidth(line, split), split);
  const tail = pad(sliceFromWidth(line, split, overlay.w), overlay.w);
  const painted = `${renderer(head)}${overlay.bg}${overlay.fg}${tail}${RESET}`;
  write(panel.x + padding, panel.y + row, painted);
};

const writeSegments = (panel, row, segments, background, options) => {
  const opts = options ?? {};
  const padding = opts.padding ?? PANEL_PAD;
  const overlay = opts.overlay ?? null;
  if (row < 0 || row >= panel.h) return;
  const rightPad = overlay ? 0 : padding;
  const width = Math.max(0, panel.w - padding - rightPad);
  const split = overlaySplit(width, overlay);
  const bgAt = (col, fallback) => {
    if (overlay && overlay.w > 0 && col >= split) return overlay.bg;
    return fallback;
  };
  const fgAt = (col, fallback) => {
    if (overlay && overlay.w > 0 && col >= split && overlay.fg) {
      return overlay.fg;
    }
    return fallback;
  };
  let used = 0;
  let output = background;
  for (const segment of segments) {
    if (used >= width) break;
    if (!segment.text) continue;
    const fg = segment.color;
    const weight = segment.bold ? `${ESC}1m` : `${ESC}22m`;
    const baseBg = segment.bg ?? background;
    for (const { g, w } of graphemesOf(segment.text)) {
      if (used >= width) break;
      if (w <= 0) {
        output += `${bgAt(used, baseBg)}${fgAt(used, fg)}${weight}${g}`;
        continue;
      }
      if (used < split && used + w > split) {
        const gap = split - used;
        const fill = repeat(' ', gap);
        output += `${bgAt(used, baseBg)}${fgAt(used, fg)}${weight}${fill}`;
        used = split;
      }
      if (used + w > width) break;
      output += `${bgAt(used, baseBg)}${fgAt(used, fg)}${weight}${g}`;
      used += w;
    }
  }
  if (used < width) {
    const fillStart = used;
    const spaces = width - used;
    const mid = Math.max(0, Math.min(spaces, split - fillStart));
    if (mid > 0) output += `${bgAt(fillStart, background)}${repeat(' ', mid)}`;
    if (mid < spaces) {
      output += `${bgAt(split, background)}${repeat(' ', spaces - mid)}`;
    }
  }
  output += RESET;
  write(panel.x + padding, panel.y + row, output);
};

const wrapText = (text, width) => {
  if (width <= 0) return [''];
  const source = text ?? '';
  const paragraphs = source.split('\n');
  const lines = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push('');
      continue;
    }
    let rest = paragraph;
    while (textWidth(rest) > width) {
      const window = sliceWidth(rest, width);
      if (!window) {
        const take = firstGrapheme(rest);
        lines.push(take);
        rest = rest.slice(take.length).trimStart();
        continue;
      }
      const spaceAt = window.lastIndexOf(' ');
      const breakAt = spaceAt > 0 ? spaceAt : window.length;
      lines.push(rest.slice(0, breakAt).trimEnd());
      rest = rest.slice(breakAt).trimStart();
    }
    lines.push(rest);
  }
  return lines.length > 0 ? lines : [''];
};

const sliceSpans = (spans, from, width) => {
  if (width <= 0) return [];
  const out = [];
  let col = 0;
  const to = from + width;
  for (const span of spans) {
    const start = col;
    const end = col + span.text.length;
    col = end;
    if (end <= from || start >= to) continue;
    const sliceFrom = Math.max(0, from - start);
    const sliceTo = Math.min(span.text.length, to - start);
    const text = span.text.slice(sliceFrom, sliceTo);
    if (!text) continue;
    out.push({ ...span, text });
  }
  return out;
};

const overlaySpans = (spans, from, to) => {
  if (from >= to) return spans;
  const out = [];
  let col = 0;
  const selFg = colors.foreground.sel;
  const selBg = colors.background.sel;
  for (const span of spans) {
    const text = span.text;
    const start = col;
    const end = col + text.length;
    col = end;
    if (end <= from || start >= to) {
      out.push(span);
      continue;
    }
    const leftLen = Math.max(0, from - start);
    const midEnd = Math.max(0, to - start);
    if (leftLen > 0) {
      out.push({ text: text.slice(0, leftLen), color: span.color });
    }
    const mid = text.slice(leftLen, midEnd);
    if (mid) out.push({ text: mid, color: selFg, bg: selBg });
    if (midEnd < text.length) {
      out.push({ text: text.slice(midEnd), color: span.color });
    }
  }
  return out;
};

const layout = (cols, rows, view = {}) => {
  const topHeight = 1;
  const bodyY = topHeight;
  const bodyHeight = rows - topHeight;
  const treeWidth = view.hideTree ? 0 : clamp(Math.floor(cols * 0.18), 26, 38);
  const agentWidth = clamp(Math.floor(cols * 0.29), 42, 62);
  const centerWidth = cols - treeWidth - agentWidth;
  const terminalHeight = view.hideTerm
    ? 0
    : clamp(Math.floor(bodyHeight * 0.27), 10, 17);
  const codeHeight = bodyHeight - terminalHeight;
  const terminalY = bodyY + codeHeight;
  const agentX = treeWidth + centerWidth;
  const top = { x: 0, y: 0, w: cols, h: topHeight };
  const tree = { x: 0, y: bodyY, w: treeWidth, h: bodyHeight };
  const code = { x: treeWidth, y: bodyY, w: centerWidth, h: codeHeight };
  const terminal = {
    x: treeWidth,
    y: terminalY,
    w: centerWidth,
    h: terminalHeight,
  };
  const agent = { x: agentX, y: bodyY, w: agentWidth, h: bodyHeight };
  return { top, tree, code, terminal, agent };
};

module.exports = {
  MIN_COLS,
  MIN_ROWS,
  RESET,
  colors,
  styles,
  themeFor,
  clamp,
  clip,
  pad,
  textWidth,
  stripAnsi,
  write,
  beginFrame,
  endFrame,
  enterDisplay,
  resetDisplay,
  fillRect,
  writeLine,
  writeSegments,
  wrapText,
  overlaySpans,
  sliceSpans,
  layout,
};
