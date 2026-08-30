'use strict';

const { copyText, pasteText } = require('./clipboard.js');
const { selectedText, normalizeSelection } = require('./mouse.js');

const FILE_TOOLS = ['read', 'write', 'edit'];

const INPUT_NAV = {
  left: (input, select) => input.left(select),
  right: (input, select) => input.right(select),
  home: (input, select) => input.home(select),
  end: (input, select) => input.end(select),
  up: (input, select) => input.up(select),
  down: (input, select) => input.down(select),
};

const CODE_NAV = [
  'up',
  'down',
  'left',
  'right',
  'home',
  'end',
  'pageup',
  'pagedown',
];

const APPROVE_CH = { y: true, Y: true, n: false, N: false };

const EVENT_HANDLERS = {
  step: (ide, event) => ide.chat.addStep(event),
  assistant: (ide, event) => ide.chat.addAgent(event.text),
  tool: (ide, event) => ide.onToolStart(event),
  result: (ide, event) => ide.onToolResult(event),
};

const FOCUS_KEYS = {
  tree: (ide, key) => ide.onTreeKey(key),
  code: (ide, key) => ide.onCodeKey(key),
  terminal: (ide, key) => ide.onTerminalKey(key),
  agent: (ide, key) => ide.onAgentKey(key),
};

const TERM_KEYS = {
  up: (ide) => ide.terminal.recall(1),
  down: (ide) => ide.terminal.recall(-1),
  pageup: (ide) => {
    const height = ide.view.terminal;
    ide.terminal.move(height, height);
  },
  pagedown: (ide) => {
    const height = ide.view.terminal;
    ide.terminal.move(-height, height);
  },
};

const AGENT_KEYS = {
  pageup: (ide) => ide.chat.move(ide.view.chat),
  pagedown: (ide) => ide.chat.move(-ide.view.chat),
  escape: (ide) => ide.chat.input.clear(),
};

const TREE_CHARS = {
  '?': async (ide) => {
    await ide.toggleHelp();
    ide.render();
  },
  '/': (ide) => {
    ide.search.active = true;
    ide.search.query = ide.tree.filter;
    ide.render();
  },
};

const TREE_KEYS = {
  up: (ide) => ide.tree.move(-1, ide.view.tree),
  down: (ide) => ide.tree.move(1, ide.view.tree),
  pageup: (ide) => ide.tree.move(-ide.view.tree, ide.view.tree),
  pagedown: (ide) => ide.tree.move(ide.view.tree, ide.view.tree),
  left: (ide) => ide.tree.collapse(),
  right: (ide) => ide.tree.expand(),
};

const SEL_JUMP = {
  left: (norm) => norm.a,
  right: (norm) => norm.b,
};

const isChar = (key) => key.name === 'char' && Boolean(key.ch) && key.ch >= ' ';

const applyInputKey = (input, key) => {
  const select = Boolean(key.shift);
  if (key.name === 'backspace') {
    input.backspace();
    return true;
  }
  if (key.name === 'delete') {
    input.del();
    return true;
  }
  const move = INPUT_NAV[key.name];
  if (!move) return false;
  move(input, select);
  return true;
};

const ensureCodeView = (ide) => {
  ide.editor.ensureCursorVisible(ide.view.code, ide.view.codeWidth);
};

const deleteCodeSel = (ide) => {
  const norm = normalizeSelection(ide.selection);
  if (!norm || norm.panel !== 'code') {
    return false;
  }
  ide.editor.deleteRange(norm.a, norm.b);
  ide.selection = null;
  return true;
};

const copyFocused = (ide) => {
  if (ide.focus === 'code') {
    copyText(selectedText(ide));
  } else if (ide.focus === 'terminal') {
    copyText(ide.terminal.selectedText());
  }
};

const pasteInto = async (ide) => {
  const text = await pasteText();
  if (!text) return false;
  if (ide.focus === 'code') {
    deleteCodeSel(ide);
    ide.editor.insert(text);
    ensureCodeView(ide);
    ide.scheduleSave();
    return true;
  }
  if (ide.focus === 'agent') {
    ide.chat.input.insert(text);
    return true;
  }
  return false;
};

const loc = (pos) => `${pos.line + 1}:${pos.col + 1}`;

const addCodeRef = (ide) => {
  const rel = ide.editor.rel;
  if (!rel) return false;
  const norm = normalizeSelection(ide.selection);
  const cursor = ide.editor.cursorPos();
  const fromSel = norm?.panel === 'code';
  const a = fromSel ? norm.a : cursor;
  const b = fromSel ? norm.b : cursor;
  const ref = `${rel}/${loc(a)}-${loc(b)}`;
  const input = ide.chat.input;
  const before = input.value.slice(0, input.cursor);
  const after = input.value.slice(input.cursor);
  const prefix = before && !/[\s]$/.test(before) ? ' ' : '';
  const needsSpace = !after || !/^\s/.test(after);
  const suffix = needsSpace ? ' ' : '';
  input.insert(`${prefix}${ref}${suffix}`);
  return true;
};

const moveCode = (ide, dLine, dCol) => {
  ide.editor.moveCursor(dLine, dCol, ide.view.code, ide.view.codeWidth);
};

const CODE_KEYS = {
  up: (ide) => moveCode(ide, -1, 0),
  down: (ide) => moveCode(ide, 1, 0),
  left: (ide) => moveCode(ide, 0, -1),
  right: (ide) => moveCode(ide, 0, 1),
  pageup: (ide) => moveCode(ide, -ide.view.code, 0),
  pagedown: (ide) => moveCode(ide, ide.view.code, 0),
  home: (ide, key) => {
    if (key.ctrl) ide.editor.goFileStart();
    else ide.editor.goLineStart();
    ensureCodeView(ide);
  },
  end: (ide, key) => {
    if (key.ctrl) ide.editor.goFileEnd();
    else ide.editor.goLineEnd();
    ensureCodeView(ide);
  },
  backspace: (ide) => {
    ide.editor.backspace(ide.view.code, ide.view.codeWidth);
  },
  delete: (ide) => ide.editor.del(ide.view.code, ide.view.codeWidth),
};

const jumpCodeSel = (ide, key) => {
  const norm = normalizeSelection(ide.selection);
  if (!norm || norm.panel !== 'code' || key.shift) {
    return false;
  }
  const endAt = SEL_JUMP[key.name];
  if (!endAt) {
    ide.selection = null;
    return false;
  }
  const pos = endAt(norm);
  ide.editor.cursorLine = pos.line;
  ide.editor.cursorCol = pos.col;
  ide.selection = null;
  ensureCodeView(ide);
  return true;
};

const moveCodeSel = (ide, key) => {
  if (jumpCodeSel(ide, key)) return;
  const before = ide.editor.cursorPos();
  const action = CODE_KEYS[key.name];
  if (action) action(ide, key);
  if (key.shift) {
    const after = ide.editor.cursorPos();
    const anchor =
      ide.selection?.panel === 'code' ? ide.selection.anchor : before;
    if (after.line === anchor.line && after.col === anchor.col) {
      ide.selection = null;
    } else {
      ide.selection = { panel: 'code', anchor, focus: after };
    }
    return;
  }
  ide.selection = null;
};

const GLOBAL_KEYS = {
  f10: (ide) => {
    ide.stop();
    return true;
  },
  escape: (ide) => {
    if (!ide.closeHelp()) return false;
    ide.render();
    return true;
  },
  'ctrl-c': (ide) => {
    if (ide.focus === 'code' || ide.focus === 'agent') {
      copyFocused(ide);
      ide.render();
      return true;
    }
    ide.stop();
    return true;
  },
  'ctrl-v': async (ide) => {
    if (ide.focus === 'code' && !ide.editor.canEdit()) {
      return true;
    }
    if (ide.focus === 'code' || ide.focus === 'agent') {
      await pasteInto(ide);
      ide.render();
    }
    return true;
  },
  'ctrl-z': (ide, key) => {
    if (ide.focus !== 'code' || !ide.editor.canEdit()) {
      return ide.focus === 'code';
    }
    const changed = key.shift ? ide.editor.redo() : ide.editor.undo();
    if (changed) {
      ide.selection = null;
      ensureCodeView(ide);
      ide.scheduleSave();
    }
    ide.render();
    return true;
  },
  'ctrl-b': (ide) => {
    ide.toggleTree();
    ide.render();
    return true;
  },
  'ctrl-space': (ide) => {
    ide.toggleTerminal();
    ide.render();
    return true;
  },
  'ctrl-l': (ide) => {
    if (addCodeRef(ide)) ide.render();
    return true;
  },
};

const commitCode = (ide) => {
  ensureCodeView(ide);
  if (ide.editor.dirty) ide.scheduleSave();
  ide.render();
};

module.exports = {
  FILE_TOOLS,
  CODE_NAV,
  APPROVE_CH,
  EVENT_HANDLERS,
  FOCUS_KEYS,
  TREE_CHARS,
  TREE_KEYS,
  CODE_KEYS,
  TERM_KEYS,
  AGENT_KEYS,
  GLOBAL_KEYS,
  isChar,
  applyInputKey,
  deleteCodeSel,
  moveCodeSel,
  commitCode,
};
