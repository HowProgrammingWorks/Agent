'use strict';

const { Ide } = require('./ide.js');

const startIde = async (options) => {
  const ide = new Ide(options);
  options.bindAsk?.((description) => ide.requestApproval(description));
  options.bindLogger?.((line) => ide.note(line));
  await ide.load();
  const running = ide.run();
  const initialTask = options.initialTask?.trim();
  if (initialTask) void ide.submit(initialTask);
  await running;
};

module.exports = { startIde };
