'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { isError } = require('metautil');

const { runAgent } = require('../agent.js');
const tui = require('../tui.js');
const { enterDisplay, resetDisplay, stripAnsi } = tui;
const { Chat } = require('./chat.js');
const { Editor } = require('./editor.js');
const { loadGitInfo } = require('./git.js');
const { decodeKey, isIncompleteSequence } = require('./keys.js');
const { handleMouse, selectedText, normalizeSelection } = require('./mouse.js');
const { copyText, pasteText } = require('./clipboard.js');
const { renderFrame } = require('./render.js');
const { HELP_FILE } = require('./help.js');
const { FileTree, isSkippedRel } = require('./tree.js');
const { Terminal } = require('./terminal.js');

const FILE_TOOLS = ['read', 'write', 'edit'];
const FOCUS_ORDER = ['tree', 'code', 'terminal', 'agent'];
const SAVE_DELAY_MS = 800;
const WATCH_DELAY_MS = 200;

const errorText = (error) => {
  if (isError(error)) return error.message;
  if (typeof error === 'string') return error;
  if (error === null || error === undefined) return '';
  return `${error}`;
};

const isChar = (key) => key.name === 'char' && Boolean(key.ch) && key.ch >= ' ';

const INPUT_NAV = ['left', 'right', 'home', 'end', 'up', 'down'];

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
  if (!INPUT_NAV.includes(key.name)) {
    return false;
  }
  input[key.name](select);
  return true;
};

const TREE_KEYS = {
  up: (ide) => ide.tree.move(-1, ide.view.tree),
  down: (ide) => ide.tree.move(1, ide.view.tree),
  pageup: (ide) => ide.tree.move(-ide.view.tree, ide.view.tree),
  pagedown: (ide) => ide.tree.move(ide.view.tree, ide.view.tree),
  left: (ide) => ide.tree.collapse(),
  right: (ide) => ide.tree.expand(),
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
    return;
  }
  if (ide.focus === 'agent') {
    copyText(ide.chat.input.selectedText());
  }
};

const pasteInto = async (ide) => {
  const text = await pasteText();
  if (!text) {
    return false;
  }
  if (ide.focus === 'code') {
    deleteCodeSel(ide);
    ide.editor.insert(text);
    ide.editor.ensureCursorVisible(ide.view.code, ide.view.codeWidth);
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
  if (!rel) {
    return false;
  }
  const norm = normalizeSelection(ide.selection);
  const a = norm?.panel === 'code' ? norm.a : ide.editor.cursorPos();
  const b = norm?.panel === 'code' ? norm.b : ide.editor.cursorPos();
  const ref = `${rel}/${loc(a)}-${loc(b)}`;
  const input = ide.chat.input;
  const before = input.value.slice(0, input.cursor);
  const after = input.value.slice(input.cursor);
  const prefix = before && !/[\s]$/.test(before) ? ' ' : '';
  let suffix = '';
  if (!after || !/^\s/.test(after)) {
    suffix = ' ';
  }
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
    if (key.ctrl) {
      ide.editor.goFileStart();
    } else {
      ide.editor.goLineStart();
    }
    ide.editor.ensureCursorVisible(ide.view.code, ide.view.codeWidth);
  },
  end: (ide, key) => {
    if (key.ctrl) {
      ide.editor.goFileEnd();
    } else {
      ide.editor.goLineEnd();
    }
    ide.editor.ensureCursorVisible(ide.view.code, ide.view.codeWidth);
  },
  backspace: (ide) => {
    ide.editor.backspace(ide.view.code, ide.view.codeWidth);
  },
  delete: (ide) => ide.editor.del(ide.view.code, ide.view.codeWidth),
};

const jumpCodeSel = (ide, key) => {
  const norm = normalizeSelection(ide.selection);
  if (!norm || norm.panel !== 'code') {
    return false;
  }
  if (key.shift) {
    return false;
  }
  if (key.name === 'left') {
    ide.editor.cursorLine = norm.a.line;
    ide.editor.cursorCol = norm.a.col;
    ide.selection = null;
    ide.editor.ensureCursorVisible(ide.view.code, ide.view.codeWidth);
    return true;
  }
  if (key.name === 'right') {
    ide.editor.cursorLine = norm.b.line;
    ide.editor.cursorCol = norm.b.col;
    ide.selection = null;
    ide.editor.ensureCursorVisible(ide.view.code, ide.view.codeWidth);
    return true;
  }
  ide.selection = null;
  return false;
};

const moveCodeSel = (ide, key) => {
  if (jumpCodeSel(ide, key)) {
    return;
  }
  const before = ide.editor.cursorPos();
  const action = CODE_KEYS[key.name];
  if (action) {
    action(ide, key);
  }
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

class Ide {
  constructor(options) {
    this.workspace = options.workspace;
    this.provider = options.provider;
    this.toolRegistry = options.toolRegistry;
    this.permissions = options.permissions;
    this.maxSteps = options.maxSteps;
    this.tree = new FileTree(options.workspace.root);
    this.editor = new Editor();
    this.terminal = new Terminal(options.workspace.root);
    this.chat = new Chat();
    this.git = { name: this.tree.name, branch: '', hash: '', dirty: false };
    this.focus = 'agent';
    this.status = 'idle';
    this.pendingApproval = null;
    this.search = { active: false, query: '' };
    this.messages = null;
    this.abortController = null;
    this.done = null;
    this.view = { tree: 20, code: 20, codeWidth: 40, terminal: 10, chat: 20 };
    this.panels = null;
    this.screen = {
      chatLines: [],
      chatViewStart: 0,
      gutter: 0,
      inputY: 0,
    };
    this.selection = null;
    this.drag = null;
    this.scrollDrag = null;
    this.seqBuf = '';
    this.escTimer = null;
    this.saveTimer = null;
    this.watchTimer = null;
    this.watcher = null;
    this.ignoreWatch = false;
    this.hideTree = false;
    this.hideTerm = false;
    this.help = { active: false, stash: null };
  }

  async load() {
    await this.tree.load();
    this.git = await loadGitInfo(this.workspace.root);
    try {
      await this.editor.open(this.workspace, 'README.md');
      this.tree.selectPath('README.md');
    } catch {
      // no README.md in this workspace
    }
  }

  attach() {
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.setEncoding('utf8');
    process.stdin.resume();
    enterDisplay();
    this.abortController = new AbortController();
    const { signal } = this.abortController;
    process.stdin.on('data', (chunk) => this.handleData(chunk), { signal });
    process.stdout.on('resize', () => this.render(), { signal });
    process.on('SIGINT', () => this.stop(), { signal });
    process.on('SIGTERM', () => this.stop(), { signal });
    this.watchWorkspace();
  }

  watchWorkspace() {
    try {
      this.watcher = fs.watch(
        this.workspace.root,
        { recursive: true },
        (_event, filename) => this.onDiskEvent(filename),
      );
      this.watcher.on('error', () => {
        // ignore watch errors
      });
    } catch {
      // recursive watch is unavailable
    }
  }

  onDiskEvent(filename) {
    if (this.ignoreWatch) {
      return;
    }
    if (filename) {
      const rel = filename.toString().split(path.sep).join('/');
      if (isSkippedRel(rel)) {
        return;
      }
    }
    this.queueDiskRefresh();
  }

  queueDiskRefresh() {
    if (this.watchTimer) {
      clearTimeout(this.watchTimer);
    }
    this.watchTimer = setTimeout(() => {
      this.watchTimer = null;
      void this.refreshFromDisk();
    }, WATCH_DELAY_MS);
  }

  async refreshFromDisk() {
    await this.tree.reload();
    if (this.help.active) {
      this.render();
      return;
    }
    if (this.editor.rel && !this.editor.dirty) {
      try {
        await this.editor.open(this.workspace, this.editor.rel, true);
      } catch {
        this.editor.reset();
      }
    }
    this.render();
  }

  scheduleSave() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flushSave().then(() => this.render());
    }, SAVE_DELAY_MS);
  }

  async flushSave() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.editor.dirty) {
      return;
    }
    this.ignoreWatch = true;
    try {
      await this.editor.save(this.workspace);
    } catch (error) {
      this.chat.addNote(errorText(error), 'error');
    }
    setTimeout(() => {
      this.ignoreWatch = false;
    }, 400);
  }

  setFocus(name) {
    if (name && name !== this.focus && this.focus === 'code') {
      void this.flushSave();
    }
    if (name) {
      this.focus = name;
    }
    this.search.active = false;
  }

  detach() {
    if (this.escTimer) {
      clearTimeout(this.escTimer);
      this.escTimer = null;
    }
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.watchTimer) {
      clearTimeout(this.watchTimer);
      this.watchTimer = null;
    }
    this.watcher?.close();
    this.watcher = null;
    this.abortController?.abort();
    resetDisplay();
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdin.unref();
  }

  run() {
    return new Promise((resolve) => {
      this.done = resolve;
      this.attach();
      this.render();
    });
  }

  stop() {
    if (!this.done) return;
    if (this.pendingApproval) {
      this.pendingApproval.resolve(false);
      this.pendingApproval = null;
    }
    const done = this.done;
    this.done = null;
    void this.flushSave().finally(() => {
      this.detach();
      done();
    });
  }

  render() {
    renderFrame(this);
  }

  requestApproval(description) {
    return new Promise((resolve) => {
      this.status = 'approval';
      this.pendingApproval = { description, resolve };
      this.render();
    });
  }

  note(line) {
    const text = stripAnsi(line).trim();
    if (!text) return;
    this.chat.addNote(text, 'warn');
    this.render();
  }

  cycleFocus(dir) {
    const order = FOCUS_ORDER.filter((name) => {
      if (name === 'tree' && this.hideTree) {
        return false;
      }
      if (name === 'terminal' && this.hideTerm) {
        return false;
      }
      return true;
    });
    let index = order.indexOf(this.focus);
    if (index < 0) {
      index = 0;
    }
    const count = order.length;
    const next = (index + dir + count) % count;
    this.setFocus(order[next]);
  }

  toggleTree() {
    this.hideTree = !this.hideTree;
    if (this.hideTree) {
      this.search.active = false;
      if (this.focus === 'tree') {
        this.setFocus('code');
      }
    }
  }

  toggleTerminal() {
    this.hideTerm = !this.hideTerm;
    if (this.hideTerm) {
      if (this.focus === 'terminal') {
        this.setFocus('code');
      }
      return;
    }
    this.setFocus('terminal');
  }

  async toggleHelp() {
    if (this.help.active) {
      this.closeHelp();
      return;
    }
    await this.flushSave();
    this.help.stash = this.editor.stash();
    const text = await fs.promises.readFile(HELP_FILE, 'utf8');
    this.editor.loadText('help.md', text, 'help');
    this.help.active = true;
    this.selection = null;
    this.setFocus('code');
  }

  closeHelp() {
    if (!this.help.active) {
      return false;
    }
    this.help.active = false;
    if (this.help.stash) {
      this.editor.unstash(this.help.stash);
      this.help.stash = null;
    }
    return true;
  }

  handleData(chunk) {
    if (this.escTimer) {
      clearTimeout(this.escTimer);
      this.escTimer = null;
    }
    this.seqBuf += chunk;
    this.flushSeqBuf();
    if (this.seqBuf !== '\x1b') return;
    this.escTimer = setTimeout(() => {
      this.escTimer = null;
      if (this.seqBuf !== '\x1b') return;
      this.seqBuf = '';
      void this.handleKey({ name: 'escape' });
    }, 35);
  }

  flushSeqBuf() {
    const esc = '\x1b';
    while (this.seqBuf) {
      if (this.seqBuf === esc) return;
      if (isIncompleteSequence(this.seqBuf)) return;
      let take;
      if (this.seqBuf.startsWith(esc)) {
        take = this.takeEscape();
        if (take === 0) return;
      } else {
        const at = this.seqBuf.indexOf(esc);
        take = at === -1 ? this.seqBuf.length : at;
      }
      const piece = this.seqBuf.slice(0, take);
      this.seqBuf = this.seqBuf.slice(take);
      void this.handleKey(decodeKey(piece));
    }
  }

  takeEscape() {
    const buf = this.seqBuf;
    if (buf.startsWith('\x1b[<')) {
      const mouseEnd = buf.search(/[Mm]/);
      if (mouseEnd === -1) return 0;
      return mouseEnd + 1;
    }
    if (buf.startsWith('\x1b[')) {
      const esc = String.fromCharCode(0x1b);
      const csi = new RegExp(`^${esc}\\[[0-9;]*[A-Za-z~]`);
      const match = buf.match(csi);
      if (!match) return 0;
      return match[0].length;
    }
    if (buf.startsWith('\x1bO')) {
      if (buf.length < 3) return 0;
      return 3;
    }
    return 1;
  }

  async handleKey(key) {
    try {
      if (key.name === 'mouse') {
        await handleMouse(this, key);
        if (this.done) {
          this.render();
        }
        return;
      }
      if (key.name === 'f10') {
        this.stop();
        return;
      }
      if (key.name === 'escape' && this.closeHelp()) {
        this.render();
        return;
      }
      if (key.name === 'ctrl-c') {
        if (this.focus === 'code' || this.focus === 'agent') {
          copyFocused(this);
          this.render();
          return;
        }
        this.stop();
        return;
      }
      if (key.name === 'ctrl-v') {
        if (this.focus === 'code' && !this.editor.canEdit()) {
          return;
        }
        if (this.focus === 'code' || this.focus === 'agent') {
          await pasteInto(this);
          this.render();
        }
        return;
      }
      if (key.name === 'ctrl-z' && this.focus === 'code') {
        if (!this.editor.canEdit()) {
          return;
        }
        const changed = key.shift ? this.editor.redo() : this.editor.undo();
        if (changed) {
          this.selection = null;
          this.editor.ensureCursorVisible(this.view.code, this.view.codeWidth);
          this.scheduleSave();
        }
        this.render();
        return;
      }
      if (key.name === 'ctrl-b') {
        this.toggleTree();
        this.render();
        return;
      }
      if (key.name === 'ctrl-space') {
        this.toggleTerminal();
        this.render();
        return;
      }
      if (key.name === 'ctrl-l') {
        if (addCodeRef(this)) {
          this.render();
        }
        return;
      }
      if (this.pendingApproval) {
        this.onApprovalKey(key);
        return;
      }
      if (key.name === 'tab') {
        this.cycleFocus(key.shift ? -1 : 1);
        this.render();
        return;
      }
      if (this.search.active) {
        this.onSearchKey(key);
        return;
      }
      if (this.focus === 'tree') {
        await this.onTreeKey(key);
      } else if (this.focus === 'code') {
        this.onCodeKey(key);
      } else if (this.focus === 'terminal') {
        await this.onTerminalKey(key);
      } else {
        await this.onAgentKey(key);
      }
    } catch (error) {
      this.chat.addNote(errorText(error), 'error');
      this.render();
    }
  }

  onApprovalKey(key) {
    let ok = null;
    if (isChar(key) && (key.ch === 'y' || key.ch === 'Y')) {
      ok = true;
    }
    if (isChar(key) && (key.ch === 'n' || key.ch === 'N')) {
      ok = false;
    }
    if (key.name === 'escape') {
      ok = false;
    }
    if (ok === null) return;
    const pending = this.pendingApproval;
    this.pendingApproval = null;
    this.status = 'running';
    pending.resolve(ok);
    this.render();
  }

  onSearchKey(key) {
    if (key.name === 'escape') {
      this.search.active = false;
      this.search.query = '';
      this.tree.filter = '';
      this.render();
      return;
    }
    if (key.name === 'enter') {
      this.search.active = false;
      void this.openSelected();
      return;
    }
    if (key.name === 'up' || key.name === 'down') {
      const delta = key.name === 'up' ? -1 : 1;
      this.tree.move(delta, this.view.tree);
      this.closeHelp();
      this.render();
      return;
    }
    if (key.name === 'backspace') {
      this.search.query = this.search.query.slice(0, -1);
    } else if (isChar(key)) {
      this.search.query += key.ch;
    } else {
      return;
    }
    this.tree.filter = this.search.query;
    this.tree.selected = 0;
    this.tree.ensureSelectedVisible(this.view.tree);
    this.render();
  }

  async onTreeKey(key) {
    if (isChar(key) && key.ch === '?') {
      await this.toggleHelp();
      this.render();
      return;
    }
    if (isChar(key) && key.ch === '/') {
      this.search.active = true;
      this.search.query = this.tree.filter;
      this.render();
      return;
    }
    if (isChar(key) && key.ch === 'q') {
      this.stop();
      return;
    }
    if (key.name === 'enter') {
      await this.openSelected();
      return;
    }
    const action = TREE_KEYS[key.name];
    if (!action) return;
    action(this);
    this.closeHelp();
    this.render();
  }

  onCodeViewKey(key) {
    if (key.name === 'escape') {
      if (this.selection) {
        this.selection = null;
        this.render();
      }
      return;
    }
    if (isChar(key) && key.ch === '?') {
      void this.toggleHelp().then(() => this.render());
      return;
    }
    if (isChar(key) && key.ch === 'l') {
      this.editor.showLines = !this.editor.showLines;
      this.render();
      return;
    }
    if (isChar(key) && key.ch === 'i') {
      if (this.editor.rel && !this.editor.readOnly()) {
        this.editor.viewOnly = false;
        this.render();
      }
      return;
    }
    if (CODE_NAV.includes(key.name)) {
      moveCodeSel(this, key);
      this.render();
    }
  }

  onCodeKey(key) {
    if (this.editor.viewOnly) {
      this.onCodeViewKey(key);
      return;
    }
    if (key.name === 'escape') {
      this.editor.viewOnly = true;
      void this.flushSave().then(() => this.render());
      return;
    }
    if (key.name === 'enter') {
      deleteCodeSel(this);
      this.editor.newline();
      this.editor.ensureCursorVisible(this.view.code, this.view.codeWidth);
      this.scheduleSave();
      this.render();
      return;
    }
    if (CODE_NAV.includes(key.name)) {
      moveCodeSel(this, key);
      this.render();
      return;
    }
    if (key.name === 'backspace' || key.name === 'delete') {
      if (deleteCodeSel(this)) {
        this.editor.ensureCursorVisible(this.view.code, this.view.codeWidth);
        this.scheduleSave();
        this.render();
        return;
      }
      const action = CODE_KEYS[key.name];
      action(this);
      if (this.editor.dirty) {
        this.scheduleSave();
      }
      this.render();
      return;
    }
    if (isChar(key) && key.ch) {
      deleteCodeSel(this);
      this.editor.insert(key.ch);
      this.editor.ensureCursorVisible(this.view.code, this.view.codeWidth);
      this.scheduleSave();
      this.render();
    }
  }

  async onTerminalKey(key) {
    const input = this.terminal.input;
    if (key.name === 'enter') {
      await this.terminal.run(input.value);
      this.git = await loadGitInfo(this.workspace.root);
      this.render();
      return;
    }
    const moved = TERM_KEYS[key.name];
    if (moved) {
      moved(this);
      this.render();
      return;
    }
    if (applyInputKey(input, key)) {
      this.render();
      return;
    }
    if (isChar(key)) {
      input.insert(key.ch);
      this.render();
    }
  }

  async onAgentKey(key) {
    const input = this.chat.input;
    if (key.name === 'enter' && key.meta) {
      input.newline();
      this.render();
      return;
    }
    if (key.name === 'enter') {
      await this.submit(input.value);
      return;
    }
    const action = AGENT_KEYS[key.name];
    if (action) {
      action(this);
      this.render();
      return;
    }
    if (applyInputKey(input, key)) {
      this.render();
      return;
    }
    if (isChar(key)) {
      input.insert(key.ch);
      this.render();
    }
  }

  async openSelected() {
    this.closeHelp();
    const row = this.tree.current();
    if (!row) {
      this.render();
      return;
    }
    if (row.node.isDir) {
      this.tree.toggle();
      this.render();
      return;
    }
    await this.flushSave();
    await this.editor.open(this.workspace, row.node.rel);
    this.render();
  }

  async submit(text) {
    const task = text.trim();
    if (!task || this.status === 'running') return;
    this.chat.input.clear();
    this.chat.addUser(task);
    this.status = 'running';
    this.render();
    try {
      const result = await runAgent({
        task,
        provider: this.provider,
        toolRegistry: this.toolRegistry,
        permissions: this.permissions,
        workspace: this.workspace,
        maxSteps: this.maxSteps,
        logger: { log: () => {} },
        onEvent: (event) => this.handleEvent(event),
        priorMessages: this.messages,
      });
      this.messages = result.messages;
    } catch (error) {
      this.chat.addNote(errorText(error), 'error');
    }
    this.status = 'idle';
    await this.refreshAfterAgent();
    this.render();
  }

  async handleEvent(event) {
    if (event.type === 'step') this.chat.addStep(event);
    else if (event.type === 'assistant') this.chat.addAgent(event.text);
    else if (event.type === 'tool') await this.onToolStart(event);
    else if (event.type === 'result') await this.onToolResult(event);
    this.render();
  }

  async onToolStart(event) {
    this.chat.addTool(event.name, event.args, event.argsText);
    if (event.name === 'bash' && event.args.command) {
      this.terminal.echo(`$ ${event.args.command}`);
    }
    const rel = event.args.path;
    if (!rel || event.name !== 'read') {
      return;
    }
    await this.flushSave();
    this.closeHelp();
    try {
      await this.editor.open(this.workspace, rel);
      this.tree.selectPath(rel);
    } catch {
      // file may not exist yet
    }
  }

  async onToolResult(event) {
    const { status, name, args, preview } = event;
    this.chat.finishTool(status, name, args, preview);
    if (name === 'bash' && preview) {
      this.terminal.appendOutput(preview, 'text');
    }
    const rel = args.path;
    if (!rel || !FILE_TOOLS.includes(name) || status !== 'ok') {
      return;
    }
    this.ignoreWatch = true;
    this.closeHelp();
    if (name === 'write' || name === 'edit') {
      await this.tree.reload();
    }
    try {
      await this.editor.open(this.workspace, rel, true);
      this.tree.selectPath(rel);
    } catch {
      // path left the workspace or was deleted
    }
    setTimeout(() => {
      this.ignoreWatch = false;
    }, 400);
  }

  async refreshAfterAgent() {
    this.ignoreWatch = true;
    await this.tree.reload();
    this.git = await loadGitInfo(this.workspace.root);
    this.closeHelp();
    if (this.editor.rel) {
      try {
        await this.editor.open(this.workspace, this.editor.rel, true);
      } catch {
        this.editor.reset();
      }
    }
    setTimeout(() => {
      this.ignoreWatch = false;
    }, 400);
  }
}

module.exports = { Ide };
