'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { isError, isHashObject, jsonParse } = require('metautil');

const { registry } = require('./tools.js');

const INSTRUCTIONS_FILE = path.join(__dirname, 'instructions.md');
const INSTRUCTIONS = fs.readFileSync(INSTRUCTIONS_FILE, 'utf8').trim();
const MAX_RESULT_CHARS = 60_000;
const LOG_RESULT_CHARS = 4_000;
const EMPTY_REPLY = '(Agent finished without a text response.)';

const errorText = (error) => {
  if (isError(error)) return error.message;
  if (typeof error === 'string') return error;
  if (error === null || error === undefined) return '';
  return `${error}`;
};

const renderToolResult = (value, maxChars = MAX_RESULT_CHARS) => {
  const isText = typeof value === 'string';
  const serialized = isText ? value : JSON.stringify(value, null, 2);
  if (serialized.length <= maxChars) return serialized;
  const truncated = serialized.slice(0, maxChars);
  return `${truncated}\n...[tool result truncated by harness]`;
};

const partText = (part) => {
  if (typeof part === 'string') return part;
  return part?.text ?? '';
};

const messageText = (message) => {
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts = content.map(partText);
  return parts.join('');
};

const resultStatus = (rendered) => {
  if (rendered.startsWith('ERROR:')) return 'error';
  if (rendered.startsWith('DENIED:')) return 'denied';
  return 'ok';
};

const parseToolArgs = (argsText) => {
  const args = jsonParse(argsText);
  if (isHashObject(args)) return args;
  return null;
};

const runToolCall = async (call, context) => {
  const name = call.function?.name;
  const argsText = call.function?.arguments ?? '{}';
  const tool = registry.get(name);
  const args = parseToolArgs(argsText);

  await context.emit('tool', { name, args, argsText });

  let result;
  try {
    if (!tool) throw new Error(`Unknown tool requested: ${name}`);
    if (!args) throw new Error('Invalid tool arguments.');
    const approved = await context.permissions.approve(tool, args);
    if (!approved) result = 'DENIED: User did not approve this tool call.';
    else result = await tool.execute(args);
  } catch (error) {
    result = `ERROR: ${errorText(error)}`;
  }

  const rendered = renderToolResult(result);
  const preview = rendered.slice(0, LOG_RESULT_CHARS);
  const status = resultStatus(rendered);
  await context.emit('result', { name, args, status, preview });
  const message = {
    role: 'tool',
    content: rendered,
    tool_call_id: call.id,
  };
  return message;
};

const initialMessages = (task, instructions, priorMessages) => {
  if (priorMessages) return [...priorMessages, { role: 'user', content: task }];
  return [
    { role: 'system', content: instructions },
    { role: 'user', content: task },
  ];
};

const runAgent = async (options) => {
  const { task, provider, permissions } = options;
  const { maxSteps = 30, instructions = INSTRUCTIONS } = options;
  const { onEvent, priorMessages } = options;

  const emit = async (type, data = {}) => {
    await onEvent?.({ type, ...data });
  };

  const messages = initialMessages(task, instructions, priorMessages);
  const toolContext = { permissions, emit };

  for (let step = 1; step <= maxSteps; step += 1) {
    const model = provider.model;
    await emit('step', { step, maxSteps, model });

    const loaded = [...registry.values()];
    const tools = loaded.map((tool) => tool.definition);
    const response = await provider.respond({ messages, tools });
    const message = response.choices?.[0]?.message;
    if (!message) throw new Error('Model returned no message.');

    messages.push(message);

    const text = messageText(message);
    const calls = message.tool_calls ?? [];
    if (calls.length === 0) {
      const finalText = text || EMPTY_REPLY;
      await emit('assistant', { text: finalText });
      return { text: finalText, messages };
    }
    if (text) await emit('assistant', { text });

    for (const call of calls) {
      const output = await runToolCall(call, toolContext);
      messages.push(output);
    }
  }

  throw new Error(`Agent exceeded the maximum of ${maxSteps} steps.`);
};

module.exports = { errorText, runAgent };
