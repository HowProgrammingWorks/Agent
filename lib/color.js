'use strict';

const concolor = require('concolor');

const color = concolor({
  title: 'b,cyan',
  muted: 'f,white',
  step: 'b,blue',
  tool: 'b,yellow',
  ok: 'green',
  warn: 'b,yellow',
  error: 'b,red',
  final: 'b,green',
});

module.exports = { color };
