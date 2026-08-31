'use strict';

const GLOB_TOKEN = /\*\*\/?|\*|\?|[^*?]+/g;

const GLOB_ATOM = {
  '**/': '.*',
  '**': '.*',
  '*': '[^/]*',
  '?': '[^/]',
};

const escapeRegExp = (text) => text.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');

const toPosix = (value) => value.replaceAll('\\', '/');

const globToRegExp = (pattern) => {
  if (typeof pattern !== 'string' || pattern.length === 0) {
    throw new Error('glob pattern must be a non-empty string.');
  }
  const normalized = toPosix(pattern);
  const tokens = normalized.match(GLOB_TOKEN) ?? [];
  const atoms = tokens.map((token) => GLOB_ATOM[token] ?? escapeRegExp(token));
  const source = `^${atoms.join('')}$`;
  return new RegExp(source);
};

const matchGlob = (relativePath, pattern) => {
  const posix = toPosix(relativePath);
  const re = globToRegExp(pattern);
  if (re.test(posix)) return true;
  const base = posix.slice(posix.lastIndexOf('/') + 1);
  return re.test(base);
};

module.exports = { globToRegExp, matchGlob };
