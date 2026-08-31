'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const { bytesToSize, directoryExists, ensureDirectory } = require('metautil');

const ensureWritableDir = async (dirPath) => {
  if (await directoryExists(dirPath)) return;
  const parent = path.dirname(dirPath);
  if (parent !== dirPath) await ensureWritableDir(parent);
  if (await ensureDirectory(dirPath)) return;
  if (await directoryExists(dirPath)) return;
  throw new Error(`Cannot create directory: ${dirPath}`);
};

const writeFileTool = (environment) => {
  const { api, workspace } = environment;
  const { atomicWriteFile } = api;
  return {
    needsApproval: true,
    trust: 'path',
    describe(args) {
      const relativePath = args.path;
      const content = args.content;
      const bytes = Buffer.byteLength(content, 'utf8');
      const size = bytesToSize(bytes);
      return `write ${relativePath} (${size})`;
    },
    async execute(args) {
      const relativePath = args.path;
      const content = args.content;
      const filePath = await workspace.resolveWritableFile(relativePath);
      const dirPath = path.dirname(filePath);
      await ensureWritableDir(dirPath);

      const verifiedPath = await workspace.resolveWritableFile(relativePath);
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

      await atomicWriteFile(verifiedPath, content);
      const bytes = Buffer.byteLength(content, 'utf8');
      const size = bytesToSize(bytes);
      const verb = existed ? 'Overwrote' : 'Created';
      return `${verb} ${relativePath} (${size}).`;
    },
  };
};

module.exports = { writeFileTool };
