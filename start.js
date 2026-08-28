#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { isError, isHashObject } = require('metautil');

const CONFIG_PATH = path.join(__dirname, 'config.js');
const TEMPLATE_PATH = path.join(__dirname, 'lib', 'config.template.js');

const ensureConfig = () => {
  if (fs.existsSync(CONFIG_PATH)) return false;
  fs.copyFileSync(TEMPLATE_PATH, CONFIG_PATH);
  return true;
};

const createdConfig = ensureConfig();

const { runAgent } = require('./lib/agent.js');
const { color } = require('./lib/color.js');
const { createGeminiProvider } = require('./lib/llm.js');
const { createPermissions } = require('./lib/permissions.js');
const { createWorkspace } = require('./lib/workspace.js');
const config = require('./config.js');

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const DEFAULT_MAX_STEPS = 30;
const MIN_STEPS = 1;
const MAX_STEPS = 200;
const TOOLS_DIR = path.join(__dirname, 'lib', 'tools');
const USAGE = fs
  .readFileSync(path.join(__dirname, 'lib', 'usage.md'), 'utf8')
  .trim();

const errorText = (error) => {
  if (isError(error)) return error.message;
  if (typeof error === 'string') return error;
  if (error === null || error === undefined) return '';
  return `${error}`;
};

const isTool = (value) =>
  isHashObject(value) &&
  value.definition &&
  typeof value.execute === 'function';

const loadTool = (dirent) => {
  if (!dirent.isDirectory()) return null;
  const jsPath = path.join(TOOLS_DIR, dirent.name, `${dirent.name}.js`);
  if (!fs.existsSync(jsPath)) return null;
  const exported = require(jsPath);
  return Object.values(exported).find(isTool) ?? null;
};

const createToolRegistry = () => {
  const entries = fs.readdirSync(TOOLS_DIR, { withFileTypes: true });
  const tools = entries.map(loadTool).filter(Boolean);
  const byName = new Map(
    tools.map((tool) => [tool.definition.function.name, tool]),
  );
  const definitions = tools.map((tool) => tool.definition);
  return {
    definitions,
    get(name) {
      return byName.get(name);
    },
  };
};

const requireValue = (argv, index, flag) => {
  const value = argv[index];
  if (!value) throw new Error(`${flag} requires a value.`);
  return value;
};

const parseMaxSteps = (value) => {
  const maxSteps = Number(value);
  const inRange =
    Number.isInteger(maxSteps) &&
    maxSteps >= MIN_STEPS &&
    maxSteps <= MAX_STEPS;
  if (!inRange) {
    throw new Error('--max-steps must be an integer from 1 to 200.');
  }
  return maxSteps;
};

const flagHelp = (options) => {
  options.help = true;
};

const flagYes = (options) => {
  options.autoApprove = true;
};

const flagModel = (options, argv, i) => {
  options.model = requireValue(argv, i + 1, '--model');
  return 1;
};

const flagMaxSteps = (options, argv, i) => {
  const value = requireValue(argv, i + 1, '--max-steps');
  options.maxSteps = parseMaxSteps(value);
  return 1;
};

const flagWorkspace = (options, argv, i) => {
  options.workspace = requireValue(argv, i + 1, '--workspace');
  return 1;
};

const FLAGS = {
  '--help': flagHelp,
  '-h': flagHelp,
  '--yes': flagYes,
  '-y': flagYes,
  '--model': flagModel,
  '--max-steps': flagMaxSteps,
  '--workspace': flagWorkspace,
};

const parseArgs = (argv) => {
  const envModel = process.env.TINY_AGENT_MODEL;
  const options = {
    autoApprove: false,
    model: envModel || config.TINY_AGENT_MODEL || DEFAULT_MODEL,
    maxSteps: DEFAULT_MAX_STEPS,
    workspace: process.cwd(),
    taskParts: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const handle = FLAGS[arg];
    if (handle) {
      const consumed = handle(options, argv, i) ?? 0;
      i += consumed;
      continue;
    }
    if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    options.taskParts.push(arg);
  }

  options.task = options.taskParts.join(' ').trim();
  return options;
};

const approvalMode = (autoApprove, workspace) => {
  if (autoApprove) return 'automatic';
  if (workspace.gitRoot) {
    return `in-repo (ask for paths outside ${workspace.gitRoot})`;
  }
  return 'interactive';
};

const resolveApiKey = () => {
  const fromEnv = process.env.GEMINI_API_KEY;
  const fromConfig = config.GEMINI_API_KEY;
  const raw = fromEnv || fromConfig || '';
  return raw.trim();
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));

  if (options.help || !options.task) {
    console.log(USAGE);
    process.exitCode = options.help ? 0 : 1;
    return;
  }

  if (!resolveApiKey()) {
    if (createdConfig) {
      console.log(color.warn('Created config.js\n'));
    }
    console.log(color.error('GEMINI_API_KEY is not set.\n'));
    console.log(USAGE);
    process.exitCode = 1;
    return;
  }

  const workspace = await createWorkspace(options.workspace);
  const provider = createGeminiProvider({ model: options.model });
  const toolRegistry = createToolRegistry();
  const permissions = createPermissions({ autoApprove: options.autoApprove });
  const approval = approvalMode(options.autoApprove, workspace);

  console.log(color.muted(`workspace: ${workspace.root}`));
  console.log(color.title(`model:     ${provider.model}`));
  console.log(color.muted(`approval:  ${approval}`));

  try {
    const finalText = await runAgent({
      task: options.task,
      provider,
      toolRegistry,
      permissions,
      workspace,
      maxSteps: options.maxSteps,
    });
    console.log(color.final('\n=== final ===\n'));
    console.log(finalText);
  } finally {
    permissions.close();
  }
};

main().catch((error) => {
  console.error(color.error(`\nFatal: ${errorText(error)}`));
  process.exitCode = 1;
});
