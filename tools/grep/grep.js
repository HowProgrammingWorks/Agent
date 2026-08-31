'use strict';

const path = require('node:path');

const DEFAULT_MAX = 50;
const HARD_MAX = 200;

const compilePattern = (pattern, ignoreCase) => {
  try {
    return new RegExp(pattern, ignoreCase ? 'i' : '');
  } catch (error) {
    throw new Error(`Invalid regex pattern: ${error.message}`);
  }
};

const resolveMaxMatches = (value) => {
  if (value === undefined || value === null) return DEFAULT_MAX;
  const max = Math.trunc(value);
  if (!Number.isFinite(max) || max < 1) {
    throw new Error('max_matches must be a positive number.');
  }
  return Math.min(max, HARD_MAX);
};

const grepTool = (environment) => {
  const { api, walkFiles, workspace } = environment;
  const { matchGlob, readTextFile, truncateOutput } = api;

  const grepFile = async (absPath, relPath, regex, lines, maxMatches) => {
    let content;
    try {
      content = await readTextFile(absPath);
    } catch {
      // ignore unreadable or binary files
      return false;
    }
    const fileLines = content.split('\n');
    for (let index = 0; index < fileLines.length; index += 1) {
      const line = fileLines[index];
      if (!regex.test(line)) continue;
      const lineNo = index + 1;
      lines.push(`${relPath}:${lineNo}:${line}`);
      if (lines.length >= maxMatches) return true;
    }
    return false;
  };

  return {
    needsApproval: false,
    trust: 'path',
    async execute(args) {
      const pattern = args.pattern;
      if (typeof pattern !== 'string' || pattern.length === 0) {
        throw new Error('pattern must be a non-empty string.');
      }
      const ignoreCase = args.ignore_case === true;
      const regex = compilePattern(pattern, ignoreCase);
      const maxMatches = resolveMaxMatches(args.max_matches);
      const globFilter = args.glob;
      if (globFilter !== undefined && typeof globFilter !== 'string') {
        throw new Error('glob must be a string.');
      }

      const target = await workspace.resolveExistingPath(args.path ?? '.');
      const lines = [];
      let truncated = false;

      const consider = async (absPath, relPath) => {
        if (globFilter && !matchGlob(relPath, globFilter)) return false;
        const full = await grepFile(absPath, relPath, regex, lines, maxMatches);
        if (full) truncated = true;
        return full;
      };

      if (target.isFile) {
        const relFromRoot = path.relative(workspace.root, target.path);
        const rel = relFromRoot || path.basename(target.path);
        const posixRel = rel.replaceAll('\\', '/');
        await consider(target.path, posixRel);
      } else if (target.isDirectory) {
        const fromRoot = path.relative(workspace.root, target.path);
        const baseRel = fromRoot.replaceAll('\\', '/') || '';
        await walkFiles(target.path, baseRel, consider);
      } else {
        throw new Error(`Not a file or directory: ${args.path ?? '.'}`);
      }

      if (lines.length === 0) return 'No matches.';
      const body = lines.join('\n');
      const note = truncated ? `\n... stopped after ${maxMatches} matches` : '';
      return truncateOutput(body + note);
    },
  };
};

module.exports = { grepTool };
