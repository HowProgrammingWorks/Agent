tiny-agent — small modular coding-agent harness

Usage:
node start.js [project-root]
npm start -- [project-root]

Opens the terminal IDE (file tree, editor, shell, agent).
The workspace is the given directory, or the current directory if omitted.
Model, endpoint, and key come from config.js (MODEL, BASE_URL, API_KEY).

IDE keys:
tab Cycle tree / editor / terminal / agent
click a pane to focus it; click a file to open it
click ✕ in the title bar to quit
click 🧠 in the title bar for help; ? from the tree
f10 Quit
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
node start.js ../my-project

Config (config.js):
Created automatically if missing.
API_KEY Required: OpenAI-compatible API key
BASE_URL Required: Chat Completions endpoint
MODEL Required: default model
FALLBACK_MODELS Optional list used when the primary model returns 503
See README.md.
