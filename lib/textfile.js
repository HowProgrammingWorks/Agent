'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { isUtf8 } = require('node:buffer');

const BINARY_PROBE = 8 * 1024;
const MAX_OUTPUT_CHARS = 50_000;

const isBinaryBuffer = (buf) => {
  const n = Math.min(buf.length, BINARY_PROBE);
  for (let i = 0; i < n; i += 1) {
    if (buf[i] === 0) return true;
  }
  return false;
};

const assertTextBuffer = (buf, label = 'content') => {
  if (isBinaryBuffer(buf)) {
    throw new Error(`${label} looks binary (NUL in the first 8 KiB).`);
  }
  if (!isUtf8(buf)) {
    throw new Error(`${label} is not valid UTF-8.`);
  }
};

const bufferFromText = (text, label = 'content') => {
  if (typeof text !== 'string') {
    throw new Error(`${label} must be a string.`);
  }
  const buf = Buffer.from(text, 'utf8');
  if (text.includes('\0')) {
    throw new Error(`${label} must not contain NUL bytes.`);
  }
  assertTextBuffer(buf, label);
  return buf;
};

const readTextFile = async (filePath) => {
  const buf = await fs.readFile(filePath);
  assertTextBuffer(buf, filePath);
  return buf.toString('utf8');
};

const atomicWriteFile = async (filePath, content) => {
  const buf = bufferFromText(content, 'content');
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmp = path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);
  try {
    await fs.writeFile(tmp, buf);
    await fs.rename(tmp, filePath);
  } catch (error) {
    try {
      await fs.unlink(tmp);
    } catch {
      // ignore cleanup failure
    }
    throw error;
  }
};

const truncateOutput = (text, maxChars = MAX_OUTPUT_CHARS) => {
  if (text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars);
  return `${truncated}\n...[output truncated]`;
};

const formatNumberedLines = (lines, startLine, totalLines) => {
  if (totalLines === 0) return '(empty file)';
  if (lines.length === 0) {
    return `(no lines at offset ${startLine}; file has ${totalLines} lines)`;
  }
  const endLine = startLine + lines.length - 1;
  const width = `${totalLines}`.length;
  const body = lines.map((line, index) => {
    const num = startLine + index;
    const label = `${num}`.padStart(width, ' ');
    return `${label}|${line}`;
  });
  const remaining = totalLines - endLine;
  if (remaining > 0) {
    body.push(`... ${remaining} lines not shown`);
  }
  return body.join('\n');
};

module.exports = {
  MAX_OUTPUT_CHARS,
  isBinaryBuffer,
  assertTextBuffer,
  bufferFromText,
  readTextFile,
  atomicWriteFile,
  truncateOutput,
  formatNumberedLines,
};
