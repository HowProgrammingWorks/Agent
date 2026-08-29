'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const { clamp } = require('../tui.js');
const { highlightSource } = require('./highlight.js');

const MAX_FILE_BYTES = 512 * 1024;
const MAX_UNDO = 200;
const INSERT_GROUP_MS = 500;

const splitLines = (text) => {
  if (!text) {
    return [''];
  }
  return text.split('\n');
};

class Editor {
  constructor() {
    this.rel = '';
    this.lines = [];
    this.spans = [];
    this.offset = 0;
    this.colOffset = 0;
    this.notice = '';
    this.cursorLine = 0;
    this.cursorCol = 0;
    this.showLines = false;
    this.viewOnly = true;
    this.dirty = false;
    this.savedSource = '';
    this.undoStack = [];
    this.redoStack = [];
    this.lastEdit = null;
    this.eofNewline = true;
  }

  reset() {
    this.rel = '';
    this.lines = [];
    this.spans = [];
    this.offset = 0;
    this.colOffset = 0;
    this.notice = '';
    this.cursorLine = 0;
    this.cursorCol = 0;
    this.dirty = false;
    this.savedSource = '';
    this.clearHistory();
    this.eofNewline = true;
  }

  clearHistory() {
    this.undoStack = [];
    this.redoStack = [];
    this.lastEdit = null;
  }

  snapshot() {
    return {
      lines: this.lines.slice(),
      cursorLine: this.cursorLine,
      cursorCol: this.cursorCol,
      offset: this.offset,
      colOffset: this.colOffset,
      eofNewline: this.eofNewline,
    };
  }

  restore(state) {
    this.lines = state.lines.slice();
    this.cursorLine = state.cursorLine;
    this.cursorCol = state.cursorCol;
    this.offset = state.offset;
    this.colOffset = state.colOffset;
    this.eofNewline = state.eofNewline ?? this.eofNewline;
    this.refreshSpans();
    this.syncDirty();
  }

  syncDirty() {
    if (this.readOnly() || !this.rel) {
      this.dirty = false;
      return;
    }
    this.dirty = this.source() !== this.savedSource;
  }

  beginEdit(kind) {
    if (!this.canEdit()) {
      return;
    }
    const now = Date.now();
    const sameInsert =
      kind === 'insert' &&
      this.lastEdit?.kind === 'insert' &&
      now - this.lastEdit.time < INSERT_GROUP_MS &&
      this.lastEdit.line === this.cursorLine &&
      this.lastEdit.col === this.cursorCol;
    if (!sameInsert) {
      this.undoStack.push(this.snapshot());
      if (this.undoStack.length > MAX_UNDO) {
        this.undoStack.shift();
      }
    }
    this.redoStack = [];
  }

  touchHistory(kind) {
    this.lastEdit = {
      kind,
      time: Date.now(),
      line: this.cursorLine,
      col: this.cursorCol,
    };
  }

  undo() {
    if (this.undoStack.length === 0) {
      return false;
    }
    this.redoStack.push(this.snapshot());
    this.restore(this.undoStack.pop());
    this.lastEdit = null;
    return true;
  }

  redo() {
    if (this.redoStack.length === 0) {
      return false;
    }
    this.undoStack.push(this.snapshot());
    this.restore(this.redoStack.pop());
    this.lastEdit = null;
    return true;
  }

  readOnly() {
    return (
      this.notice === 'binary file' ||
      this.notice === 'truncated' ||
      this.notice === 'help'
    );
  }

  canEdit() {
    return Boolean(this.rel) && !this.viewOnly && !this.readOnly();
  }

  source() {
    return this.lines.join('\n');
  }

  lineCount() {
    const n = this.lines.length;
    if (n === 0) {
      return 1;
    }
    if (this.lines[n - 1] === '') {
      return n;
    }
    return n + 1;
  }

  lineText(index) {
    return this.lines[index] ?? '';
  }

  materialize(index) {
    while (this.lines.length <= index) {
      this.lines.push('');
    }
  }

  refreshSpans() {
    const ext = path.extname(this.rel).slice(1);
    this.spans = highlightSource(this.lines.join('\n'), ext);
  }

  async open(workspace, rel, keepView = false) {
    const filePath = await workspace.resolveExistingFile(rel);
    const buffer = await fs.readFile(filePath);
    const prevLine = this.cursorLine;
    const prevCol = this.cursorCol;
    const prevOff = this.offset;
    const prevColOff = this.colOffset;
    this.rel = rel;
    this.dirty = false;
    if (!keepView) {
      this.offset = 0;
      this.colOffset = 0;
      this.cursorLine = 0;
      this.cursorCol = 0;
    }
    if (buffer.includes(0)) {
      this.notice = 'binary file';
      this.lines = ['[binary file]'];
      this.spans = highlightSource('[binary file]', '');
      this.savedSource = this.source();
      this.clearHistory();
      return;
    }
    let slice = buffer;
    this.notice = '';
    if (buffer.length > MAX_FILE_BYTES) {
      slice = buffer.subarray(0, MAX_FILE_BYTES);
      this.notice = 'truncated';
    }
    const text = slice.toString('utf8').replaceAll('\t', '  ');
    const ext = path.extname(rel).slice(1);
    this.eofNewline = text.endsWith('\n');
    this.lines = splitLines(text);
    this.spans = highlightSource(this.lines.join('\n'), ext);
    if (this.lines.length === 0) {
      this.lines = [''];
      this.spans = highlightSource('', ext);
    }
    if (keepView) {
      const last = Math.max(0, this.lineCount() - 1);
      this.cursorLine = clamp(prevLine, 0, last);
      const line = this.lineText(this.cursorLine);
      this.cursorCol = clamp(prevCol, 0, line.length);
      const maxOffset = Math.max(0, this.lineCount() - 1);
      this.offset = clamp(prevOff, 0, maxOffset);
      this.colOffset = Math.max(0, prevColOff);
    }
    this.savedSource = this.source();
    this.dirty = false;
    this.clearHistory();
  }

  stash() {
    return {
      rel: this.rel,
      lines: this.lines.slice(),
      cursorLine: this.cursorLine,
      cursorCol: this.cursorCol,
      offset: this.offset,
      colOffset: this.colOffset,
      notice: this.notice,
      dirty: this.dirty,
      savedSource: this.savedSource,
      viewOnly: this.viewOnly,
      eofNewline: this.eofNewline,
      undoStack: this.undoStack.slice(),
      redoStack: this.redoStack.slice(),
      lastEdit: this.lastEdit,
    };
  }

  unstash(state) {
    this.rel = state.rel;
    this.lines = state.lines.slice();
    this.cursorLine = state.cursorLine;
    this.cursorCol = state.cursorCol;
    this.offset = state.offset;
    this.colOffset = state.colOffset;
    this.notice = state.notice;
    this.dirty = state.dirty;
    this.savedSource = state.savedSource;
    this.viewOnly = state.viewOnly;
    this.eofNewline = state.eofNewline;
    this.undoStack = state.undoStack.slice();
    this.redoStack = state.redoStack.slice();
    this.lastEdit = state.lastEdit;
    this.refreshSpans();
  }

  loadText(rel, text, notice = '') {
    this.rel = rel;
    this.notice = notice;
    this.viewOnly = true;
    this.eofNewline = text.endsWith('\n');
    this.lines = splitLines(text);
    if (this.lines.length === 0) {
      this.lines = [''];
    }
    this.offset = 0;
    this.colOffset = 0;
    this.cursorLine = 0;
    this.cursorCol = 0;
    this.dirty = false;
    this.savedSource = this.source();
    this.clearHistory();
    this.refreshSpans();
  }

  markDirty() {
    if (!this.canEdit()) return;
    this.dirty = true;
    this.eofNewline = this.lines[this.lines.length - 1] === '';
    this.refreshSpans();
  }

  insert(text) {
    if (!this.canEdit()) return;
    const kind = text === '\n' ? 'newline' : 'insert';
    this.beginEdit(kind);
    this.materialize(this.cursorLine);
    const chunks = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    const parts = chunks.split('\n');
    for (let index = 0; index < parts.length; index += 1) {
      if (index > 0) {
        const line = this.lines[this.cursorLine] ?? '';
        const before = line.slice(0, this.cursorCol);
        const after = line.slice(this.cursorCol);
        this.lines[this.cursorLine] = before;
        this.lines.splice(this.cursorLine + 1, 0, after);
        this.cursorLine += 1;
        this.cursorCol = 0;
      }
      const piece = parts[index];
      if (!piece) {
        continue;
      }
      const line = this.lines[this.cursorLine] ?? '';
      const before = line.slice(0, this.cursorCol);
      const after = line.slice(this.cursorCol);
      this.lines[this.cursorLine] = `${before}${piece}${after}`;
      this.cursorCol += piece.length;
    }
    this.markDirty();
    this.touchHistory(kind);
  }

  newline() {
    this.insert('\n');
  }

  backspace(viewHeight, viewWidth) {
    if (!this.canEdit()) return;
    if (this.cursorLine >= this.lines.length) {
      this.cursorLine = Math.max(0, this.lines.length - 1);
      this.cursorCol = this.lineText(this.cursorLine).length;
      this.ensureCursorVisible(viewHeight, viewWidth);
      return;
    }
    if (this.cursorCol > 0) {
      this.beginEdit('backspace');
      const line = this.lines[this.cursorLine] ?? '';
      const before = line.slice(0, this.cursorCol - 1);
      const after = line.slice(this.cursorCol);
      this.lines[this.cursorLine] = `${before}${after}`;
      this.cursorCol -= 1;
    } else if (this.cursorLine > 0) {
      this.beginEdit('backspace');
      const prev = this.lines[this.cursorLine - 1];
      const cur = this.lines[this.cursorLine];
      this.cursorCol = prev.length;
      this.lines[this.cursorLine - 1] = `${prev}${cur}`;
      this.lines.splice(this.cursorLine, 1);
      this.cursorLine -= 1;
    } else {
      return;
    }
    this.markDirty();
    this.touchHistory('backspace');
    this.ensureCursorVisible(viewHeight, viewWidth);
  }

  del(viewHeight, viewWidth) {
    if (!this.canEdit()) return;
    const line = this.lines[this.cursorLine] ?? '';
    if (this.cursorCol < line.length) {
      this.beginEdit('delete');
      const before = line.slice(0, this.cursorCol);
      const after = line.slice(this.cursorCol + 1);
      this.lines[this.cursorLine] = `${before}${after}`;
    } else if (this.cursorLine < this.lines.length - 1) {
      this.beginEdit('delete');
      const next = this.lines[this.cursorLine + 1];
      this.lines[this.cursorLine] = `${line}${next}`;
      this.lines.splice(this.cursorLine + 1, 1);
    } else {
      return;
    }
    this.markDirty();
    this.touchHistory('delete');
    this.ensureCursorVisible(viewHeight, viewWidth);
  }

  async save(workspace) {
    if (!this.rel || !this.dirty || this.readOnly()) return false;
    const filePath = await workspace.resolveWritableFile(this.rel);
    await fs.writeFile(filePath, this.source(), 'utf8');
    this.savedSource = this.source();
    this.dirty = false;
    return true;
  }

  cursorPos() {
    return { line: this.cursorLine, col: this.cursorCol };
  }

  deleteRange(a, b) {
    if (!this.canEdit()) {
      return;
    }
    this.beginEdit('delete');
    if (a.line === b.line) {
      this.materialize(a.line);
      const line = this.lines[a.line] ?? '';
      this.lines[a.line] = `${line.slice(0, a.col)}${line.slice(b.col)}`;
    } else {
      const first = (this.lines[a.line] ?? '').slice(0, a.col);
      const last = (this.lines[b.line] ?? '').slice(b.col);
      this.lines.splice(a.line, b.line - a.line + 1, `${first}${last}`);
    }
    this.cursorLine = a.line;
    this.cursorCol = a.col;
    this.markDirty();
    this.touchHistory('delete');
  }

  move(delta, viewHeight) {
    const maxOffset = Math.max(0, this.lineCount() - viewHeight);
    this.offset = clamp(this.offset + delta, 0, maxOffset);
  }

  moveCol(delta, viewWidth) {
    this.colOffset = clamp(
      this.colOffset + delta,
      0,
      this.maxColOffset(viewWidth),
    );
  }

  maxCol() {
    let max = 0;
    for (const line of this.lines) {
      if (line.length > max) {
        max = line.length;
      }
    }
    return max;
  }

  cols() {
    return Math.max(this.maxCol(), this.cursorCol) + 1;
  }

  maxColOffset(viewWidth) {
    return Math.max(0, this.cols() - viewWidth);
  }

  moveCursor(dLine, dCol, viewHeight, viewWidth) {
    const last = Math.max(0, this.lineCount() - 1);
    this.cursorLine = clamp(this.cursorLine + dLine, 0, last);
    const line = this.lineText(this.cursorLine);
    this.cursorCol = clamp(this.cursorCol + dCol, 0, line.length);
    this.ensureCursorVisible(viewHeight, viewWidth);
  }

  goLineStart() {
    this.cursorCol = 0;
  }

  goLineEnd() {
    const line = this.lineText(this.cursorLine);
    this.cursorCol = line.length;
  }

  goFileStart() {
    this.cursorLine = 0;
    this.cursorCol = 0;
  }

  goFileEnd() {
    const last = Math.max(0, this.lineCount() - 1);
    this.cursorLine = last;
    this.cursorCol = this.lineText(last).length;
  }

  ensureCursorVisible(viewHeight, viewWidth) {
    if (this.cursorLine < this.offset) {
      this.offset = this.cursorLine;
    }
    const last = this.offset + viewHeight - 1;
    if (this.cursorLine > last) {
      this.offset = this.cursorLine - viewHeight + 1;
    }
    this.ensureVisible(viewHeight, viewWidth);
    if (typeof viewWidth !== 'number') {
      return;
    }
    if (this.cursorCol < this.colOffset) {
      this.colOffset = this.cursorCol;
    }
    const lastCol = this.colOffset + viewWidth - 1;
    if (this.cursorCol > lastCol) {
      this.colOffset = this.cursorCol - viewWidth + 1;
    }
    this.ensureColVisible(viewWidth);
  }

  ensureVisible(viewHeight, viewWidth) {
    const maxOffset = Math.max(0, this.lineCount() - viewHeight);
    this.offset = clamp(this.offset, 0, maxOffset);
    if (typeof viewWidth === 'number') {
      this.ensureColVisible(viewWidth);
    }
  }

  ensureColVisible(viewWidth) {
    this.colOffset = clamp(this.colOffset, 0, this.maxColOffset(viewWidth));
  }
}

module.exports = { Editor };
