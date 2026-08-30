'use strict';

const { exec } = require('node:child_process');
const { promisify } = require('node:util');

const definition = require('./bash.json');

const execAsync = promisify(exec);
const MAX_OUTPUT_CHARS = 50_000;
const COMMAND_TIMEOUT_MS = 30_000;
const MAX_BUFFER = 1024 * 1024;

const trimOutput = (text) => {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  const truncated = text.slice(0, MAX_OUTPUT_CHARS);
  return `${truncated}\n...[output truncated]`;
};

const joinOutput = (lines) => {
  const present = lines.filter(Boolean);
  const text = present.join('\n');
  return trimOutput(text);
};

const bashTool = {
  definition,
  needsApproval: true,
  describe({ command }) {
    return `run shell command: ${command}`;
  },
  async execute({ command }, { workspace }) {
    try {
      const { stdout = '', stderr = '' } = await execAsync(command, {
        cwd: workspace.root,
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
      });
      const stdoutBlock = stdout ? `stdout:\n${stdout}` : '';
      const stderrBlock = stderr ? `stderr:\n${stderr}` : '';
      const lines = ['exit_code: 0', stdoutBlock, stderrBlock];
      return joinOutput(lines);
    } catch (error) {
      if (error?.killed && error?.signal === 'SIGTERM') {
        return 'exit_code: timeout\nCommand exceeded the 30 second timeout.';
      }
      const exitCode = error?.code ?? 'unknown';
      const stdout = error?.stdout ? `stdout:\n${error.stdout}` : '';
      const stderr = error?.stderr ? `stderr:\n${error.stderr}` : '';
      const fallback =
        !error?.stdout && !error?.stderr ? `error:\n${error.message}` : '';
      return joinOutput([`exit_code: ${exitCode}`, stdout, stderr, fallback]);
    }
  },
};

module.exports = { bashTool };
