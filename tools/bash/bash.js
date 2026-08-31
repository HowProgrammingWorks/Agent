'use strict';

const { runCommand } = require('../command.js');

const bashTool = (environment) => {
  const { workspace } = environment;
  return {
    needsApproval: true,
    trust: 'command',
    describe(args) {
      return `run shell command: ${args.command}`;
    },
    async execute(args) {
      const command = args.command;
      return runCommand(command, workspace.root);
    },
  };
};

module.exports = { bashTool };
