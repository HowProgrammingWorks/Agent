'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const { findGitRoot } = require('./git.js');

const isInside = (root, candidate) =>
  candidate === root || candidate.startsWith(root + path.sep);

const nearestExistingAncestor = async (candidate) => {
  let current = candidate;
  while (true) {
    try {
      await fs.lstat(current);
      return current;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
};

const createWorkspace = async (root = process.cwd()) => {
  const lexicalRoot = path.resolve(root);
  const realRoot = await fs.realpath(lexicalRoot);
  const gitRoot = await findGitRoot(lexicalRoot);

  const resolveFile = async (relativePath, options) => {
    const opts = options ?? {};
    const mustExist = opts.mustExist ?? false;

    if (typeof relativePath !== 'string' || relativePath.length === 0) {
      throw new Error('Path must be a non-empty string.');
    }

    if (path.isAbsolute(relativePath)) {
      throw new Error('Only paths relative to the workspace are allowed.');
    }

    const lexicalTarget = path.resolve(lexicalRoot, relativePath);
    if (!isInside(lexicalRoot, lexicalTarget)) {
      throw new Error(`Path escapes workspace: ${relativePath}`);
    }

    if (mustExist) {
      const realTarget = await fs.realpath(lexicalTarget);
      if (!isInside(realRoot, realTarget)) {
        throw new Error(`Path resolves outside workspace: ${relativePath}`);
      }
      return lexicalTarget;
    }

    const ancestor = await nearestExistingAncestor(lexicalTarget);
    const realAncestor = await fs.realpath(ancestor);
    if (!isInside(realRoot, realAncestor)) {
      throw new Error(`Path resolves outside workspace: ${relativePath}`);
    }

    return lexicalTarget;
  };

  return {
    root: lexicalRoot,
    realRoot,
    gitRoot,
    resolveExistingFile(relativePath) {
      return resolveFile(relativePath, { mustExist: true });
    },
    resolveWritableFile(relativePath) {
      return resolveFile(relativePath, { mustExist: false });
    },
  };
};

module.exports = { isInside, createWorkspace };
