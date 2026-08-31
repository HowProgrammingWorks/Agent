'use strict';

const path = require('node:path');

const MAX_MATCHES = 200;

const globTool = (environment) => {
  const { api, walkFiles, workspace } = environment;
  const { globToRegExp, matchGlob, truncateOutput } = api;
  return {
    needsApproval: false,
    trust: 'path',
    async execute(args) {
      const pattern = args.pattern;
      if (typeof pattern !== 'string' || pattern.length === 0) {
        throw new Error('pattern must be a non-empty string.');
      }
      globToRegExp(pattern);

      const target = await workspace.resolveExistingPath(args.path ?? '.');
      if (!target.isDirectory) {
        throw new Error(`glob path must be a directory: ${args.path ?? '.'}`);
      }

      const fromRoot = path.relative(workspace.root, target.path);
      const baseRel = fromRoot.replaceAll('\\', '/') || '';
      const matches = [];
      let extra = 0;

      await walkFiles(target.path, baseRel, async (_absPath, relPath) => {
        if (!matchGlob(relPath, pattern)) return false;
        if (matches.length < MAX_MATCHES) {
          matches.push(relPath);
          return false;
        }
        extra += 1;
        return false;
      });

      if (matches.length === 0 && extra === 0) return 'No files matched.';
      const lines = [...matches];
      if (extra > 0) lines.push(`... ${extra} more`);
      return truncateOutput(lines.join('\n'));
    },
  };
};

module.exports = { globTool };
