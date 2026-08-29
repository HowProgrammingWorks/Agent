'use strict';

const { execFile } = require('node:child_process');
const path = require('node:path');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 5_000;

const git = async (args, cwd) => {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    timeout: GIT_TIMEOUT_MS,
    windowsHide: true,
  });
  return stdout.trim();
};

const loadGitInfo = async (cwd) => {
  const name = path.basename(cwd);
  try {
    const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
    const hash = await git(['rev-parse', '--short', 'HEAD'], cwd);
    const status = await git(['status', '--porcelain'], cwd);
    return { name, branch, hash, dirty: status.length > 0 };
  } catch {
    // not a git repo, or git is unavailable
    return { name, branch: '', hash: '', dirty: false };
  }
};

module.exports = { loadGitInfo };
