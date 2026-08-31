'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const { findGitRoot } = require('./git.js');

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

const workspace = {
  root: null,
  realRoot: null,
  gitRoot: null,
  resolveExistingFile: null,
  resolveWritableFile: null,
  resolveExistingPath: null,
};

const resolveFile = async (relativePath, options) => {
  const opts = options ?? {};
  const mustExist = opts.mustExist ?? false;
  const lexicalRoot = workspace.root;
  const realRoot = workspace.realRoot;

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

const resolveExistingFile = (relativePath) =>
  resolveFile(relativePath, { mustExist: true });

const resolveWritableFile = (relativePath) =>
  resolveFile(relativePath, { mustExist: false });

const resolveExistingPath = async (relativePath) => {
  const empty = relativePath === undefined || relativePath === '';
  const target = empty ? '.' : relativePath;
  const lexicalTarget = await resolveFile(target, { mustExist: true });
  const stat = await fs.lstat(lexicalTarget);
  const isFile = stat.isFile();
  const isDirectory = stat.isDirectory();
  return { path: lexicalTarget, isFile, isDirectory };
};

workspace.resolveExistingFile = resolveExistingFile;
workspace.resolveWritableFile = resolveWritableFile;
workspace.resolveExistingPath = resolveExistingPath;

const openWorkspace = async (root = process.cwd()) => {
  const lexicalRoot = path.resolve(root);
  workspace.root = lexicalRoot;
  workspace.realRoot = await fs.realpath(lexicalRoot);
  workspace.gitRoot = await findGitRoot(lexicalRoot);
};

module.exports = { isInside, workspace, openWorkspace };
