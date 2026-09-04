'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const hasPath = (args) => typeof args.path === 'string' && args.path.length > 0;

const hasCheckScript = async (workspace) => {
  const pkgPath = path.join(workspace.root, 'package.json');
  try {
    const raw = await fs.readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(raw);
    return typeof pkg?.scripts?.check === 'string';
  } catch {
    // ignore missing or invalid package.json
    return false;
  }
};

module.exports = async (args, environment) => {
  const { api, workspace } = environment;
  if (hasPath(args)) {
    const filePath = await workspace.resolveFile(args.path, {
      mustExist: true,
    });
    return api.runFile('node', ['--check', filePath], workspace.root);
  }
  const ok = await hasCheckScript(workspace);
  if (!ok) {
    throw new Error(
      'No scripts.check in package.json; pass path for node --check.',
    );
  }
  return api.runFile('npm', ['run', 'check'], workspace.root);
};
