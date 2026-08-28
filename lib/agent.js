'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { isError, isHashObject, jsonParse } = require('metautil');

const { color } = require('./color.js');

const DEFAULT_INSTRUCTIONS = fs
  .readFileSync(path.join(__dirname, 'instructions.md'), 'utf8')
  .trim();
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
  const text =
    typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  if (text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars);
  return `${truncated}\n...[tool result truncated by harness]`;
};

const partText = (part) => {
  if (typeof part === 'string') return part;
  return part?.text ?? '';
};

const messageText = (message) => {
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(partText).join('');
  return '';
};

const runToolCall = async (call, context) => {
  const { toolRegistry, permissions, workspace, logger } = context;
  const name = call.function?.name;
  const argsText = call.function?.arguments ?? '{}';
  const tool = toolRegistry.get(name);

  logger.log(color.tool(`\n> ${name} ${argsText}`));

  let result;
  try {
    if (!tool) throw new Error(`Unknown tool requested: ${name}`);
    const args = jsonParse(argsText);
    if (!isHashObject(args)) throw new Error('Invalid tool arguments.');
    const approved = await permissions.approve(tool, args, { workspace });
    if (!approved) {
      result = 'DENIED: User did not approve this tool call.';
    } else {
      result = await tool.execute(args, { workspace });
    }
  } catch (error) {
    result = `ERROR: ${errorText(error)}`;
  }

  const rendered = renderToolResult(result);
  const preview = rendered.slice(0, LOG_RESULT_CHARS);
  if (rendered.startsWith('ERROR:')) logger.log(color.error(preview));
  else if (rendered.startsWith('DENIED:')) logger.log(color.warn(preview));
  else logger.log(color.muted(preview));
  return {
    role: 'tool',
    content: rendered,
    tool_call_id: call.id,
  };
};

const runAgent = async ({
  task,
  provider,
  toolRegistry,
  permissions,
  workspace,
  maxSteps = 30,
  logger = console,
  instructions = DEFAULT_INSTRUCTIONS,
}) => {
  const messages = [
    { role: 'system', content: instructions.trim() },
    { role: 'user', content: task },
  ];
  const toolContext = { toolRegistry, permissions, workspace, logger };

  for (let step = 1; step <= maxSteps; step += 1) {
    logger.log(
      color.step(`\n--- step ${step}/${maxSteps} · ${provider.model} ---`),
    );

    const response = await provider.respond({
      messages,
      tools: toolRegistry.definitions,
    });
    const message = response.choices?.[0]?.message;
    if (!message) throw new Error('Model returned no message.');

    messages.push(message);

    const calls = message.tool_calls ?? [];
    if (calls.length === 0) return messageText(message) || EMPTY_REPLY;

    for (const call of calls) {
      const output = await runToolCall(call, toolContext);
      messages.push(output);
    }
  }

  throw new Error(`Agent exceeded the maximum of ${maxSteps} steps.`);
};

module.exports = { runAgent };
