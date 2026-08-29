'use strict';

const { delay } = require('metautil');
const OpenAI = require('openai');
const concolor = require('concolor');

const color = concolor({
  warn: 'b,yellow',
});

const config = require('../config.js');

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const DEFAULT_FALLBACKS = ['gemini-3.5-flash', 'gemini-3.6-flash'];
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;
const RETRY_STATUSES = [429, 503];
const RETRY_MARKERS = ['UNAVAILABLE', 'high demand'];

const isRetryable = (error) => {
  if (RETRY_STATUSES.includes(error?.status)) return true;
  const message = error?.message;
  const text = typeof message === 'string' ? message : '';
  return RETRY_MARKERS.some((marker) => text.includes(marker));
};

const unique = (values) => [...new Set(values.filter(Boolean))];

const createWithRetry = async (client, body, models, options = {}) => {
  const attempts = options.attempts ?? RETRY_ATTEMPTS;
  const delayMs = options.delayMs ?? RETRY_DELAY_MS;
  const logger = options.logger ?? console;
  let lastError;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    const nextModel = models[index + 1];
    const request = { ...body, model };

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await client.chat.completions.create(request);
        return { response, model };
      } catch (error) {
        lastError = error;
        if (!isRetryable(error)) throw error;
        const status = error.status ?? 503;
        const lastAttempt = attempt === attempts;
        if (nextModel && (lastAttempt || status === 503)) {
          const fromTo = `${model} → ${nextModel}`;
          const notice = `model busy (${status}); switching ${fromTo}`;
          logger.log(color.warn(notice));
          break;
        }
        if (lastAttempt) throw error;
        const wait = delayMs * attempt;
        const seconds = wait / 1000;
        const retry = `${attempt}/${attempts - 1}`;
        logger.log(
          color.warn(`model busy (${status}); retry ${retry} in ${seconds}s`),
        );
        await delay(wait);
      }
    }
  }

  throw lastError ?? new Error('Model request failed after retries.');
};

const createGeminiProvider = (options = {}) => {
  const envKey = process.env.GEMINI_API_KEY;
  const envModel = process.env.TINY_AGENT_MODEL;
  const rawKey = options.apiKey ?? envKey ?? config.GEMINI_API_KEY;
  const apiKey = typeof rawKey === 'string' ? rawKey.trim() : '';
  const configured = options.model ?? envModel ?? config.TINY_AGENT_MODEL;
  const model = configured ?? DEFAULT_MODEL;
  const fallbacks =
    options.fallbacks ?? config.TINY_AGENT_FALLBACK_MODELS ?? DEFAULT_FALLBACKS;
  const baseURL = options.baseURL ?? GEMINI_URL;

  if (!apiKey) {
    const where = 'Paste it into config.js or export it.';
    const docs = 'See README.md (Install).';
    throw new Error(`GEMINI_API_KEY is not set. ${where} ${docs}`);
  }

  if (apiKey.startsWith('gen-lang-client-')) {
    const hint =
      'Open https://aistudio.google.com/apikey and paste the AIza key.';
    throw new Error(
      `GEMINI_API_KEY is a Google Cloud project id, not an API key. ${hint}`,
    );
  }

  const client = new OpenAI({ apiKey, baseURL });
  const logger = options.logger ?? console;
  let activeModel = model;

  return {
    get model() {
      return activeModel;
    },
    async respond({ messages, tools }) {
      const body = {
        model: activeModel,
        messages,
        tools,
        tool_choice: 'auto',
      };
      const models = unique([activeModel, ...fallbacks]);
      const result = await createWithRetry(client, body, models, { logger });
      activeModel = result.model;
      return result.response;
    },
  };
};

module.exports = { GEMINI_URL, createGeminiProvider };
