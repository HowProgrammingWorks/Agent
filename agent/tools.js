'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { isHashObject } = require('metautil');

const globmatch = require('./globmatch.js');
const textfile = require('./textfile.js');
const { walkFiles } = require('./walk.js');
const { workspace } = require('./workspace.js');

const TOOLS_DIR = path.join(__dirname, '..', 'tools');

const environment = {
  api: { ...globmatch, ...textfile },
  walkFiles,
  workspace,
};

const isTool = (value) => {
  if (!isHashObject(value)) return false;
  return typeof value.execute === 'function';
};

const isFactory = (value) => typeof value === 'function';

const asTrust = (trust) => {
  if (typeof trust === 'function') return trust;
  return () => trust;
};

const normalizeTool = (tool, definition) => {
  const name = definition.function.name;
  const needsApproval = tool.needsApproval === true;
  const trust = asTrust(tool.trust ?? 'always');
  const describe = tool.describe ?? (() => name);
  const execute = (args) => tool.execute(args);
  return { needsApproval, trust, describe, execute, definition };
};

const loadTool = (dirent) => {
  if (!dirent.isDirectory()) return null;
  const name = dirent.name;
  const jsPath = path.join(TOOLS_DIR, name, `${name}.js`);
  const jsonPath = path.join(TOOLS_DIR, name, `${name}.json`);
  if (!fs.existsSync(jsPath)) return null;
  if (!fs.existsSync(jsonPath)) return null;
  const exported = require(jsPath);
  const factory = Object.values(exported).find(isFactory);
  if (!factory) return null;
  const tool = factory(environment);
  if (!isTool(tool)) return null;
  const definition = require(jsonPath);
  return normalizeTool(tool, definition);
};

const dirents = fs.readdirSync(TOOLS_DIR, { withFileTypes: true });
const loaded = dirents.map(loadTool);
const found = loaded.filter((tool) => tool !== null);
const entries = found.map((tool) => {
  const name = tool.definition.function.name;
  return [name, tool];
});
const registry = new Map(entries);

module.exports = { registry };
