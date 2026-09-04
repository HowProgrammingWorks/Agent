'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const { findGitRoot } = require('./git.js');

const workspace = {};

const isInside = (root, candidate) => {
  const prefix = root + path.sep;
  return candidate === root || candidate.startsWith(prefix);
};

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

workspace.resolveFile = async (relativePath, options) => {
  const opts = options ?? {};
  const mustExist = opts.mustExist ?? false;
  const { root, realRoot } = workspace;

  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    throw new Error('Path must be a non-empty string.');
  }

  if (path.isAbsolute(relativePath)) {
    throw new Error('Only paths relative to the workspace are allowed.');
  }

  const lexicalTarget = path.resolve(root, relativePath);
  if (!isInside(root, lexicalTarget)) {
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

workspace.resolveExistingPath = async (relativePath) => {
  const empty = relativePath === undefined || relativePath === '';
  const target = empty ? '.' : relativePath;
  const options = { mustExist: true };
  const lexicalTarget = await workspace.resolveFile(target, options);
  const stat = await fs.lstat(lexicalTarget);
  const isFile = stat.isFile();
  const isDirectory = stat.isDirectory();
  return { path: lexicalTarget, isFile, isDirectory };
};

const resolveRoot = async (root) => {
  const extra = process.argv.slice(2);
  if (root === undefined && extra.length > 1) {
    throw new Error('Expected at most one workspace path.');
  }
  const candidate = root ?? extra[0] ?? process.cwd();
  const lexicalRoot = path.resolve(candidate);
  let stat;
  try {
    stat = await fs.stat(lexicalRoot);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Not found: ${lexicalRoot}`);
    }
    throw error;
  }
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${lexicalRoot}`);
  }
  return lexicalRoot;
};

workspace.init = async (arg) => {
  const root = await resolveRoot(arg);
  const realRoot = await fs.realpath(root);
  const gitRoot = await findGitRoot(root);
  Object.assign(workspace, { root, realRoot, gitRoot });
};

module.exports = { isInside, workspace };
