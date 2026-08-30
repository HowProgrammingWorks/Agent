'use strict';

const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');

const commandOutput = require('../../command-output.js');
const { commandExecOptions, formatCommandFailure, formatCommandSuccess } =
  commandOutput;

const definition = require('./check.json');

const execFileAsync = promisify(execFile);

const hasPath = (args) => typeof args.path === 'string' && args.path.length > 0;

const runExec = async (command, args, cwd) => {
  try {
    const result = await execFileAsync(command, args, commandExecOptions(cwd));
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    return formatCommandSuccess(stdout, stderr);
  } catch (error) {
    return formatCommandFailure(error);
  }
};

const hasCheckScript = async (workspaceRoot) => {
  const pkgPath = path.join(workspaceRoot, 'package.json');
  try {
    const raw = await fs.readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(raw);
    return typeof pkg?.scripts?.check === 'string';
  } catch {
    // ignore missing or invalid package.json
    return false;
  }
};

const checkTool = {
  definition,
  needsApproval: true,
  trust: (args) => (hasPath(args) ? 'path' : 'command'),
  describe(args) {
    if (hasPath(args)) return `check ${args.path}`;
    return 'npm run check';
  },
  async execute(args, { workspace }) {
    if (hasPath(args)) {
      const filePath = await workspace.resolveExistingFile(args.path);
      return runExec('node', ['--check', filePath], workspace.root);
    }
    const ok = await hasCheckScript(workspace.root);
    if (!ok) {
      throw new Error(
        'No scripts.check in package.json; pass path for node --check.',
      );
    }
    return runExec('npm', ['run', 'check'], workspace.root);
  },
};

module.exports = { checkTool };
