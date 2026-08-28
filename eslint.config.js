'use strict';

const init = require('eslint-config-metarhia');

module.exports = [
  { ignores: ['.cursor/**'] },
  ...init,
  {
    rules: {
      camelcase: ['error', { properties: 'never' }],
      quotes: ['error', 'single', { avoidEscape: true }],
    },
  },
];
