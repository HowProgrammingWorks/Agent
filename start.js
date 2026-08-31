#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const concolor = require('concolor');
const { directoryExists, exists } = require('metautil');

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
const { openWorkspace } = require('./agent/workspace.js');
const { startIde } = require('./ide/ide.js');
const config = require('./config.js');

const DEFAULT_MAX_STEPS = 30;
const USAGE_FILE = path.join(__dirname, 'agent', 'usage.md');
const USAGE = fs.readFileSync(USAGE_FILE, 'utf8').trim();

const resolveApiKey = () => {
  const raw = config.API_KEY || '';
  return raw.trim();
};

const resolveRoot = async (arg) => {
  const root = path.resolve(arg || process.cwd());
  const found = await exists(root);
  if (!found) throw new Error(`Not found: ${root}`);
  const isDir = await directoryExists(root);
  if (!isDir) throw new Error(`Not a directory: ${root}`);
  return root;
};

const missingKey = () => {
  if (createdConfig) console.log(color.warn('Created config.js\n'));
  console.log(color.error('API_KEY is not set.\n'));
  console.log(USAGE);
};

const launchIde = async (root) => {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log(color.error('IDE needs an interactive terminal.'));
    process.exitCode = 1;
    return;
  }
  await openWorkspace(root);
  await startIde({
    maxSteps: DEFAULT_MAX_STEPS,
    model: config.MODEL,
    contextBudget: config.CONTEXT_TOKEN_BUDGET,
  });
};

const main = async () => {
  if (!resolveApiKey()) {
    missingKey();
    process.exitCode = 1;
    return;
  }
  const extra = process.argv.slice(2);
  if (extra.length > 1) {
    console.log(color.error('Usage: node start.js [project-root]'));
    process.exitCode = 1;
    return;
  }
  const root = await resolveRoot(extra[0]);
  await launchIde(root);
};

main().catch((error) => {
  console.error(color.error(`\nFatal: ${errorText(error)}`));
  process.exitCode = 1;
});
