'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const { SKIP_NAMES } = require('./skip.js');

const walkFiles = async (absDir, relativeDir, visit) => {
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  for (const dirent of entries) {
    if (SKIP_NAMES.includes(dirent.name)) continue;
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

module.exports = { walkFiles };
