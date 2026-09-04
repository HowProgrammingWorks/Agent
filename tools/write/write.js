'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = async (args, environment) => {
  const { api, workspace } = environment;
  const relativePath = args.path;
  const content = args.content;
  const filePath = await workspace.resolveFile(relativePath);
  const dirPath = path.dirname(filePath);
  await fs.mkdir(dirPath, { recursive: true });

  const verifiedPath = await workspace.resolveFile(relativePath);
  let existed = false;
  try {
    const stat = await fs.lstat(verifiedPath);
    if (stat.isDirectory()) {
      throw new Error(`Path is a directory: ${relativePath}`);
    }
    existed = true;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  await api.atomicWriteFile(verifiedPath, content);
  const bytes = Buffer.byteLength(content, 'utf8');
  const size = api.bytesToSize(bytes);
  const verb = existed ? 'Overwrote' : 'Created';
  return `${verb} ${relativePath} (${size}).`;
};
