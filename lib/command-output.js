'use strict';

const { truncateOutput } = require('./textfile.js');

const COMMAND_TIMEOUT_MS = 30_000;
const MAX_BUFFER = 1024 * 1024;

const joinOutput = (lines) => {
  const present = lines.filter(Boolean);
  const text = present.join('\n');
  return truncateOutput(text);
};

const formatCommandSuccess = (stdout = '', stderr = '') => {
  const stdoutBlock = stdout ? `stdout:\n${stdout}` : '';
  const stderrBlock = stderr ? `stderr:\n${stderr}` : '';
  return joinOutput(['exit_code: 0', stdoutBlock, stderrBlock]);
};

const formatCommandFailure = (error) => {
  const timedOut = error?.killed && error?.signal === 'SIGTERM';
  if (timedOut) {
    const seconds = COMMAND_TIMEOUT_MS / 1000;
    const notice = `Command exceeded the ${seconds} second timeout.`;
    return `exit_code: timeout\n${notice}`;
  }
  const exitCode = error?.code ?? 'unknown';
  const stdout = error?.stdout ? `stdout:\n${error.stdout}` : '';
  const stderr = error?.stderr ? `stderr:\n${error.stderr}` : '';
  const hasOutput = Boolean(error?.stdout || error?.stderr);
  const fallback = hasOutput ? '' : `error:\n${error.message}`;
  return joinOutput([`exit_code: ${exitCode}`, stdout, stderr, fallback]);
};

const commandExecOptions = (cwd) => ({
  cwd,
  timeout: COMMAND_TIMEOUT_MS,
  maxBuffer: MAX_BUFFER,
  windowsHide: true,
});

module.exports = {
  formatCommandSuccess,
  formatCommandFailure,
  commandExecOptions,
};
