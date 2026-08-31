'use strict';

const { clamp, write, colors, RESET } = require('./tui.js');

const BAR_W = 2;

const clampOffset = (topOffset, total, view) => {
  const maxOffset = Math.max(0, total - view);
  return { maxOffset, offset: clamp(topOffset, 0, maxOffset) };
};

const SET_OFFSET = {
  tree: (ide, topOffset) => {
    const total = ide.tree.visible().length;
    const { offset } = clampOffset(topOffset, total, ide.view.tree);
    ide.tree.offset = offset;
  },
  code: (ide, topOffset) => {
    const total = ide.editor.lineCount();
    const { offset } = clampOffset(topOffset, total, ide.view.code);
    ide.editor.offset = offset;
  },
  terminal: (ide, topOffset) => {
    const total = ide.terminal.lines.length;
    const { maxOffset, offset } = clampOffset(
      topOffset,
      total,
      ide.view.terminal,
    );
    ide.terminal.offset = maxOffset - offset;
  },
  agent: (ide, topOffset) => {
    const total = (ide.screen.chatLines ?? []).length;
    const { maxOffset, offset } = clampOffset(topOffset, total, ide.view.chat);
    ide.chat.offset = maxOffset - offset;
  },
};

const thumbMetrics = (bar) => {
  const total = bar.total;
  const view = bar.view;
  const topOffset = bar.topOffset;
  const trackH = bar.h;
  const { maxOffset, offset } = clampOffset(topOffset, total, view);
  if (trackH <= 0) return { thumbTop: 0, thumbH: 0, maxOffset, offset };
  if (maxOffset === 0) {
    return { thumbTop: 0, thumbH: trackH, maxOffset, offset };
  }
  const ratio = view / Math.max(1, total);
  const thumbH = Math.max(1, Math.round(ratio * trackH));
  const room = Math.max(0, trackH - thumbH);
  const thumbTop = Math.round((offset / maxOffset) * room);
  return { thumbTop, thumbH, maxOffset, offset };
};

const offsetFromY = (bar, y) => {
  if (!bar || bar.h <= 1 || bar.maxOffset <= 0) return 0;
  const local = clamp(y - bar.y, 0, bar.h - 1);
  return Math.round((local / (bar.h - 1)) * bar.maxOffset);
};

const grabFromY = (bar, y) => {
  if (!bar || bar.maxOffset <= 0) return null;
  const { thumbTop, thumbH } = thumbMetrics(bar);
  const local = y - bar.y;
  if (local < thumbTop || local >= thumbTop + thumbH) return null;
  return local - thumbTop;
};

const offsetFromThumb = (bar, y, grab) => {
  const { thumbH } = thumbMetrics(bar);
  const room = Math.max(0, bar.h - thumbH);
  if (room <= 0) return 0;
  const local = y - bar.y;
  const thumbTop = clamp(local - grab, 0, room);
  return Math.round((thumbTop / room) * bar.maxOffset);
};

const storeBar = (ide, name, panel, options) => {
  const y0 = options.y0 ?? 0;
  const height = options.height ?? panel.h;
  const total = options.total;
  const view = options.view;
  const h = Math.max(0, height);
  const maxOffset = Math.max(0, total - view);
  const topOffset = clamp(options.topOffset, 0, maxOffset);
  const x = panel.x + panel.w - BAR_W;
  const w = BAR_W;
  const y = panel.y + y0;
  const bar = { name, x, w, y, h, total, view, topOffset, maxOffset };
  ide.screen.scrolls ||= {};
  ide.screen.scrolls[name] = bar;
  return bar;
};

const rowBg = (bar, index) => {
  const { thumbTop, thumbH } = thumbMetrics(bar);
  const onThumb = index >= thumbTop && index < thumbTop + thumbH;
  return onThumb ? colors.background.scroll : colors.background.scrollTrack;
};

const paintBar = (bar) => {
  if (!bar || bar.h <= 0 || bar.maxOffset <= 0) return;
  for (let index = 0; index < bar.h; index += 1) {
    const cell = `${rowBg(bar, index)}${' '.repeat(BAR_W)}${RESET}`;
    write(bar.x, bar.y + index, cell);
  }
};

const overlayAt = (bar, y, fg) => {
  if (!bar || bar.maxOffset <= 0) return { w: 0 };
  if (y < bar.y || y >= bar.y + bar.h) return { w: 0 };
  return { w: BAR_W, bg: rowBg(bar, y - bar.y), fg };
};

const hitBar = (ide, name, x, y) => {
  const bar = ide.screen.scrolls?.[name];
  if (!bar) return false;
  if (bar.maxOffset <= 0) return false;
  if (x < bar.x || x >= bar.x + bar.w) return false;
  if (y < bar.y || y >= bar.y + bar.h) return false;
  return true;
};

const barAt = (ide, x, y) => {
  const scrolls = ide.screen.scrolls || {};
  const names = Object.keys(scrolls);
  for (const name of names) {
    if (hitBar(ide, name, x, y)) return name;
  }
  return null;
};

const applyTopOffset = (ide, name, topOffset) => {
  const apply = SET_OFFSET[name];
  if (apply) apply(ide, topOffset);
};

const applyBarY = (ide, name, y, grab) => {
  const bar = ide.screen.scrolls?.[name];
  if (!bar) return;
  if (grab === null || grab === undefined) {
    applyTopOffset(ide, name, offsetFromY(bar, y));
    return;
  }
  applyTopOffset(ide, name, offsetFromThumb(bar, y, grab));
};

module.exports = {
  BAR_W,
  storeBar,
  paintBar,
  overlayAt,
  barAt,
  grabFromY,
  applyBarY,
};
