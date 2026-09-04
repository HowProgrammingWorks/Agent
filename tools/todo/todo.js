'use strict';

const STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'];

let items = [];

const normalizeItem = (item, index, api) => {
  if (!api.isHashObject(item)) {
    throw new Error(`todos[${index}] must be an object.`);
  }
  const id = item.id;
  const content = item.content;
  const status = item.status;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error(`todos[${index}].id must be a non-empty string.`);
  }
  if (typeof content !== 'string') {
    throw new Error(`todos[${index}].content must be a string.`);
  }
  if (!STATUSES.includes(status)) {
    const allowed = STATUSES.join(', ');
    throw new Error(`todos[${index}].status must be one of: ${allowed}.`);
  }
  return { id, content, status };
};

const formatList = (list) => {
  if (list.length === 0) return '(no todos)';
  const lines = list.map((item, index) => {
    const number = index + 1;
    const { status, id, content } = item;
    return `${number}. [${status}] ${id}: ${content}`;
  });
  return lines.join('\n');
};

module.exports = async (args, environment) => {
  const { api } = environment;
  const todos = args.todos;
  if (!Array.isArray(todos)) throw new Error('todos must be an array.');
  const merge = args.merge !== false;
  const next = todos.map((item, index) => normalizeItem(item, index, api));
  if (!merge) {
    items = next;
    return formatList(items);
  }
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const item of next) {
    byId.set(item.id, item);
  }
  items = [...byId.values()];
  return formatList(items);
};
