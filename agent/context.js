'use strict';

const CHARS_PER_TOKEN = 4;
const DEFAULT_BUDGET = 80_000;
const KEEP_RECENT_RESULTS = 4;
const LABEL_CHARS = 60;

const estimateTokens = (text) => {
  const chars = text?.length ?? 0;
  return Math.ceil(chars / CHARS_PER_TOKEN);
};

const clipLabel = (text) => {
  const flat = text.replaceAll('\n', ' ').trim();
  if (flat.length <= LABEL_CHARS) return flat;
  return `${flat.slice(0, LABEL_CHARS - 1)}…`;
};

const argLabel = (argsText) => {
  try {
    const args = JSON.parse(argsText ?? '{}');
    for (const value of Object.values(args)) {
      if (typeof value === 'string' && value !== '') return clipLabel(value);
    }
  } catch {
    // keep the stub short when arguments are not valid JSON
  }
  return '';
};

const contentText = (content) => {
  if (typeof content === 'string') return content;
  return JSON.stringify(content ?? '');
};

const messageTokens = (message) => {
  let text = contentText(message?.content);
  for (const call of message?.tool_calls ?? []) {
    text += call.function?.arguments ?? '';
  }
  return estimateTokens(text);
};

const contextTokens = (messages) =>
  messages.reduce((sum, message) => sum + messageTokens(message), 0);

const toolCallInfo = (messages) => {
  const info = new Map();
  for (const message of messages) {
    for (const call of message?.tool_calls ?? []) {
      info.set(call.id, {
        name: call.function?.name ?? 'tool',
        label: argLabel(call.function?.arguments),
      });
    }
  }
  return info;
};

const stubText = (info) => {
  const source = info ? `${info.name} ${info.label}`.trim() : 'tool';
  return (
    `[Pruned ${source}: the older tool result was removed to stay within ` +
    'the context budget. Run the tool again if you still need it.]'
  );
};

const prunableIndexes = (messages) => {
  const toolIndexes = [];
  messages.forEach((message, index) => {
    if (message?.role === 'tool') toolIndexes.push(index);
  });
  const keepFrom = Math.max(0, toolIndexes.length - KEEP_RECENT_RESULTS);
  return toolIndexes.slice(0, keepFrom);
};

const pruneMessages = (messages, budget = DEFAULT_BUDGET) => {
  let total = contextTokens(messages);
  const candidates = prunableIndexes(messages);
  if (total <= budget || candidates.length === 0) {
    return { messages, pruned: 0, tokens: total };
  }

  const info = toolCallInfo(messages);
  const result = [...messages];
  let pruned = 0;
  for (const index of candidates) {
    if (total <= budget) break;
    const original = messages[index];
    const stub = stubText(info.get(original.tool_call_id));
    result[index] = { ...original, content: stub };
    total += estimateTokens(stub) - messageTokens(original);
    pruned += 1;
  }
  return { messages: result, pruned, tokens: total };
};

module.exports = {
  CHARS_PER_TOKEN,
  DEFAULT_BUDGET,
  KEEP_RECENT_RESULTS,
  estimateTokens,
  contextTokens,
  pruneMessages,
};
