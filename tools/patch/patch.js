'use strict';

const { isHashObject } = require('metautil');

const applyHunk = (content, hunk, index, relativePath) => {
  if (!isHashObject(hunk)) {
    throw new Error(`hunks[${index}] must be an object.`);
  }
  const oldText = hunk.old_text;
  const newText = hunk.new_text;
  if (typeof oldText !== 'string' || oldText.length === 0) {
    throw new Error(`hunks[${index}].old_text must be a non-empty string.`);
  }
  if (typeof newText !== 'string') {
    throw new Error(`hunks[${index}].new_text must be a string.`);
  }
  const parts = content.split(oldText);
  const occurrences = parts.length - 1;
  if (occurrences === 0) {
    throw new Error(
      `hunks[${index}].old_text was not found in ${relativePath}.`,
    );
  }
  if (occurrences !== 1) {
    const where = `hunks[${index}].old_text`;
    const times = `occurs ${occurrences} times in ${relativePath}`;
    throw new Error(`${where} ${times}; provide a unique match.`);
  }
  return content.replace(oldText, newText);
};

const patchFileTool = (environment) => {
  const { api, workspace } = environment;
  const { atomicWriteFile, readTextFile } = api;
  return {
    needsApproval: true,
    trust: 'path',
    describe(args) {
      const relativePath = args.path;
      const hunks = args.hunks;
      const count = Array.isArray(hunks) ? hunks.length : 0;
      return `patch ${relativePath} (${count} hunks)`;
    },
    async execute(args) {
      const relativePath = args.path;
      const hunks = args.hunks;
      if (!Array.isArray(hunks) || hunks.length === 0) {
        throw new Error('hunks must be a non-empty array.');
      }

      const filePath = await workspace.resolveExistingFile(relativePath);
      let content = await readTextFile(filePath);
      for (let index = 0; index < hunks.length; index += 1) {
        const hunk = hunks[index];
        content = applyHunk(content, hunk, index, relativePath);
      }
      await atomicWriteFile(filePath, content);
      return `Patched ${relativePath} (${hunks.length} hunks).`;
    },
  };
};

module.exports = { patchFileTool };
