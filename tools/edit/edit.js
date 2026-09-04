'use strict';

module.exports = async (args, environment) => {
  const { api, workspace } = environment;
  const relativePath = args.path;
  const oldText = args.old_text;
  const newText = args.new_text;
  if (oldText.length === 0) throw new Error('old_text must not be empty.');

  const filePath = await workspace.resolveFile(relativePath, {
    mustExist: true,
  });
  const content = await api.readTextFile(filePath);
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
  await api.atomicWriteFile(filePath, updated);
  return `Edited ${relativePath}.`;
};
