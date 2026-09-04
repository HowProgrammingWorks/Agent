'use strict';

module.exports = async (args, environment) => {
  const { api, workspace } = environment;
  const command = args.command;
  return api.runCommand(command, workspace.root);
};
