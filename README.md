# tiny-agent

> small, modular coding-agent harness for Node.js. It demonstrates the core loop behind agentic coding tools without hiding the mechanism behind a framework

## What it has

- Gemini provider via the [OpenAI-compatible endpoint](https://ai.google.dev/gemini-api/docs/openai)
- Agent loop with function/tool calling
- `read`, `write`, `edit`, and `bash`
- JSON schemas for tools
- File workspace containment checks, including symlink-aware checks
- Interactive approval before writes, edits, and shell commands that leave the git repo
- In a git repo, in-project write/edit/bash calls are auto-approved; outer paths still prompt
- `--yes` for automatic approval of every write/edit/bash call, including outer paths
- Step limit and tool-output truncation
- Configurable model and workspace
- Automatic fallback to `gemini-3.5-flash` / `gemini-3.6-flash` when the primary model returns 503 high-demand

## Requirements

- Node.js 20+
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)

## Install

```bash
npm install
```

If `config.js` is missing, `start.js` creates it from a template. Put your Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey) in `config.js` between the `--- >8 ---` markers:

```js
module.exports = {
  GEMINI_API_KEY: 'AIza...',
  TINY_AGENT_MODEL: 'gemini-3.5-flash-lite',
};
```

`config.js` is gitignored. Environment variables `GEMINI_API_KEY` and `TINY_AGENT_MODEL` override the file if set.

## Run

From the project you want the agent to operate on:

```bash
node /path/to/tiny-agent/start.js "Inspect this project and explain what it does"
```

Or, from inside this repository:

```bash
npm start -- "Inspect this project and explain what it does"
```

To point at another workspace:

```bash
npm start -- --workspace ../my-project "Fix the failing tests"
```

If the workspace is a git repo, `write`, `edit`, and `bash` that stay inside that repo are auto-approved. The agent still asks before a bash command that references a path outside the repo (for example `/tmp` or `~/other-project`).

If the workspace is not a git repo, those tools always require approval. `--yes` auto-approves them in either case:

```bash
npm start -- --yes --workspace ../my-project "Fix the tests and verify the fix"
```

Choose a model explicitly:

```bash
npm start -- --model gemini-3.5-flash-lite "Review the code for obvious bugs"
```

Or use an environment variable:

```bash
export TINY_AGENT_MODEL="gemini-3.5-flash-lite"
```

## Architecture

```text
start.js              CLI entry point
lib/
├── config.template.js Copied to config.js if missing
├── usage.md          CLI help text
├── agent.js          Agent/tool loop
├── instructions.md   System prompt for the agent
├── llm.js            Gemini provider (OpenAI Chat Completions client)
├── color.js          Terminal color theme (concolor)
├── permissions.js    Human approval gate
├── workspace.js      Workspace/path safety
└── tools/
    ├── read/
    │   ├── read.json
    │   └── read.js
    ├── write/
    │   ├── write.json
    │   └── write.js
    ├── edit/
    │   ├── edit.json
    │   └── edit.js
    └── bash/
        ├── bash.json
        └── bash.js
```

The loop is intentionally simple:

```text
user task
   ↓
model response
   ↓
tool calls? ── no ──→ final answer
   │
  yes
   ↓
approve + execute local tools
   ↓
append tool results
   ↓
model response again
```

Gemini is reached with the official OpenAI SDK pointed at `https://generativelanguage.googleapis.com/v1beta/openai/` and `chat.completions.create`. That is the documented compatibility surface; the native OpenAI Responses API is not used.

## Safety boundary

The file tools reject absolute paths and paths that escape the configured workspace. They also check resolved paths/ancestors to reduce symlink escapes.

The `bash` tool is different: a shell command can access anything available to the Node.js process, including paths outside the workspace and the network. When the workspace is a git repo, in-repo bash is auto-approved and only outer paths prompt. Interactive approval helps, but it is **not a sandbox**. Do not use `--yes` on an untrusted task or valuable host environment. Run the harness in a container/VM or another OS-level sandbox if you want a meaningful shell security boundary.

## Useful commands

Syntax-check all source files:

```bash
npm run check
```

Show CLI help:

```bash
npm start -- --help
```

## Intentionally omitted

To keep the harness small, this version does not include streaming, persistent conversations, diff rendering, provider abstraction beyond Gemini's OpenAI-compatible endpoint, automatic context compaction, git checkpoints, a terminal, or an OS-level sandbox. Those are natural next layers after the basic harness is understood.
