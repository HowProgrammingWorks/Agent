'use strict';

const fs = require('node:fs/promises');

const deleteFileTool = (environment) => {
  const { workspace } = environment;
  return {
    needsApproval: true,
    trust: 'path',
    describe(args) {
      return `delete ${args.path}`;
    },
    async execute(args) {
      const relativePath = args.path;
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
};

module.exports = { deleteFileTool };
