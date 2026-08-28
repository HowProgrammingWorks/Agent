tiny-agent — small modular coding-agent harness

Usage:
node start.js [options] "task"
npm start -- [options] "task"

Options:
--yes, -y Auto-approve all write/edit/bash tool calls
--model <name> Model name (default: config.js, TINY_AGENT_MODEL, or gemini-3.5-flash-lite)
Busy models fall back to gemini-3.5-flash, then gemini-3.6-flash
--max-steps <n> Maximum agent turns (default: 30)
--workspace <path> Workspace root (default: current directory)
--help, -h Show this help

Examples:
node start.js "Explain this project"
node start.js "Fix the failing tests"
node start.js --yes --model gemini-3.5-flash-lite "Add input validation and run tests"

Config (config.js):
Created automatically if missing.
GEMINI_API_KEY Required: paste an AIza key between --- >8 ---
Get a key: https://aistudio.google.com/apikey
See README.md (Install). GEMINI_API_KEY in the environment also works.
TINY_AGENT_MODEL Optional default model override
TINY_AGENT_FALLBACK_MODELS Optional list used when the primary model returns 503

Environment:
GEMINI_API_KEY Overrides config.js
TINY_AGENT_MODEL Overrides config.js
