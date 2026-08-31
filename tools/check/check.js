'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const { runFile } = require('../command.js');

const hasPath = (args) => typeof args.path === 'string' && args.path.length > 0;

const checkTool = (environment) => {
  const { workspace } = environment;
  const hasCheckScript = async () => {
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
  return {
    needsApproval: true,
    trust: (args) => (hasPath(args) ? 'path' : 'command'),
    describe(args) {
      if (hasPath(args)) return `check ${args.path}`;
      return 'npm run check';
    },
    async execute(args) {
      if (hasPath(args)) {
        const filePath = await workspace.resolveExistingFile(args.path);
        return runFile('node', ['--check', filePath], workspace.root);
      }
      const ok = await hasCheckScript();
      if (!ok) {
        throw new Error(
          'No scripts.check in package.json; pass path for node --check.',
        );
      }
      return runFile('npm', ['run', 'check'], workspace.root);
    },
  };
};

module.exports = { checkTool };
