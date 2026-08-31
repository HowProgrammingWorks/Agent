'use strict';

const os = require('node:os');
const path = require('node:path');
const { createInterface } = require('node:readline/promises');

const concolor = require('concolor');

const { isInside, workspace } = require('./workspace.js');

const color = concolor({
  warn: 'b,yellow',
});

const PATH_TOKEN_RE = /"([^"]*)"|'([^']*)'|`([^`]*)`|([^\s;|&<>()]+)/g;
const APPROVE_ANSWERS = ['y', 'yes'];

const extractPathTokens = (command) => {
  const tokens = [];
  PATH_TOKEN_RE.lastIndex = 0;
  let match = PATH_TOKEN_RE.exec(command);
  while (match) {
    const token = match[1] ?? match[2] ?? match[3] ?? match[4];
    if (token) tokens.push(token);
    match = PATH_TOKEN_RE.exec(command);
  }
  return tokens;
};

const looksLikePath = (token) => {
  if (!token || token.includes('://')) return false;
  if (token === '.' || token === '..') return true;
  if (token.startsWith('~')) return true;
  if (token.startsWith('/') || token.startsWith('./')) return true;
  if (token.startsWith('../')) return true;
  return token.includes('/') || token.includes('\\');
};

const unwrapPathToken = (token) => {
  const eq = token.indexOf('=');
  if (eq <= 0 || eq >= token.length - 1) return token;
  const value = token.slice(eq + 1);
  if (looksLikePath(value)) return value;
  return token;
};

const resolveAgainst = (workspaceRoot, token) => {
  const unwrapped = unwrapPathToken(token);
  if (unwrapped === '~') return os.homedir();
  if (unwrapped.startsWith('~/') || unwrapped.startsWith('~\\')) {
    return path.join(os.homedir(), unwrapped.slice(2));
  }
  return path.resolve(workspaceRoot, unwrapped);
};

const commandLeavesTrustRoot = (command, trustRoot, workspaceRoot) => {
  const tokens = extractPathTokens(command);
  for (const token of tokens) {
    const candidate = unwrapPathToken(token);
    if (!looksLikePath(token) && !looksLikePath(candidate)) continue;
    const resolved = resolveAgainst(workspaceRoot, token);
    if (!isInside(trustRoot, resolved)) return true;
  }
  return false;
};

const filePathLeavesTrustRoot = (args) => {
  const relativePath = args.path;
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    return !isInside(workspace.gitRoot, workspace.root);
  }
  const resolved = path.resolve(workspace.root, relativePath);
  return !isInside(workspace.gitRoot, resolved);
};

const bashLeavesTrustRoot = (args) => {
  const command = args.command;
  if (typeof command !== 'string' || command.length === 0) return true;
  return commandLeavesTrustRoot(command, workspace.gitRoot, workspace.root);
};

const commandTrustLeaves = (args) => {
  if (typeof args.command !== 'string') return false;
  return bashLeavesTrustRoot(args);
};

const TRUST_KIND = {
  path: filePathLeavesTrustRoot,
  command: commandTrustLeaves,
  always: () => true,
};

const toolLeavesTrustRoot = (tool, args) => {
  const trustRoot = workspace.gitRoot;
  if (!trustRoot) return true;
  const kind = tool.trust(args);
  const check = TRUST_KIND[kind];
  if (!check) return true;
  return check(args);
};

const createPermissions = (options = {}) => {
  const autoApprove = options.autoApprove ?? false;
  const ask = options.ask;
  const usePrompt = !autoApprove && typeof ask !== 'function';
  let rl = null;
  if (usePrompt) {
    rl = createInterface({ input: process.stdin, output: process.stdout });
  }
  return {
    async approve(tool, args) {
      if (!tool.needsApproval || autoApprove) return true;
      if (workspace.gitRoot && !toolLeavesTrustRoot(tool, args)) return true;
      const description = tool.describe(args);
      if (typeof ask === 'function') return ask(description);
      const prompt = color.warn(`\nApprove: ${description}? [y/N] `);
      const answer = await rl.question(prompt);
      const normalized = answer.trim().toLowerCase();
      return APPROVE_ANSWERS.includes(normalized);
    },
    close: () => rl?.close(),
  };
};

module.exports = { createPermissions };
