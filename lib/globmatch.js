'use strict';

const escapeRegExp = (text) => text.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');

const globToRegExp = (pattern) => {
  if (typeof pattern !== 'string' || pattern.length === 0) {
    throw new Error('glob pattern must be a non-empty string.');
  }
  const normalized = pattern.replaceAll('\\', '/');
  let source = '^';
  let i = 0;
  while (i < normalized.length) {
    const ch = normalized[i];
    if (ch === '*') {
      const next = normalized[i + 1];
      if (next === '*') {
        const after = normalized[i + 2];
        if (after === '/' || after === undefined) {
          source += '.*';
          i += after === '/' ? 3 : 2;
          continue;
        }
        source += '.*';
        i += 2;
        continue;
      }
      source += '[^/]*';
      i += 1;
      continue;
    }
    if (ch === '?') {
      source += '[^/]';
      i += 1;
      continue;
    }
    source += escapeRegExp(ch);
    i += 1;
  }
  source += '$';
  return new RegExp(source);
};

const matchGlob = (relativePath, pattern) => {
  const pathNorm = relativePath.replaceAll('\\', '/');
  const re = globToRegExp(pattern);
  if (re.test(pathNorm)) return true;
  const base = pathNorm.includes('/')
    ? pathNorm.slice(pathNorm.lastIndexOf('/') + 1)
    : pathNorm;
  return re.test(base);
};

module.exports = { globToRegExp, matchGlob };
