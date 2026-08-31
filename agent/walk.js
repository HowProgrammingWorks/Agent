'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const SKIP_NAMES = ['node_modules', '.git', 'dist', 'coverage', '.cursor'];

const isSkippedName = (name) => SKIP_NAMES.includes(name);

const isSkippedRel = (rel) => {
  const parts = (rel ?? '').split(/[/\\]/);
  for (const part of parts) {
    if (isSkippedName(part)) return true;
  }
  return false;
};

const walkFiles = async (absDir, relativeDir, visit) => {
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  for (const dirent of entries) {
    if (isSkippedName(dirent.name)) continue;
    const absPath = path.join(absDir, dirent.name);
    const relPath = relativeDir ? `${relativeDir}/${dirent.name}` : dirent.name;
    if (dirent.isDirectory()) {
      const stop = await walkFiles(absPath, relPath, visit);
      if (stop) return true;
      continue;
    }
    if (!dirent.isFile()) continue;
    const stop = await visit(absPath, relPath);
    if (stop) return true;
  }
  return false;
};

module.exports = { isSkippedName, isSkippedRel, walkFiles };
