'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const { bytesToSize } = require('metautil');

const definition = require('./write.json');

const writeFileTool = {
  definition,
  needsApproval: true,
  describe({ path: relativePath, content }) {
    const size = bytesToSize(Buffer.byteLength(content, 'utf8'));
    return `write ${relativePath} (${size})`;
  },
  async execute({ path: relativePath, content }, { workspace }) {
    const filePath = await workspace.resolveWritableFile(relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Re-check after mkdir in case an existing symlinked ancestor was involved.
    const verifiedPath = await workspace.resolveWritableFile(relativePath);
    await fs.writeFile(verifiedPath, content, 'utf8');
    const size = bytesToSize(Buffer.byteLength(content, 'utf8'));
    return `Wrote ${relativePath} (${size}).`;
  },
};

module.exports = { writeFileTool };
