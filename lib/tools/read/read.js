'use strict';

const { formatNumberedLines, readTextFile } = require('../../textfile.js');

const definition = require('./read.json');

const MAX_LIMIT = 2000;

const resolveOffset = (value) => {
  const offset = Math.trunc(value ?? 1);
  if (!Number.isFinite(offset) || offset < 1) {
    throw new Error('offset must be a 1-based line number.');
  }
  return offset;
};

const resolveLimit = (value, remaining) => {
  if (value === undefined || value === null) return remaining;
  const limit = Math.trunc(value);
  if (!Number.isFinite(limit) || limit < 1) {
    throw new Error('limit must be a positive number.');
  }
  return limit;
};

const readFileTool = {
  definition,
  needsApproval: false,
  trust: 'path',
  async execute(args, { workspace }) {
    const relativePath = args.path;
    const offset = resolveOffset(args.offset);

    const filePath = await workspace.resolveExistingFile(relativePath);
    const content = await readTextFile(filePath);
    const lines = content.length === 0 ? [] : content.split('\n');
    const totalLines = lines.length;

    if (totalLines === 0) return '(empty file)';

    const remaining = Math.max(0, totalLines - offset + 1);
    const requested = resolveLimit(args.limit, remaining);
    const limit = Math.min(requested, MAX_LIMIT, remaining);
    const start = offset - 1;
    const slice = lines.slice(start, start + limit);
    return formatNumberedLines(slice, offset, totalLines);
  },
};

module.exports = { readFileTool };
