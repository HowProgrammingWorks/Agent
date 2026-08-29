'use strict';

const { clamp } = require('../tui.js');
const { copyText } = require('./clipboard.js');
const scroll = require('./scroll.js');

const PAD = 2;
const DRAG_THRESHOLD = 1;
const PANEL_ORDER = ['tree', 'code', 'terminal', 'agent'];

const contains = (panel, x, y) => {
  if (!panel) return false;
  if (x < panel.x || y < panel.y) return false;
  if (x >= panel.x + panel.w) return false;
  if (y >= panel.y + panel.h) return false;
  return true;
};

const panelAt = (panels, x, y) => {
  if (!panels) return null;
  for (const name of PANEL_ORDER) {
    if (contains(panels[name], x, y)) return name;
  }
  return null;
};

const normalizeSelection = (sel) => {
  if (!sel || !sel.anchor || !sel.focus) return null;
  let a = sel.anchor;
  let b = sel.focus;
  const laterLine = a.line > b.line;
  const laterCol = a.line === b.line && a.col > b.col;
  if (laterLine || laterCol) {
    const swap = a;
    a = b;
    b = swap;
  }
  return { panel: sel.panel, a, b };
};

const selectionMoved = (drag) => {
  if (!drag || !drag.start || !drag.last) return false;
  const dLine = Math.abs(drag.last.line - drag.start.line);
  const dCol = Math.abs(drag.last.col - drag.start.col);
  return dLine >= DRAG_THRESHOLD || dCol >= DRAG_THRESHOLD;
};

const lineRange = (sel, panel, line, width) => {
  const norm = normalizeSelection(sel);
  if (!norm || norm.panel !== panel) return null;
  if (line < norm.a.line || line > norm.b.line) return null;
  const from = line === norm.a.line ? norm.a.col : 0;
  const to = line === norm.b.line ? norm.b.col : width;
  const start = clamp(from, 0, width);
  const end = clamp(to, start, width);
  if (start >= end) return null;
  return { from: start, to: end };
};

const lineText = (ide, panel, line) => {
  if (panel === 'code') return ide.editor.lines[line] ?? '';
  if (panel === 'terminal') return ide.terminal.lines[line]?.text ?? '';
  const chat = ide.screen.chatLines ?? [];
  return chat[line]?.text ?? '';
};

const selectedText = (ide) => {
  const norm = normalizeSelection(ide.selection);
  if (!norm) return '';
  const { panel, a, b } = norm;
  if (a.line === b.line) {
    return lineText(ide, panel, a.line).slice(a.col, b.col);
  }
  const rows = [];
  rows.push(lineText(ide, panel, a.line).slice(a.col));
  for (let index = a.line + 1; index < b.line; index += 1) {
    rows.push(lineText(ide, panel, index));
  }
  rows.push(lineText(ide, panel, b.line).slice(0, b.col));
  return rows.join('\n');
};

const treePos = (ide, localY) => {
  const viewRow = localY - 1;
  if (viewRow < 0) return { kind: 'header' };
  return { kind: 'row', index: ide.tree.offset + viewRow };
};

const codePos = (ide, localX, localY) => {
  const viewRow = localY - 1;
  if (viewRow < 0) return null;
  const line = ide.editor.offset + viewRow;
  if (line < 0 || line >= ide.editor.lineCount()) return null;
  const gutter = ide.screen.gutter;
  const col = Math.max(0, localX - gutter) + ide.editor.colOffset;
  const maxCol = (ide.editor.lines[line] ?? '').length;
  return { line, col: Math.min(col, maxCol) };
};

const terminalPos = (ide, localX, localY) => {
  const panel = ide.panels.terminal;
  if (localY === panel.h - 2) {
    return { kind: 'prompt', col: Math.max(0, localX - 2) };
  }
  if (localY >= panel.h - 1) {
    return null;
  }
  const viewRow = localY - 1;
  if (viewRow < 0) return null;
  const height = ide.view.terminal;
  const start = Math.max(
    0,
    ide.terminal.lines.length - height - ide.terminal.offset,
  );
  const line = start + viewRow;
  if (line < 0 || line >= ide.terminal.lines.length) return null;
  const text = ide.terminal.lines[line].text;
  return { line, col: Math.min(Math.max(0, localX), text.length) };
};

const agentPos = (ide, localX, localY) => {
  const inputY = ide.screen.inputY;
  if (localY >= inputY) {
    return { kind: 'prompt', col: Math.max(0, localX) };
  }
  const viewRow = localY - 2;
  if (viewRow < 0) return null;
  const lines = ide.screen.chatLines;
  const line = ide.screen.chatViewStart + viewRow;
  if (line < 0 || line >= lines.length) return null;
  const text = lines[line].text;
  return { line, col: Math.min(Math.max(0, localX), text.length) };
};

const POS = {
  tree: (ide, localX, localY) => treePos(ide, localY),
  code: (ide, localX, localY) => codePos(ide, localX, localY),
  terminal: (ide, localX, localY) => terminalPos(ide, localX, localY),
  agent: (ide, localX, localY) => agentPos(ide, localX, localY),
};

const docPos = (ide, name, x, y) => {
  const panel = ide.panels[name];
  if (!panel) return null;
  const localY = y - panel.y;
  let localX = x - panel.x - PAD;
  const bar = ide.screen.scrolls?.[name];
  if (bar && bar.maxOffset > 0 && y >= bar.y && y < bar.y + bar.h) {
    const maxLocalX = bar.x - panel.x - PAD - 1;
    if (localX > maxLocalX) localX = Math.max(0, maxLocalX);
  }
  const locate = POS[name];
  if (!locate) return null;
  return locate(ide, localX, localY);
};

const setPromptCursor = (ide, name, pos) => {
  if (name === 'terminal') {
    const input = ide.terminal.input;
    input.cursor = clamp(pos.col, 0, input.value.length);
    return;
  }
  if (name === 'agent') {
    const input = ide.chat.input;
    input.cursor = clamp(pos.col, 0, input.value.length);
  }
};

const setEditorCursor = (ide, pos) => {
  ide.editor.cursorLine = pos.line;
  ide.editor.cursorCol = pos.col;
};

const SELECTABLE = ['code', 'terminal', 'agent'];

const scrollPanel = (ide, name, delta) => {
  if (name === 'tree') {
    ide.tree.scroll(delta, ide.view.tree);
  } else if (name === 'code') {
    ide.editor.move(delta, ide.view.code);
  } else if (name === 'terminal') {
    ide.terminal.move(delta, ide.view.terminal);
  } else if (name === 'agent') {
    ide.chat.move(delta, ide.view.chat);
  }
};

const clickTree = async (ide, pos) => {
  if (!pos || pos.kind !== 'row') return;
  const count = ide.tree.visible().length;
  if (pos.index < 0 || pos.index >= count) return;
  ide.tree.selected = pos.index;
  await ide.openSelected();
};

const clickDoc = (ide, name, pos) => {
  if (!pos) return;
  if (pos.kind === 'prompt') {
    setPromptCursor(ide, name, pos);
    return;
  }
  if (name === 'code') setEditorCursor(ide, pos);
};

const finishSelect = (ide, name, pos, drag) => {
  const focus = pos || drag.last;
  if (!focus || focus.kind === 'prompt' || focus.kind === 'row') return false;
  if (!drag.selecting && !selectionMoved({ ...drag, last: focus })) {
    return false;
  }
  ide.selection = { panel: name, anchor: drag.start, focus };
  copyText(selectedText(ide));
  return true;
};

const applyScrollDrag = (ide, y) => {
  const drag = ide.scrollDrag;
  if (!drag) {
    return;
  }
  scroll.applyBarY(ide, drag.name, y, drag.grab);
};

const onWheel = (ide, key, name) => {
  if (!name || key.release) {
    return;
  }
  const shift = (key.button & 4) !== 0;
  if (name === 'code' && shift) {
    const delta = (key.button & 1) === 0 ? -6 : 6;
    ide.editor.moveCol(delta, ide.view.codeWidth || 1);
    return;
  }
  let delta = (key.button & 1) === 0 ? -3 : 3;
  if (name === 'terminal' || name === 'agent') {
    delta *= -1;
  }
  scrollPanel(ide, name, delta);
};

const onScrollBar = (ide, name, y) => {
  const bar = ide.screen.scrolls?.[name];
  if (!bar) {
    return;
  }
  ide.selection = null;
  ide.drag = null;
  const grab = scroll.grabFromY(bar, y);
  ide.scrollDrag = { name, grab };
  scroll.applyBarY(ide, name, y, grab);
};

const onDrag = (ide, pos) => {
  if (!pos || !ide.drag || pos.kind) return;
  ide.drag.last = pos;
  if (!selectionMoved(ide.drag)) return;
  ide.selection = {
    panel: ide.drag.panel,
    anchor: ide.drag.start,
    focus: pos,
  };
  ide.drag.selecting = true;
};

const onPress = (ide, name, pos) => {
  ide.selection = null;
  if (!name) {
    ide.drag = null;
    return;
  }
  ide.setFocus(name);
  if (name === 'tree' || !pos || pos.kind) {
    ide.drag = null;
    if (pos?.kind === 'prompt') setPromptCursor(ide, name, pos);
    return;
  }
  if (!SELECTABLE.includes(name)) {
    ide.drag = null;
    return;
  }
  if (name === 'code') setEditorCursor(ide, pos);
  ide.drag = { panel: name, start: pos, last: pos, selecting: false };
};

const onRelease = async (ide, name, pos) => {
  const drag = ide.drag;
  ide.drag = null;
  if (name === 'tree') {
    await clickTree(ide, pos);
    return;
  }
  if (drag && finishSelect(ide, drag.panel, pos, drag)) return;
  clickDoc(ide, name, pos);
};

const hitRect = (hit, x, y) => {
  if (!hit) {
    return false;
  }
  if (y < hit.y || y >= hit.y + hit.h) {
    return false;
  }
  if (x < hit.x || x >= hit.x + hit.w) {
    return false;
  }
  return true;
};

const handleMouse = async (ide, key) => {
  const btn = key.button;
  const isWheel = (btn & 64) !== 0;
  const isDrag = btn >= 32 && btn < 64;
  const baseBtn = isDrag ? btn - 32 : btn;
  const x = key.col - 1;
  const y = key.row - 1;
  if (hitRect(ide.screen?.closeHit, x, y)) {
    if (!isWheel && !isDrag && baseBtn === 0 && !key.release) {
      ide.stop();
    }
    return;
  }
  if (hitRect(ide.screen?.logoHit, x, y)) {
    if (!isWheel && !isDrag && baseBtn === 0 && !key.release) {
      await ide.toggleHelp();
    }
    return;
  }
  const name = panelAt(ide.panels, x, y);
  const pos = name ? docPos(ide, name, x, y) : null;
  const hit = scroll.barAt(ide, x, y);

  if (isWheel) {
    onWheel(ide, key, name);
    return;
  }
  if (isDrag) {
    if (ide.scrollDrag) {
      applyScrollDrag(ide, y);
      return;
    }
    if (baseBtn === 0) {
      onDrag(ide, pos);
    }
    return;
  }
  if (baseBtn !== 0) {
    return;
  }
  if (!key.release) {
    if (hit) {
      onScrollBar(ide, hit, y);
      return;
    }
    onPress(ide, name, pos);
    return;
  }
  if (ide.scrollDrag) {
    applyScrollDrag(ide, y);
    ide.scrollDrag = null;
    return;
  }
  await onRelease(ide, name, pos);
};

module.exports = {
  PAD,
  panelAt,
  docPos,
  lineRange,
  selectedText,
  normalizeSelection,
  handleMouse,
};
