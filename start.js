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
const TEMPLATE_PATH = path.join(__dirname, 'lib', 'config.template.js');

const ensureConfig = () => {
  if (fs.existsSync(CONFIG_PATH)) return false;
  fs.copyFileSync(TEMPLATE_PATH, CONFIG_PATH);
  return true;
};

const createdConfig = ensureConfig();

const { errorText } = require('./lib/agent.js');
const { startIde } = require('./lib/ide/ide.js');
const { createGeminiProvider } = require('./lib/llm.js');
const { createPermissions } = require('./lib/permissions.js');
const { createToolRegistry } = require('./lib/registry.js');
const { createWorkspace } = require('./lib/workspace.js');
const config = require('./config.js');

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const DEFAULT_MAX_STEPS = 30;
const USAGE_FILE = path.join(__dirname, 'lib', 'usage.md');
const USAGE = fs.readFileSync(USAGE_FILE, 'utf8').trim();

const resolveModel = () => {
  const envModel = process.env.TINY_AGENT_MODEL;
  return envModel || config.TINY_AGENT_MODEL || DEFAULT_MODEL;
};

const resolveApiKey = () => {
  const fromEnv = process.env.GEMINI_API_KEY;
  const fromConfig = config.GEMINI_API_KEY;
  const raw = fromEnv || fromConfig || '';
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
  console.log(color.error('GEMINI_API_KEY is not set.\n'));
  console.log(USAGE);
};

const launchIde = async (root) => {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log(color.error('IDE needs an interactive terminal.'));
    process.exitCode = 1;
    return;
  }

  const workspace = await createWorkspace(root);
  const askRef = { current: async () => false };
  const loggerRef = { log: () => {} };
  const permissions = createPermissions({
    ask: (description) => askRef.current(description),
  });
  const provider = createGeminiProvider({
    model: resolveModel(),
    logger: loggerRef,
  });
  const toolRegistry = await createToolRegistry();

  try {
    await startIde({
      workspace,
      provider,
      toolRegistry,
      permissions,
      maxSteps: DEFAULT_MAX_STEPS,
      bindAsk: (ask) => {
        askRef.current = ask;
      },
      bindLogger: (log) => {
        loggerRef.log = log;
      },
    });
  } finally {
    permissions.close();
  }
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
