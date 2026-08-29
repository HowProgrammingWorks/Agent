'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { isHashObject } = require('metautil');

const TOOLS_DIR = path.join(__dirname, 'tools');

const isTool = (value) =>
  isHashObject(value) &&
  value.definition &&
  typeof value.execute === 'function';

const loadTool = (dirent) => {
  if (!dirent.isDirectory()) return null;
  const name = dirent.name;
  const jsPath = path.join(TOOLS_DIR, name, `${name}.js`);
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

module.exports = { createToolRegistry };
