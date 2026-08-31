'use strict';

const DEFAULT_MAX = 30_000;
const HARD_MAX = 60_000;
const FETCH_TIMEOUT_MS = 15_000;

const resolveMaxChars = (value) => {
  if (value === undefined || value === null) return DEFAULT_MAX;
  const max = Math.trunc(value);
  if (!Number.isFinite(max) || max < 1) {
    throw new Error('max_chars must be a positive number.');
  }
  return Math.min(max, HARD_MAX);
};

const parseUrl = (urlText) => {
  try {
    return new URL(urlText);
  } catch {
    throw new Error('url must be a valid URL.');
  }
};

const assertHttpUrl = (urlText) => {
  const parsed = parseUrl(urlText);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http: and https: URLs are allowed.');
  }
  return parsed;
};

const fetchWithTimeout = async (urlText, signal) => {
  try {
    return await fetch(urlText, {
      method: 'GET',
      redirect: 'follow',
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const seconds = FETCH_TIMEOUT_MS / 1000;
      throw new Error(`fetch exceeded the ${seconds} second timeout.`);
    }
    throw new Error(`fetch failed: ${error.message}`);
  }
};

const fetchTool = () => ({
  needsApproval: true,
  trust: 'always',
  describe(args) {
    return `fetch ${args.url}`;
  },
  async execute(args) {
    const urlText = args.url;
    if (typeof urlText !== 'string' || urlText.length === 0) {
      throw new Error('url must be a non-empty string.');
    }
    assertHttpUrl(urlText);
    const maxChars = resolveMaxChars(args.max_chars);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetchWithTimeout(urlText, controller.signal);
      const finalUrl = response.url || urlText;
      assertHttpUrl(finalUrl);

      const body = await response.text();
      const header = `status: ${response.status}\nurl: ${finalUrl}\n\n`;
      if (body.length <= maxChars) return `${header}${body}`;
      const clipped = body.slice(0, maxChars);
      const note = `\n...[body truncated at ${maxChars} chars]`;
      return `${header}${clipped}${note}`;
    } finally {
      clearTimeout(timer);
    }
  },
});

module.exports = { fetchTool };
