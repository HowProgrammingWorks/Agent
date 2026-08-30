'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { delay } = require('metautil');

const { errorText, runAgent } = require('../agent.js');
const { loadGitInfo } = require('../git.js');
const tui = require('../tui.js');
const { enterDisplay, resetDisplay, stripAnsi } = tui;
const binds = require('./binds.js');
const {
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
} = binds;
const { isChar, applyInputKey, deleteCodeSel, moveCodeSel, commitCode } = binds;
const { Chat } = require('./chat.js');
const { Editor } = require('./editor.js');
const { decodeKey, takeSequence } = require('./keys.js');
const { handleMouse, PANEL_ORDER } = require('./mouse.js');
const { renderFrame } = require('./render.js');
const { FileTree, isSkippedRel } = require('./tree.js');
const { Terminal } = require('./terminal.js');

const HELP_FILE = path.join(__dirname, 'help.md');
const SAVE_DELAY_MS = 800;
const WATCH_DELAY_MS = 200;
const WATCH_IGNORE_MS = 400;

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
    this.screen = { chatLines: [], chatViewStart: 0, gutter: 0, inputY: 0 };
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
      if (isSkippedRel(rel)) return;
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
    this.resumeWatchSoon();
  }

  resumeWatchSoon() {
    void delay(WATCH_IGNORE_MS).then(() => {
      this.ignoreWatch = false;
    });
  }

  setFocus(name) {
    if (name && name !== this.focus && this.focus === 'code') {
      void this.flushSave();
    }
    if (name) this.focus = name;
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
    return void renderFrame(this);
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
    const hidden = { tree: this.hideTree, terminal: this.hideTerm };
    const order = PANEL_ORDER.filter((name) => !hidden[name]);
    let index = order.indexOf(this.focus);
    if (index < 0) index = 0;
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
    if (!this.help.active) return false;
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
    while (this.seqBuf) {
      const next = takeSequence(this.seqBuf);
      if (!next) return;
      this.seqBuf = next.rest;
      void this.handleKey(decodeKey(next.piece));
    }
  }

  async handleKey(key) {
    try {
      if (key.name === 'mouse') {
        await handleMouse(this, key);
        if (this.done) this.render();
        return;
      }
      const global = GLOBAL_KEYS[key.name];
      if (global) {
        const handled = await global(this, key);
        if (handled) return;
      }
      if (this.pendingApproval) return void this.onApprovalKey(key);
      if (key.name === 'tab') {
        this.cycleFocus(key.shift ? -1 : 1);
        this.render();
        return;
      }
      if (this.search.active) return void this.onSearchKey(key);
      const focused = FOCUS_KEYS[this.focus] ?? FOCUS_KEYS.agent;
      await focused(this, key);
    } catch (error) {
      this.chat.addNote(errorText(error), 'error');
      this.render();
    }
  }

  onApprovalKey(key) {
    let ok = null;
    if (isChar(key) && APPROVE_CH[key.ch] !== undefined) {
      ok = APPROVE_CH[key.ch];
    } else if (key.name === 'escape') {
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
    if (isChar(key) && TREE_CHARS[key.ch]) {
      await TREE_CHARS[key.ch](this);
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
    if (CODE_NAV.includes(key.name)) {
      moveCodeSel(this, key);
      this.render();
    }
  }

  onCodeKey(key) {
    if (!this.editor.canEdit()) return void this.onCodeViewKey(key);
    if (key.name === 'escape') {
      if (this.selection) {
        this.selection = null;
        this.render();
      }
      return;
    }
    if (key.name === 'enter') {
      deleteCodeSel(this);
      this.editor.newline();
      commitCode(this);
      return;
    }
    if (CODE_NAV.includes(key.name)) {
      moveCodeSel(this, key);
      this.render();
      return;
    }
    if (key.name === 'backspace' || key.name === 'delete') {
      if (deleteCodeSel(this)) {
        commitCode(this);
        return;
      }
      const action = CODE_KEYS[key.name];
      action(this);
      commitCode(this);
      return;
    }
    if (isChar(key) && key.ch) {
      deleteCodeSel(this);
      this.editor.insert(key.ch);
      commitCode(this);
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
    const handle = EVENT_HANDLERS[event.type];
    if (handle) await handle(this, event);
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
    this.resumeWatchSoon();
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
    this.resumeWatchSoon();
  }
}

const startIde = async (options) => {
  const ide = new Ide(options);
  options.bindAsk?.((description) => ide.requestApproval(description));
  options.bindLogger?.((line) => ide.note(line));
  await ide.load();
  await ide.run();
};

module.exports = { startIde };
