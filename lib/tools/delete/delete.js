'use strict';

const fs = require('node:fs/promises');

const definition = require('./delete.json');

const deleteFileTool = {
  definition,
  needsApproval: true,
  trust: 'path',
  describe({ path: relativePath }) {
    return `delete ${relativePath}`;
  },
  async execute({ path: relativePath }, { workspace }) {
    const filePath = await workspace.resolveExistingFile(relativePath);
    const stat = await fs.lstat(filePath);
    if (stat.isDirectory()) {
      throw new Error(`Path is a directory (not deleted): ${relativePath}`);
    }
    if (!stat.isFile()) {
      throw new Error(`Not a regular file: ${relativePath}`);
    }
    await fs.unlink(filePath);
    return `Deleted ${relativePath}.`;
  },
};

module.exports = { deleteFileTool };
