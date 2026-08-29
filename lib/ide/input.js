'use strict';

class Input {
  constructor() {
    this.value = '';
    this.cursor = 0;
    this.anchor = null;
  }

  hasSelection() {
    return this.anchor !== null && this.anchor !== this.cursor;
  }

  range() {
    if (!this.hasSelection()) {
      return null;
    }
    const from = Math.min(this.anchor, this.cursor);
    const to = Math.max(this.anchor, this.cursor);
    return { from, to };
  }

  selectedText() {
    const span = this.range();
    if (!span) {
      return '';
    }
    return this.value.slice(span.from, span.to);
  }

  clearSelection() {
    this.anchor = null;
  }

  deleteSelection() {
    const span = this.range();
    if (!span) {
      return false;
    }
    const left = this.value.slice(0, span.from);
    const right = this.value.slice(span.to);
    this.value = `${left}${right}`;
    this.cursor = span.from;
    this.anchor = null;
    return true;
  }

  goTo(index, select) {
    if (select) {
      if (this.anchor === null) {
        this.anchor = this.cursor;
      }
    } else {
      this.anchor = null;
    }
    const max = this.value.length;
    this.cursor = Math.max(0, Math.min(index, max));
  }

  move(delta, select) {
    if (!select && this.hasSelection()) {
      const span = this.range();
      this.cursor = delta < 0 ? span.from : span.to;
      this.anchor = null;
      return;
    }
    this.goTo(this.cursor + delta, select);
  }

  insert(text) {
    this.deleteSelection();
    const before = this.value.slice(0, this.cursor);
    const after = this.value.slice(this.cursor);
    this.value = `${before}${text}${after}`;
    this.cursor += text.length;
  }

  newline() {
    this.insert('\n');
  }

  backspace() {
    if (this.deleteSelection()) {
      return;
    }
    if (this.cursor === 0) {
      return;
    }
    const before = this.value.slice(0, this.cursor - 1);
    const after = this.value.slice(this.cursor);
    this.value = `${before}${after}`;
    this.cursor -= 1;
  }

  del() {
    if (this.deleteSelection()) {
      return;
    }
    const before = this.value.slice(0, this.cursor);
    const after = this.value.slice(this.cursor + 1);
    this.value = `${before}${after}`;
  }

  left(select) {
    this.move(-1, select);
  }

  right(select) {
    this.move(1, select);
  }

  home(select) {
    const before = this.value.slice(0, this.cursor);
    const lineStart = before.lastIndexOf('\n') + 1;
    this.goTo(lineStart, select);
  }

  end(select) {
    const fromCursor = this.value.indexOf('\n', this.cursor);
    const lineEnd = fromCursor < 0 ? this.value.length : fromCursor;
    this.goTo(lineEnd, select);
  }

  up(select) {
    const { col } = this.currentLine();
    const before = this.value.slice(0, this.cursor);
    const lineStart = before.lastIndexOf('\n') + 1;
    if (lineStart === 0) {
      this.goTo(this.cursor, select);
      return;
    }
    const prevBreak = this.value.lastIndexOf('\n', lineStart - 2);
    const prevStart = prevBreak + 1;
    const prevLen = lineStart - 1 - prevStart;
    this.goTo(prevStart + Math.min(col, prevLen), select);
  }

  down(select) {
    const { col } = this.currentLine();
    const lineEnd = this.value.indexOf('\n', this.cursor);
    if (lineEnd < 0) {
      this.goTo(this.cursor, select);
      return;
    }
    const nextStart = lineEnd + 1;
    const nextEnd = this.value.indexOf('\n', nextStart);
    const nextLen = (nextEnd < 0 ? this.value.length : nextEnd) - nextStart;
    this.goTo(nextStart + Math.min(col, nextLen), select);
  }

  clear() {
    this.value = '';
    this.cursor = 0;
    this.anchor = null;
  }

  currentLine() {
    const before = this.value.slice(0, this.cursor);
    const lineStart = before.lastIndexOf('\n') + 1;
    const lineEnd = this.value.indexOf('\n', this.cursor);
    const end = lineEnd < 0 ? this.value.length : lineEnd;
    return {
      text: this.value.slice(lineStart, end),
      col: this.cursor - lineStart,
      start: lineStart,
    };
  }
}

module.exports = { Input };
