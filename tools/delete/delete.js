'use strict';

const fs = require('node:fs/promises');

module.exports = async (args, environment) => {
  const { workspace } = environment;
  const relativePath = args.path;
  const filePath = await workspace.resolveFile(relativePath, {
    mustExist: true,
  });
  const stat = await fs.lstat(filePath);
  if (stat.isDirectory()) {
    throw new Error(`Path is a directory (not deleted): ${relativePath}`);
  }
  if (!stat.isFile()) {
    throw new Error(`Not a regular file: ${relativePath}`);
  }
  await fs.unlink(filePath);
  return `Deleted ${relativePath}.`;
};
