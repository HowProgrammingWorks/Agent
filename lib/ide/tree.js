'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const { fileExt } = require('metautil');

const { SKIP_NAMES } = require('../skip.js');
const { clamp } = require('../tui.js');

const MAX_TREE_NODES = 4000;

const BADGES = {
  js: { label: 'js', tone: 'yellow' },
  mjs: { label: 'js', tone: 'yellow' },
  cjs: { label: 'js', tone: 'yellow' },
  jsx: { label: 'js', tone: 'yellow' },
  ts: { label: 'ts', tone: 'blue' },
  mts: { label: 'ts', tone: 'blue' },
  cts: { label: 'ts', tone: 'blue' },
  tsx: { label: 'ts', tone: 'blue' },
  json: { label: '{}', tone: 'orange' },
  jsonc: { label: '{}', tone: 'orange' },
  cs: { label: 'c#', tone: 'purple' },
  kt: { label: 'kt', tone: 'magenta' },
  kts: { label: 'kt', tone: 'magenta' },
  go: { label: 'go', tone: 'cyan' },
};

const FILE_EMOJI = {
  html: '🌐',
  htm: '🌐',
  css: '🎨',
  xml: '🔧',
  csv: '📑',
  tsv: '📑',
  yml: '⚙️ ',
  yaml: '⚙️ ',
  ini: '⚙️ ',
  md: '⬇️ ',
  mdx: '⬇️ ',
  txt: '📄',
  rst: '📄',
  sh: '🐚',
  bash: '🐚',
  zsh: '🐚',
  py: '🐍',
  rb: '💎',
  rs: '🦀',
  java: '☕ ',
  php: '🐘',
  swift: '🟠',
  dart: '🎯',
  c: '🔷',
  h: '🔷',
  cc: '🔷',
  cpp: '🔷',
  sql: '🗃️ ',
  wasm: '🧊',
  bin: '📦',
  svg: '✒️ ',
  png: '🌄',
  jpg: '🌄',
  jpeg: '🌄',
  gif: '🌄',
  webp: '🌄',
  ico: '🌄',
  mp3: '🎵',
  wav: '🎵',
  ogg: '🎵',
  mp4: '🎬',
  webm: '🎬',
  mov: '🎬',
  zip: '📦',
  tar: '📦',
  gz: '📦',
  tgz: '📦',
  rar: '📦',
  '7z': '📦',
  env: '🔐',
  pem: '🔑',
  key: '🔑',
  cert: '🔐',
  crt: '🔐',
  lock: '🔒',
};

const NAME_EMOJI = {
  '.gitignore': '🙈',
  '.gitattributes': '🙈',
  '.gitmodules': '🙈',
  '.env': '🔐',
  Dockerfile: '🐳',
  Makefile: '🔨',
  'package.json': '📦',
  'package-lock.json': '📦',
};

const LICENSE_NAMES = [
  'license',
  'licence',
  'copying',
  'unlicense',
  'copyright',
];

const isLicenseName = (name) => {
  const lower = name.toLowerCase();
  if (LICENSE_NAMES.includes(lower)) {
    return true;
  }
  const stem = lower.split('.')[0];
  return LICENSE_NAMES.includes(stem);
};

const padIconGap = (icon) => {
  if (icon.endsWith(' ')) return icon;
  if (icon.includes('\uFE0F')) return `${icon} `;
  return icon;
};

const extOf = (name) => (name.includes('.') ? fileExt(name) : '');

const nodeIcon = (node, open) => {
  if (node.isDir) {
    const shown = open ?? node.expanded;
    return padIconGap(shown ? '📂' : '📁');
  }
  if (isLicenseName(node.name)) {
    return padIconGap('⚖️ ');
  }
  if (NAME_EMOJI[node.name]) {
    return padIconGap(NAME_EMOJI[node.name]);
  }
  if (node.name.startsWith('.')) {
    if (node.name.startsWith('.env')) {
      return padIconGap('🔐');
    }
    if (node.name.startsWith('.git')) {
      return padIconGap('🙈');
    }
    return padIconGap('⚫');
  }
  const ext = extOf(node.name);
  const badge = BADGES[ext];
  if (badge) {
    return badge.label;
  }
  if (FILE_EMOJI[ext]) {
    return padIconGap(FILE_EMOJI[ext]);
  }
  if (!ext) {
    return padIconGap('📃');
  }
  return padIconGap('📄');
};

const nodeIconTone = (node) => {
  if (node.isDir) {
    return null;
  }
  if (isLicenseName(node.name) || NAME_EMOJI[node.name]) {
    return null;
  }
  if (node.name.startsWith('.')) {
    return null;
  }
  const ext = extOf(node.name);
  return BADGES[ext]?.tone ?? null;
};

const isSkippedRel = (rel) => {
  const parts = (rel ?? '').split(/[/\\]/);
  for (const part of parts) {
    if (SKIP_NAMES.includes(part)) return true;
  }
  return false;
};

const compareNode = (a, b) => {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
  return a.name.localeCompare(b.name);
};

const readTree = async (absDir, relDir, state) => {
  if (state.count >= MAX_TREE_NODES) return [];
  let dirents;
  try {
    dirents = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return []; // unreadable directory
  }
  const nodes = [];
  for (const dirent of dirents) {
    if (SKIP_NAMES.includes(dirent.name)) continue;
    if (state.count >= MAX_TREE_NODES) break;
    const rel = relDir ? `${relDir}/${dirent.name}` : dirent.name;
    const dir = dirent.isDirectory();
    state.count += 1;
    const node = {
      name: dirent.name,
      rel,
      isDir: dir,
      expanded: false,
      children: null,
    };
    if (dir) {
      const abs = path.join(absDir, dirent.name);
      node.children = await readTree(abs, rel, state);
    }
    nodes.push(node);
  }
  nodes.sort(compareNode);
  return nodes;
};

const nodeMatches = (node, query) => {
  if (node.name.toLowerCase().includes(query)) return true;
  if (!node.children) return false;
  return node.children.some((child) => nodeMatches(child, query));
};

const collectExpanded = (nodes, rels) => {
  for (const node of nodes) {
    if (node.isDir && node.expanded) rels.add(node.rel);
    if (node.children) collectExpanded(node.children, rels);
  }
};

const restoreExpanded = (nodes, rels) => {
  for (const node of nodes) {
    if (node.isDir && rels.has(node.rel)) node.expanded = true;
    if (node.children) restoreExpanded(node.children, rels);
  }
};

class FileTree {
  constructor(root) {
    this.root = root;
    this.name = path.basename(root);
    this.nodes = [];
    this.selected = 0;
    this.offset = 0;
    this.viewH = 0;
    this.filter = '';
  }

  async load() {
    const state = { count: 0 };
    this.nodes = await readTree(this.root, '', state);
    this.selected = 0;
    this.offset = 0;
  }

  async reload() {
    const rels = new Set();
    collectExpanded(this.nodes, rels);
    const current = this.current();
    const selectedRel = current?.node.rel;
    const state = { count: 0 };
    this.nodes = await readTree(this.root, '', state);
    restoreExpanded(this.nodes, rels);
    if (selectedRel) this.selectPath(selectedRel);
  }

  visible() {
    const rows = [];
    const query = this.filter.toLowerCase();
    const walk = (nodes, depth) => {
      for (const node of nodes) {
        const show = !query || nodeMatches(node, query);
        if (!show) continue;
        rows.push({ node, depth });
        const open = node.isDir && (node.expanded || query);
        if (open && node.children) walk(node.children, depth + 1);
      }
    };
    walk(this.nodes, 0);
    return rows;
  }

  current() {
    const rows = this.visible();
    return rows[this.selected] ?? null;
  }

  move(delta, viewHeight) {
    const count = this.visible().length;
    if (count === 0) {
      this.selected = 0;
      return;
    }
    this.selected = clamp(this.selected + delta, 0, count - 1);
    this.ensureSelectedVisible(viewHeight);
  }

  toggle() {
    const row = this.current();
    if (!row || !row.node.isDir) return false;
    row.node.expanded = !row.node.expanded;
    return true;
  }

  expand() {
    const row = this.current();
    if (!row || !row.node.isDir) return;
    row.node.expanded = true;
  }

  collapse() {
    const row = this.current();
    if (!row || !row.node.isDir) return;
    row.node.expanded = false;
  }

  selectPath(rel) {
    const parts = rel.split('/');
    let nodes = this.nodes;
    for (const part of parts) {
      const next = nodes.find((item) => item.name === part);
      if (!next) return;
      if (next.isDir) {
        next.expanded = true;
        nodes = next.children ?? [];
      }
    }
    const rows = this.visible();
    const index = rows.findIndex((row) => row.node.rel === rel);
    if (index >= 0) {
      this.selected = index;
    }
    this.ensureSelectedVisible(this.viewH);
  }

  ensureVisible(viewHeight) {
    this.viewH = viewHeight;
    const count = this.visible().length;
    const maxOffset = Math.max(0, count - viewHeight);
    this.offset = clamp(this.offset, 0, maxOffset);
  }

  ensureSelectedVisible(viewHeight) {
    const height = viewHeight || this.viewH;
    if (!height) {
      return;
    }
    const count = this.visible().length;
    const maxOffset = Math.max(0, count - height);
    if (this.selected < this.offset) {
      this.offset = this.selected;
    }
    const last = this.offset + height - 1;
    if (this.selected > last) {
      this.offset = this.selected - height + 1;
    }
    this.offset = clamp(this.offset, 0, maxOffset);
  }

  scroll(delta, viewHeight) {
    const count = this.visible().length;
    const maxOffset = Math.max(0, count - viewHeight);
    this.offset = clamp(this.offset + delta, 0, maxOffset);
  }
}

module.exports = { FileTree, nodeIcon, nodeIconTone, isSkippedRel };
