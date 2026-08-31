'use strict';

const { isHashObject } = require('metautil');

const STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'];

const normalizeItem = (item, index) => {
  if (!isHashObject(item)) {
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

const formatList = (items) => {
  if (items.length === 0) return '(no todos)';
  const lines = items.map((item, index) => {
    const number = index + 1;
    const { status, id, content } = item;
    return `${number}. [${status}] ${id}: ${content}`;
  });
  return lines.join('\n');
};

const todoTool = () => ({
  needsApproval: false,
  items: [],
  async execute(args) {
    const todos = args.todos;
    if (!Array.isArray(todos)) throw new Error('todos must be an array.');
    const merge = args.merge !== false;
    const next = todos.map(normalizeItem);
    if (!merge) {
      this.items = next;
      return formatList(this.items);
    }
    const byId = new Map(this.items.map((item) => [item.id, item]));
    for (const item of next) {
      byId.set(item.id, item);
    }
    this.items = [...byId.values()];
    return formatList(this.items);
  },
});

module.exports = { todoTool };
