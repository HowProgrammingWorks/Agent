'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { isError, isHashObject, jsonParse } = require('metautil');
const concolor = require('concolor');

const color = concolor({
  step: 'b,blue',
  tool: 'b,yellow',
  muted: 'f,white',
  warn: 'b,yellow',
  error: 'b,red',
});

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

const resultStatus = (rendered) => {
  if (rendered.startsWith('ERROR:')) return 'error';
  if (rendered.startsWith('DENIED:')) return 'denied';
  return 'ok';
};

const parseToolArgs = (argsText) => {
  try {
    const args = jsonParse(argsText);
    if (isHashObject(args)) return args;
  } catch {
    return {}; // model sent invalid JSON
  }
  return {};
};

const runToolCall = async (call, context) => {
  const { toolRegistry, permissions, workspace, logger, emit } = context;
  const name = call.function?.name;
  const argsText = call.function?.arguments ?? '{}';
  const tool = toolRegistry.get(name);
  const args = parseToolArgs(argsText);

  logger.log(color.tool(`\n> ${name} ${argsText}`));
  await emit('tool', { name, args, argsText });

  let result;
  try {
    if (!tool) throw new Error(`Unknown tool requested: ${name}`);
    const parsed = jsonParse(argsText);
    if (!isHashObject(parsed)) throw new Error('Invalid tool arguments.');
    const approved = await permissions.approve(tool, parsed, { workspace });
    if (!approved) {
      result = 'DENIED: User did not approve this tool call.';
    } else {
      result = await tool.execute(parsed, { workspace });
    }
  } catch (error) {
    result = `ERROR: ${errorText(error)}`;
  }

  const rendered = renderToolResult(result);
  const preview = rendered.slice(0, LOG_RESULT_CHARS);
  const status = resultStatus(rendered);
  if (status === 'error') logger.log(color.error(preview));
  else if (status === 'denied') logger.log(color.warn(preview));
  else logger.log(color.muted(preview));
  await emit('result', { name, args, status, preview });
  return {
    role: 'tool',
    content: rendered,
    tool_call_id: call.id,
  };
};

const initialMessages = (task, instructions, priorMessages) => {
  if (priorMessages) {
    return [...priorMessages, { role: 'user', content: task }];
  }
  return [
    { role: 'system', content: instructions.trim() },
    { role: 'user', content: task },
  ];
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
  onEvent,
  priorMessages,
}) => {
  const emit = async (type, data = {}) => {
    await onEvent?.({ type, ...data });
  };

  const messages = initialMessages(task, instructions, priorMessages);
  const toolContext = {
    toolRegistry,
    permissions,
    workspace,
    logger,
    emit,
  };

  for (let step = 1; step <= maxSteps; step += 1) {
    const model = provider.model;
    logger.log(color.step(`\n--- step ${step}/${maxSteps} · ${model} ---`));
    await emit('step', { step, maxSteps, model });

    const response = await provider.respond({
      messages,
      tools: toolRegistry.definitions,
    });
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

module.exports = { runAgent };
