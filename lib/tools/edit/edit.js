'use strict';

const fs = require('node:fs/promises');

const definition = require('./edit.json');

const editFileTool = {
  definition,
  needsApproval: true,
  describe({ path: relativePath }) {
    return `edit ${relativePath}`;
  },
  async execute(args, { workspace }) {
    const relativePath = args.path;
    const oldText = args.old_text;
    const newText = args.new_text;
    if (oldText.length === 0) {
      throw new Error('old_text must not be empty.');
    }

    const filePath = await workspace.resolveExistingFile(relativePath);
    const content = await fs.readFile(filePath, 'utf8');
    const parts = content.split(oldText);
    const occurrences = parts.length - 1;

    if (occurrences === 0) {
      throw new Error(`old_text was not found in ${relativePath}.`);
    }

    if (occurrences !== 1) {
      const hint = 'provide a unique match.';
      throw new Error(
        `old_text occurs ${occurrences} times in ${relativePath}; ${hint}`,
      );
    }

    const updated = content.replace(oldText, newText);
    await fs.writeFile(filePath, updated, 'utf8');
    return `Edited ${relativePath}.`;
  },
};

module.exports = { editFileTool };
