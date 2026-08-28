'use strict';

const fs = require('node:fs/promises');

const definition = require('./read.json');

const readFileTool = {
  definition,
  needsApproval: false,
  async execute({ path }, { workspace }) {
    const filePath = await workspace.resolveExistingFile(path);
    return fs.readFile(filePath, 'utf8');
  },
};

module.exports = { readFileTool };
