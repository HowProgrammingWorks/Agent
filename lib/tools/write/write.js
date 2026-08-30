'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const { bytesToSize, directoryExists, ensureDirectory } = require('metautil');

const definition = require('./write.json');

const ensureWritableDir = async (dirPath) => {
  if (await directoryExists(dirPath)) return;
  const parent = path.dirname(dirPath);
  if (parent !== dirPath) await ensureWritableDir(parent);
  if (await ensureDirectory(dirPath)) return;
  if (await directoryExists(dirPath)) return;
  throw new Error(`Cannot create directory: ${dirPath}`);
};

const writeFileTool = {
  definition,
  needsApproval: true,
  describe({ path: relativePath, content }) {
    const bytes = Buffer.byteLength(content, 'utf8');
    const size = bytesToSize(bytes);
    return `write ${relativePath} (${size})`;
  },
  async execute({ path: relativePath, content }, { workspace }) {
    const filePath = await workspace.resolveWritableFile(relativePath);
    await ensureWritableDir(path.dirname(filePath));

    // Re-check after creating dirs in case a symlinked ancestor was involved.
    const verifiedPath = await workspace.resolveWritableFile(relativePath);
    await fs.writeFile(verifiedPath, content, 'utf8');
    const bytes = Buffer.byteLength(content, 'utf8');
    const size = bytesToSize(bytes);
    return `Wrote ${relativePath} (${size}).`;
  },
};

module.exports = { writeFileTool };
