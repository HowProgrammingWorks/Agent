'use strict';

const applyHunk = (content, hunk, index, relativePath) => {
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

module.exports = async (args, environment) => {
  const { api, workspace } = environment;
  const relativePath = args.path;
  const hunks = args.hunks;
  if (!Array.isArray(hunks) || hunks.length === 0) {
    throw new Error('hunks must be a non-empty array.');
  }

  const filePath = await workspace.resolveFile(relativePath, {
    mustExist: true,
  });
  let content = await api.readTextFile(filePath);
  for (let index = 0; index < hunks.length; index += 1) {
    const hunk = hunks[index];
    if (!api.isHashObject(hunk)) {
      throw new Error(`hunks[${index}] must be an object.`);
    }
    content = applyHunk(content, hunk, index, relativePath);
  }
  await api.atomicWriteFile(filePath, content);
  return `Patched ${relativePath} (${hunks.length} hunks).`;
};
