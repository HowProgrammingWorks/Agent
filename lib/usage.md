tiny-agent — small modular coding-agent harness

Usage:
node start.js [options] [task]
npm start -- [options] [task]

With no task, opens the terminal IDE (file tree, editor, shell, agent).
With a task and no --ide, runs the agent once in the CLI and prints the result.

Options:
--ide Open the terminal IDE (also the default when no task is given)
--yes, -y Auto-approve all write/edit/bash tool calls
--model <name> Model name (default: config.js, TINY_AGENT_MODEL, or gemini-3.5-flash-lite)
Busy models fall back to gemini-3.5-flash, then gemini-3.6-flash
--max-steps <n> Maximum agent turns (default: 30)
--workspace <path> Workspace root (default: current directory)
--help, -h Show this help

IDE keys:
tab Cycle tree / editor / terminal / agent
click a pane to focus it; click a file to open it
click ✕ in the title bar to quit
click 🧠 in the title bar for help; ? from the tree or editor view
f10 Quit
i Edit in the editor; esc return to view
l Toggle line numbers (editor view)
drag in the editor, terminal, or chat to copy text
shift+arrows Select in the editor or chat input
ctrl+c Copy selection in the editor or chat; quit from other panes
ctrl+v Paste in the editor or chat input
ctrl+z Undo in the editor; ctrl+shift+z redo
ctrl+home / ctrl+end Jump to the start or end of the file
ctrl+b Hide or show the file tree
ctrl+space Hide or show the terminal
ctrl+l Insert a file/line:col-line:col reference into chat
enter Open a file or folder; send agent text; run a shell command; new line in the editor
/ Search the file tree

Examples:
node start.js
node start.js --workspace ../my-project
node start.js "Explain this project"
node start.js --ide --yes "Fix the failing tests"
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
