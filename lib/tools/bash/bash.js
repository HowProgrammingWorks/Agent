'use strict';

const { exec } = require('node:child_process');
const { promisify } = require('node:util');

const commandOutput = require('../../command-output.js');
const { commandExecOptions, formatCommandFailure, formatCommandSuccess } =
  commandOutput;

const definition = require('./bash.json');

const execAsync = promisify(exec);

const bashTool = {
  definition,
  needsApproval: true,
  trust: 'command',
  describe({ command }) {
    return `run shell command: ${command}`;
  },
  async execute({ command }, { workspace }) {
    try {
      const options = commandExecOptions(workspace.root);
      const result = await execAsync(command, options);
      const stdout = result.stdout ?? '';
      const stderr = result.stderr ?? '';
      return formatCommandSuccess(stdout, stderr);
    } catch (error) {
      return formatCommandFailure(error);
    }
  },
};

module.exports = { bashTool };
