'use strict';

module.exports = {
  // OpenAI-compatible Chat Completions API.
  // Gemini example: https://aistudio.google.com/apikey
  API_KEY: '',
  BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  MODEL: 'gemini-3.5-flash-lite',
  FALLBACK_MODELS: ['gemini-3.5-flash', 'gemini-3.6-flash'],
};
