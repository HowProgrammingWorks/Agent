#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const concolor = require('concolor');

const color = concolor({
  warn: 'b,yellow',
  error: 'b,red',
});

const CONFIG_PATH = path.join(__dirname, 'config.js');
const TEMPLATE_PATH = path.join(__dirname, 'agent', 'config.template.js');

const ensureConfig = () => {
  if (fs.existsSync(CONFIG_PATH)) return false;
  fs.copyFileSync(TEMPLATE_PATH, CONFIG_PATH);
  return true;
};

const createdConfig = ensureConfig();

const { errorText } = require('./agent/agent.js');
const { workspace } = require('./agent/workspace.js');
const { startIde } = require('./ide/ide.js');
const config = require('./config.js');

const DEFAULT_MAX_STEPS = 30;
const USAGE_FILE = path.join(__dirname, 'agent', 'usage.md');
const USAGE = fs.readFileSync(USAGE_FILE, 'utf8').trim();

const resolveApiKey = () => {
  const raw = config.API_KEY || '';
  return raw.trim();
};

const missingKey = () => {
  if (createdConfig) console.log(color.warn('Created config.js\n'));
  console.log(color.error('API_KEY is not set.\n'));
  console.log(USAGE);
};

const main = async () => {
  if (!resolveApiKey()) {
    missingKey();
    process.exitCode = 1;
    return;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log(color.error('IDE needs an interactive terminal.'));
    process.exitCode = 1;
    return;
  }
  await workspace.init();
  await startIde({
    maxSteps: DEFAULT_MAX_STEPS,
    model: config.MODEL,
  });
};

main().catch((error) => {
  console.error(color.error(`\nFatal: ${errorText(error)}`));
  process.exitCode = 1;
});
