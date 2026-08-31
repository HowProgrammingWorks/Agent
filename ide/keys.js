'use strict';

const SIMPLE = {
  '\x00': { name: 'ctrl-space' },
  '\x1b': { name: 'escape' },
  '\x02': { name: 'ctrl-b' },
  '\x03': { name: 'ctrl-c' },
  '\x0c': { name: 'ctrl-l' },
  '\x16': { name: 'ctrl-v' },
  '\x1a': { name: 'ctrl-z' },
  '\r': { name: 'enter' },
  '\n': { name: 'enter' },
  '\x7f': { name: 'backspace' },
  '\b': { name: 'backspace' },
  '\t': { name: 'tab' },
};

const CSI = {
  A: 'up',
  B: 'down',
  C: 'right',
  D: 'left',
  H: 'home',
  F: 'end',
  '5~': 'pageup',
  '6~': 'pagedown',
  '1~': 'home',
  '4~': 'end',
  '7~': 'home',
  '8~': 'end',
  '3~': 'delete',
  '21~': 'f10',
};

const ESC = String.fromCharCode(0x1b);
const MOUSE_RE = new RegExp(`^${ESC}\\[<(\\d+);(\\d+);(\\d+)([Mm])$`);
const CSI_RE = new RegExp(`^${ESC}\\[[0-9;]*[A-Za-z~]`);

const CTRL_NAMES = {
  32: 'ctrl-space',
  66: 'ctrl-b',
  67: 'ctrl-c',
  76: 'ctrl-l',
  86: 'ctrl-v',
  90: 'ctrl-z',
  98: 'ctrl-b',
  99: 'ctrl-c',
  108: 'ctrl-l',
  118: 'ctrl-v',
  122: 'ctrl-z',
};

const decodeMouse = (s) => {
  const match = s.match(MOUSE_RE);
  if (!match) return null;
  const button = Number(match[1]);
  const col = Number(match[2]);
  const row = Number(match[3]);
  const release = match[4] === 'm';
  return { name: 'mouse', button, col, row, release };
};

const modsOf = (param) => {
  if (!param || param <= 1) return {};
  const bits = param - 1;
  const shift = (bits & 1) !== 0;
  const alt = (bits & 2) !== 0;
  const ctrl = (bits & 4) !== 0;
  return { shift, alt, ctrl };
};

const ctrlKey = (code, mods) => {
  if (!mods.ctrl) return null;
  const name = CTRL_NAMES[code];
  if (!name) return null;
  return { name, ...mods };
};

const decodeCsi = (s) => {
  if (!s.startsWith(`${ESC}[`)) return null;
  const seq = s.slice(2);
  if (seq === 'Z') return { name: 'tab', shift: true };
  if (CSI[seq]) return { name: CSI[seq] };
  const otherKey = seq.match(/^27;(\d+);(\d+)~$/);
  if (otherKey) {
    const code = Number(otherKey[2]);
    const mods = modsOf(Number(otherKey[1]));
    return ctrlKey(code, mods);
  }
  const csiU = seq.match(/^(\d+);(\d+)u$/);
  if (csiU) {
    const code = Number(csiU[1]);
    const mods = modsOf(Number(csiU[2]));
    return ctrlKey(code, mods);
  }
  const modLetter = seq.match(/^(\d+);(\d+)([A-Z])$/);
  if (modLetter) {
    const name = CSI[modLetter[3]];
    if (!name) return null;
    return { name, ...modsOf(Number(modLetter[2])) };
  }
  const modTilde = seq.match(/^(\d+);(\d+)~$/);
  if (modTilde) {
    const name = CSI[`${modTilde[1]}~`];
    if (!name) return null;
    return { name, ...modsOf(Number(modTilde[2])) };
  }
  const bare = seq.replace(/^\d+(?:;\d+)?([A-Z~])$/, '$1');
  if (CSI[bare]) return { name: CSI[bare] };
  return null;
};

const decodeKey = (buf) => {
  const s = typeof buf === 'string' ? buf : buf.toString('utf8');
  if (SIMPLE[s]) return SIMPLE[s];
  if (s === `${ESC}\r` || s === `${ESC}\n`) {
    return { name: 'enter', meta: true };
  }
  const mouse = decodeMouse(s);
  if (mouse) return mouse;
  const csi = decodeCsi(s);
  if (csi) return csi;
  if (s.startsWith(`${ESC}O`) && CSI[s[2]]) return { name: CSI[s[2]] };
  if (s.length === 1) return { name: 'char', ch: s };
  if (s.length > 1 && !s.startsWith(ESC)) return { name: 'char', ch: s };
  return { name: 'unknown', raw: s };
};

const isIncompleteSequence = (s) => {
  if (!s.startsWith(ESC)) return false;
  if (s === ESC) return true;
  if (s === `${ESC}[`) return true;
  if (s.startsWith(`${ESC}[<`)) return !/[Mm]$/.test(s);
  if (s.startsWith(`${ESC}[`)) return !/[A-Za-z~]$/.test(s);
  if (s.startsWith(`${ESC}O`)) return s.length < 3;
  return false;
};

const takeEscape = (buf) => {
  if (buf.startsWith(`${ESC}[<`)) {
    const mouseEnd = buf.search(/[Mm]/);
    if (mouseEnd === -1) return 0;
    return mouseEnd + 1;
  }
  if (buf.startsWith(`${ESC}[`)) {
    const match = buf.match(CSI_RE);
    if (!match) return 0;
    return match[0].length;
  }
  if (buf.startsWith(`${ESC}O`)) {
    if (buf.length < 3) return 0;
    return 3;
  }
  return 1;
};

const takeSequence = (buf) => {
  if (!buf || buf === ESC) return null;
  if (isIncompleteSequence(buf)) return null;
  let take;
  if (buf.startsWith(ESC)) {
    take = takeEscape(buf);
    if (take === 0) return null;
  } else {
    const at = buf.indexOf(ESC);
    take = at === -1 ? buf.length : at;
  }
  return { piece: buf.slice(0, take), rest: buf.slice(take) };
};

module.exports = { decodeKey, takeSequence };
