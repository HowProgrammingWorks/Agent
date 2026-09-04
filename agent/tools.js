'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { bytesToSize, isHashObject } = require('metautil');

const command = require('./command.js');
const globmatch = require('./globmatch.js');
const textfile = require('./textfile.js');
const { walkFiles } = require('./walk.js');
const { workspace } = require('./workspace.js');

const TOOLS_DIR = path.join(__dirname, '..', 'tools');

const api = {
  ...globmatch,
  ...textfile,
  ...command,
  walkFiles,
  bytesToSize,
  isHashObject,
};

const environment = { api, workspace };

const PLACEHOLDER = /\{([a-z0-9_]+)\}/gi;

const interpolate = (template, args) => {
  const filled = template.replace(PLACEHOLDER, (_match, key) => {
    if (!Object.hasOwn(args, key)) return '';
    const value = args[key];
    if (value === undefined || value === null) return '';
    if (Array.isArray(value)) return `${value.length}`;
    return `${value}`;
  });
  return filled.trim();
};

const normalizeTool = (execute, spec) => {
  const definition = { type: spec.type, function: spec.function };
  const name = definition.function.name;
  const needsApproval = spec.needsApproval === true;
  const kind = spec.trust ?? 'always';
  const trust = () => kind;
  const template = spec.describe;
  const describe = (args) => {
    if (typeof template !== 'string' || template.length === 0) return name;
    const text = interpolate(template, args);
    return text || name;
  };
  const run = (args) => execute(args, environment);
  return { needsApproval, trust, describe, execute: run, definition };
};

const loadTool = (dirent) => {
  if (!dirent.isDirectory()) return null;
  const name = dirent.name;
  const jsPath = path.join(TOOLS_DIR, name, `${name}.js`);
  const jsonPath = path.join(TOOLS_DIR, name, `${name}.json`);
  if (!fs.existsSync(jsPath)) return null;
  if (!fs.existsSync(jsonPath)) return null;
  const execute = require(jsPath);
  if (typeof execute !== 'function') return null;
  const spec = require(jsonPath);
  return normalizeTool(execute, spec);
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
