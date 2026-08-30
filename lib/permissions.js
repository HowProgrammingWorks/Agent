'use strict';

const os = require('node:os');
const path = require('node:path');
const { createInterface } = require('node:readline/promises');

const concolor = require('concolor');

const { isInside } = require('./workspace.js');

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

const filePathLeavesTrustRoot = (args, workspace) => {
  const relativePath = args.path;
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    return true;
  }
  const resolved = path.resolve(workspace.root, relativePath);
  return !isInside(workspace.gitRoot, resolved);
};

const bashLeavesTrustRoot = (args, workspace) => {
  const command = args.command;
  if (typeof command !== 'string' || command.length === 0) return true;
  return commandLeavesTrustRoot(command, workspace.gitRoot, workspace.root);
};

const TRUST_CHECK = {
  write: filePathLeavesTrustRoot,
  edit: filePathLeavesTrustRoot,
  read: filePathLeavesTrustRoot,
  bash: bashLeavesTrustRoot,
};

const toolLeavesTrustRoot = (tool, args, workspace) => {
  const trustRoot = workspace.gitRoot;
  if (!trustRoot) return true;
  const name = tool.definition.function.name;
  const check = TRUST_CHECK[name];
  if (!check) return true;
  return check(args, workspace);
};

const createPermissions = (options = {}) => {
  const autoApprove = options.autoApprove ?? false;
  const ask = options.ask;
  const usePrompt = !autoApprove && typeof ask !== 'function';
  const rl = usePrompt
    ? createInterface({ input: process.stdin, output: process.stdout })
    : null;

  return {
    async approve(tool, args, context = {}) {
      if (!tool.needsApproval || autoApprove) return true;
      const workspace = context.workspace;
      if (workspace?.gitRoot && !toolLeavesTrustRoot(tool, args, workspace)) {
        return true;
      }
      const described = tool.describe?.(args);
      const description = described ?? tool.definition.function.name;
      if (typeof ask === 'function') return ask(description);
      const prompt = color.warn(`\nApprove: ${description}? [y/N] `);
      const answer = await rl.question(prompt);
      const normalized = answer.trim().toLowerCase();
      return APPROVE_ANSWERS.includes(normalized);
    },
    close() {
      rl?.close();
    },
  };
};

module.exports = { createPermissions };
