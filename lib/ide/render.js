'use strict';

const tui = require('../tui.js');
const { MIN_COLS, MIN_ROWS } = tui;
const { colors, styles, pad, write, clip, textWidth } = tui;
const { fillRect, writeLine, writeSegments } = tui;
const { overlaySpans, sliceSpans, themeFor, layout } = tui;
const { beginFrame, endFrame } = tui;

const { TONES: TERM_TONES } = require('./terminal.js');
const { TONES: CHAT_TONES } = require('./chat.js');
const { lineRange } = require('./mouse.js');
const { storeBar, paintBar, overlayAt, BAR_W } = require('./scroll.js');
const { nodeIcon, nodeIconTone } = require('./tree.js');

const INPUT_ROWS = 4;
const INPUT_BOX_PAD = 1;
const INPUT_TEXT_PAD = 2;
const CODE_HEAD = 1;
const CLOSE_GLYPH = '✕';
const STATUS = {
  idle: { label: 'idle', style: styles.headerMuted },
  running: { label: 'active', style: styles.headerOk },
  approval: { label: 'wait', style: styles.headerWait },
};

const TONE_FG = {
  terminal: 'text',
  terminalMuted: 'muted',
  terminalAccent: 'cyan',
  terminalSuccess: 'green',
  terminalWarning: 'yellow',
  terminalError: 'red',
  agent: 'text',
  agentMuted: 'muted',
  agentFaint: 'faint',
  agentAccent: 'cyan',
  agentSuccess: 'green',
  agentWarning: 'yellow',
  agentError: 'red',
};

const treeRowFg = (row, selected, theme) => {
  if (selected) return colors.foreground.bright;
  if (row.node.name.startsWith('.')) return theme.fg.muted;
  if (row.node.isDir) return theme.fg.cyan;
  return theme.fg.text;
};

const BADGE_BG = {
  yellow: 'badgeYellow',
  blue: 'badgeBlue',
  purple: 'badgePurple',
  orange: 'badgeOrange',
  magenta: 'badgeMagenta',
  cyan: 'badgeCyan',
};

const treeIconStyle = (tone, fg, bg) => {
  const badge = BADGE_BG[tone];
  if (!badge) {
    return { color: fg, bg };
  }
  return {
    color: colors.foreground.black,
    bg: colors.background[badge],
    bold: true,
  };
};

const renderSmall = (cols, rows) => {
  beginFrame(cols, rows);
  const msg = `Terminal must be at least ${MIN_COLS} × ${MIN_ROWS}`;
  write(0, 0, styles.terminal(pad(msg, cols)));
  endFrame(null);
};

const clipSegments = (segments, width) => {
  const out = [];
  let used = 0;
  for (const segment of segments) {
    if (used >= width) {
      break;
    }
    const room = width - used;
    const text =
      textWidth(segment.text) <= room ? segment.text : clip(segment.text, room);
    if (!text) {
      break;
    }
    out.push({ ...segment, text });
    used += textWidth(text);
  }
  return out;
};

const pathSegments = (root, rel, dirty, notice) => {
  const bg = colors.background.header;
  const parts = rel ? [root, ...rel.split('/')] : [root];
  const segments = [];
  for (let index = 0; index < parts.length; index += 1) {
    if (index > 0) {
      segments.push({
        text: ' > ',
        color: colors.foreground.blue,
        bg,
      });
    }
    const last = index === parts.length - 1;
    let label = parts[index];
    if (last && dirty) {
      label = `${label} •`;
    }
    const first = index === 0;
    const color =
      first || last ? colors.foreground.header : colors.foreground.muted;
    segments.push({ text: label, color, bg, bold: first });
  }
  if (notice) {
    segments.push({ text: `  ${notice}`, color: colors.foreground.muted, bg });
  }
  return segments;
};

const editorNotice = (ide) => {
  if (ide.editor.notice) return ide.editor.notice;
  if (ide.editor.viewOnly) return 'view';
  return '';
};

const renderTop = (panel, ide) => {
  fillRect(panel, styles.header);
  const bg = colors.background.header;
  const status = STATUS[ide.status] ?? STATUS.idle;
  const statusLabel = status.label;
  const lead = [{ text: '🧠 ', color: colors.foreground.header, bg }];
  const path = pathSegments(
    ide.tree.name,
    ide.editor.rel,
    ide.editor.dirty,
    editorNotice(ide),
  );
  const closeX = panel.x + panel.w - 1;
  const statusX = Math.max(1, closeX - statusLabel.length - 1);
  const budget = Math.max(0, statusX - 1);
  const line = clipSegments([...lead, ...path], budget);
  writeSegments(panel, 0, line, bg, 1);
  write(statusX, panel.y, status.style(statusLabel));
  write(closeX, panel.y, styles.headerClose(CLOSE_GLYPH));
  ide.screen.logoHit = { x: panel.x + 1, y: panel.y, w: 3, h: 1 };
  ide.screen.closeHit = { x: closeX - 1, y: panel.y, w: 2, h: 1 };
};

const renderTree = (panel, ide) => {
  if (panel.w < 1 || panel.h < 1) {
    return;
  }
  const theme = themeFor('tree');
  fillRect(panel, theme.fill);
  const viewHeight = Math.max(1, panel.h - 2);
  ide.tree.ensureVisible(viewHeight);
  const rows = ide.tree.visible();
  const slice = rows.slice(ide.tree.offset, ide.tree.offset + viewHeight);
  const total = rows.length;
  const top = ide.tree.offset;
  const bar = storeBar(ide, 'tree', panel, 0, panel.h, total, viewHeight, top);
  paintBar(bar);
  for (let index = 0; index < slice.length; index += 1) {
    const row = slice[index];
    const selected = ide.tree.offset + index === ide.tree.selected;
    const indent = '  '.repeat(row.depth);
    const open = row.node.expanded || Boolean(ide.search.query);
    const icon = nodeIcon(row.node, open);
    const tone = nodeIconTone(row.node);
    const fg = treeRowFg(row, selected, theme);
    const bg = selected ? colors.background.selected : theme.bg;
    const badge = treeIconStyle(tone, fg, bg);
    const y = panel.y + index + 1;
    writeSegments(
      panel,
      index + 1,
      [
        { text: indent, color: fg, bg },
        { text: icon, color: badge.color, bg: badge.bg, bold: badge.bold },
        { text: ` ${row.node.name}`, color: fg, bg },
      ],
      bg,
      2,
      overlayAt(bar, y, fg),
    );
  }
  if (ide.search.active) {
    const searchY = panel.h - 1;
    writeLine(
      panel,
      searchY,
      theme.accent,
      `/${ide.search.query}`,
      2,
      overlayAt(bar, panel.y + searchY, theme.fg.cyan),
    );
  }
};

const lineGutter = (editor) => {
  if (!editor.showLines) return { inner: 0, width: 0 };
  const inner = `${Math.max(1, editor.lineCount())}`.length + 1;
  return { inner, width: inner + 1 };
};

const renderCode = (panel, ide) => {
  const theme = themeFor('code');
  fillRect(panel, theme.fill);
  const gutter = lineGutter(ide.editor);
  const visualWidth = Math.max(1, panel.w - 2 - gutter.width);
  const viewHeight = Math.max(1, panel.h - CODE_HEAD);
  ide.view.code = viewHeight;
  const total = ide.editor.lineCount();
  const needsBar = total > viewHeight;
  const textWidth = Math.max(1, visualWidth - (needsBar ? BAR_W : 0));
  ide.view.codeWidth = textWidth;
  ide.editor.ensureVisible(viewHeight, textWidth);
  const start = ide.editor.offset;
  const col0 = ide.editor.colOffset;
  const spans = ide.editor.spans;
  ide.screen.gutter = gutter.width;
  const bar = storeBar(
    ide,
    'code',
    panel,
    0,
    panel.h,
    total,
    viewHeight,
    start,
  );
  paintBar(bar);
  const end = Math.min(total, start + viewHeight);
  for (let index = start; index < end; index += 1) {
    const row = index - start + CODE_HEAD;
    const lineSpans = spans[index] || [];
    const lineLen = (ide.editor.lines[index] ?? '').length;
    const range = lineRange(ide.selection, 'code', index, lineLen);
    const body = range
      ? overlaySpans(lineSpans, range.from, range.to)
      : lineSpans;
    const windowed = sliceSpans(body, col0, visualWidth);
    const prefix = [];
    if (gutter.width > 0) {
      const number = `${index + 1}`.padStart(gutter.inner);
      prefix.push({ text: `${number} `, color: theme.fg.faint });
    }
    const overlay = overlayAt(bar, panel.y + row, theme.fg.text);
    writeSegments(panel, row, [...prefix, ...windowed], theme.bg, 2, overlay);
  }
};

const renderPlainLine = (
  panel,
  row,
  text,
  styleName,
  theme,
  range,
  overlay,
) => {
  const width = Math.max(0, panel.w - 2 - (overlay ? 0 : 2));
  const tone = TONE_FG[styleName] ?? 'text';
  const fg = theme.fg[tone];
  const padded = pad(text, width);
  const spans = [{ text: padded, color: fg }];
  const body = range ? overlaySpans(spans, range.from, range.to) : spans;
  writeSegments(panel, row, body, theme.bg, 2, overlay);
};

const renderTerminal = (panel, ide) => {
  if (panel.w < 1 || panel.h < 1) {
    return;
  }
  const theme = themeFor('terminal');
  fillRect(panel, theme.fill);
  const viewHeight = Math.max(1, panel.h - 3);
  ide.terminal.ensureVisible(viewHeight);
  const lines = ide.terminal.lines;
  const start = Math.max(0, lines.length - viewHeight - ide.terminal.offset);
  const slice = lines.slice(start, start + viewHeight);
  const visualWidth = Math.max(0, panel.w - 2);
  const total = lines.length;
  const top = start;
  const bar = storeBar(
    ide,
    'terminal',
    panel,
    0,
    panel.h,
    total,
    viewHeight,
    top,
  );
  paintBar(bar);
  const activeWidth =
    bar.maxOffset > 0 ? Math.max(0, panel.w - 4) : visualWidth;
  for (let index = 0; index < slice.length; index += 1) {
    const item = slice[index];
    const styleName = TERM_TONES[item.tone] ?? 'terminal';
    const line = start + index;
    const range = lineRange(ide.selection, 'terminal', line, activeWidth);
    const overlay = overlayAt(bar, panel.y + index + 1, theme.fg.text);
    renderPlainLine(
      panel,
      index + 1,
      item.text,
      styleName,
      theme,
      range,
      overlay,
    );
  }
  const prompt = `$ ${ide.terminal.input.value}`;
  const promptY = panel.h - 2;
  writeLine(
    panel,
    promptY,
    theme.text,
    prompt,
    2,
    overlayAt(bar, panel.y + promptY, theme.fg.text),
  );
};

const renderChatLine = (panel, row, item, theme, range, overlay) => {
  if (item.spans) {
    const fill = item.fill ?? theme.bg;
    const body = range
      ? overlaySpans(item.spans, range.from, range.to)
      : item.spans;
    writeSegments(panel, row, body, fill, 2, overlay);
    return;
  }
  const styleName = CHAT_TONES[item.tone] ?? 'agent';
  renderPlainLine(panel, row, item.text, styleName, theme, range, overlay);
};

const renderChat = (panel, ide, inputY, theme) => {
  const visualWidth = Math.max(1, panel.w - 2);
  const viewHeight = Math.max(1, inputY - 2);
  const lines = ide.chat.wrapLines(visualWidth);
  const maxOffset = Math.max(0, lines.length - viewHeight);
  ide.chat.setLineCount(maxOffset);
  const offset = Math.min(ide.chat.offset, maxOffset);
  const start = Math.max(0, lines.length - viewHeight - offset);
  const slice = lines.slice(start, start + viewHeight);
  ide.screen.chatLines = lines;
  ide.screen.chatViewStart = start;
  const total = lines.length;
  const top = start;
  const bar = storeBar(ide, 'agent', panel, 0, panel.h, total, viewHeight, top);
  paintBar(bar);
  const activeWidth =
    bar.maxOffset > 0 ? Math.max(1, panel.w - 4) : visualWidth;
  for (let index = 0; index < slice.length; index += 1) {
    const item = slice[index];
    const line = start + index;
    const range = lineRange(ide.selection, 'agent', line, activeWidth);
    const overlay = overlayAt(bar, panel.y + index + 2, theme.fg.text);
    renderChatLine(panel, index + 2, item, theme, range, overlay);
  }
};

const fillInputBox = (panel, inputY, paint, bar, fg) => {
  for (let row = inputY; row < panel.h - 1; row += 1) {
    const overlay = overlayAt(bar, panel.y + row, fg);
    writeLine(panel, row, paint, '', INPUT_BOX_PAD, overlay);
  }
};

const renderApproval = (panel, inputY, description, box, bar) => {
  fillInputBox(panel, inputY, box.fill, bar, box.fg.text);
  const text = `Approve: ${description}? [y/N]`;
  const overlay = overlayAt(bar, panel.y + inputY + 1, box.fg.text);
  writeLine(panel, inputY + 1, box.text, text, INPUT_TEXT_PAD, overlay);
};

const renderInput = (panel, ide, inputY, box, bar) => {
  fillInputBox(panel, inputY, box.fill, bar, box.fg.text);
  const overlay = overlayAt(bar, panel.y + inputY + 1, box.fg.text);
  const width = Math.max(1, panel.w - INPUT_TEXT_PAD * 2);
  const input = ide.chat.input;
  const line = input.currentLine();
  let start = 0;
  if (line.col >= width) {
    start = line.col - width + 1;
  }
  if (!input.value) {
    const placeholder = 'Ask the agent anything...';
    writeLine(
      panel,
      inputY + 1,
      box.muted,
      placeholder,
      INPUT_TEXT_PAD,
      overlayAt(bar, panel.y + inputY + 1, box.fg.muted),
    );
    return;
  }
  const visible = line.text.slice(start, start + width);
  const spans = [{ text: visible, color: box.fg.text }];
  const span = input.range();
  if (span) {
    const from = span.from - line.start - start;
    const to = span.to - line.start - start;
    const selFrom = Math.max(0, from);
    const selTo = Math.min(visible.length, to);
    if (selFrom < selTo) {
      const body = overlaySpans(spans, selFrom, selTo);
      writeSegments(panel, inputY + 1, body, box.bg, INPUT_TEXT_PAD, overlay);
      return;
    }
  }
  writeLine(panel, inputY + 1, box.text, visible, INPUT_TEXT_PAD, overlay);
};

const paintIdleCaret = (pos) => {
  if (!pos) {
    return;
  }
  const ch = pos.ch || ' ';
  write(pos.x, pos.y, styles.cursorIdle(ch));
};

const agentCursor = (panel, ide, inputY) => {
  if (ide.status === 'approval') {
    return null;
  }
  const width = Math.max(1, panel.w - INPUT_TEXT_PAD * 2);
  const line = ide.chat.input.currentLine();
  let start = 0;
  if (line.col >= width) {
    start = line.col - width + 1;
  }
  const col = Math.min(width - 1, line.col - start);
  const placeholder = 'Ask the agent anything...';
  const source = ide.chat.input.value ? line.text : placeholder;
  const ch = source[ide.chat.input.value ? line.col : col] || ' ';
  const x = panel.x + INPUT_TEXT_PAD + col;
  const bar = ide.screen.scrolls?.agent;
  if (bar && bar.maxOffset > 0 && x >= bar.x) {
    return null;
  }
  return { x, y: panel.y + inputY + 1, ch };
};

const terminalCursor = (panel, ide) => {
  const width = Math.max(1, panel.w - 4);
  const prefix = 2;
  const col = Math.min(width - prefix - 1, ide.terminal.input.cursor);
  const prompt = `$ ${ide.terminal.input.value}`;
  const index = prefix + col;
  const ch = prompt[index] || ' ';
  const x = panel.x + 2 + prefix + col;
  const bar = ide.screen.scrolls?.terminal;
  if (bar && bar.maxOffset > 0 && x >= bar.x) {
    return null;
  }
  return {
    x,
    y: panel.y + panel.h - 2,
    ch,
  };
};

const editorCursor = (panel, ide) => {
  if (!ide.editor.rel) {
    return null;
  }
  const viewHeight = ide.view.code;
  const line = ide.editor.cursorLine;
  const start = ide.editor.offset;
  if (line < start || line >= start + viewHeight) {
    return null;
  }
  const gutter = 2 + ide.screen.gutter;
  const width = ide.view.codeWidth || 1;
  const col = ide.editor.cursorCol - ide.editor.colOffset;
  if (col < 0 || col >= width) {
    return null;
  }
  const text = ide.editor.lines[line] ?? '';
  const ch = text[ide.editor.cursorCol] || ' ';
  const x = panel.x + gutter + col;
  const bar = ide.screen.scrolls?.code;
  if (bar && bar.maxOffset > 0 && x >= bar.x) {
    return null;
  }
  return {
    x,
    y: panel.y + CODE_HEAD + (line - start),
    ch,
  };
};

const renderAgent = (panel, ide) => {
  const theme = themeFor('agent');
  const box = themeFor('input');
  fillRect(panel, theme.fill);
  const inputY = Math.max(3, panel.h - INPUT_ROWS);
  ide.screen.inputY = inputY;
  renderChat(panel, ide, inputY, theme);
  const bar = ide.screen.scrolls?.agent;
  if (ide.pendingApproval) {
    renderApproval(panel, inputY, ide.pendingApproval.description, box, bar);
  } else {
    renderInput(panel, ide, inputY, box, bar);
  }
  const caret = agentCursor(panel, ide, inputY);
  if (ide.focus !== 'agent') {
    paintIdleCaret(caret);
  }
  return caret;
};

const renderFrame = (ide) => {
  const cols = process.stdout.columns || 160;
  const rows = process.stdout.rows || 45;
  ide.screen ||= {};
  if (cols < MIN_COLS || rows < MIN_ROWS) {
    ide.screen.closeHit = null;
    ide.screen.logoHit = null;
    renderSmall(cols, rows);
    return null;
  }
  const panels = layout(cols, rows, {
    hideTree: ide.hideTree,
    hideTerm: ide.hideTerm,
  });
  ide.panels = panels;
  ide.screen.scrolls = {};
  ide.view = {
    tree: Math.max(1, panels.tree.h - 2),
    code: Math.max(1, panels.code.h - CODE_HEAD),
    codeWidth: 40,
    terminal: Math.max(1, panels.terminal.h - 3),
    chat: Math.max(1, panels.agent.h - INPUT_ROWS - 2),
  };
  beginFrame(cols, rows);
  renderTop(panels.top, ide);
  renderTree(panels.tree, ide);
  renderCode(panels.code, ide);
  const codePos = editorCursor(panels.code, ide);
  if (ide.focus !== 'code') {
    paintIdleCaret(codePos);
  }
  let termPos = null;
  if (panels.terminal.h > 0) {
    renderTerminal(panels.terminal, ide);
    termPos = terminalCursor(panels.terminal, ide);
    if (ide.focus !== 'terminal') {
      paintIdleCaret(termPos);
    }
  }
  const agentPos = renderAgent(panels.agent, ide);
  let cursor = null;
  if (ide.focus === 'agent') {
    cursor = agentPos;
  } else if (ide.focus === 'terminal') {
    cursor = termPos;
  } else if (ide.focus === 'code') {
    cursor = codePos;
  }
  endFrame(cursor);
  return cursor;
};

module.exports = { renderFrame };
