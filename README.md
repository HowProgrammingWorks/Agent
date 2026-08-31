# tiny-agent

> small, modular coding-agent harness for Node.js. It demonstrates the core loop behind agentic coding tools without hiding the mechanism behind a framework

## Run

Node.js 20+ and an API key for any OpenAI-compatible Chat Completions provider.

```bash
npm install
npm start
```

First run copies `agent/config.template.js` to `config.js`. Fill in `API_KEY`, `BASE_URL`, and `MODEL`. Open another directory with `npm start -- /my-project`.

## Loop

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

Tools are `read`, `write`, `edit`, `bash`, `grep`, `glob`, `delete`, `patch`, `check`, `fetch`, and `todo`. Specs live in `tools/{name}/{name}.json`. The LLM client is the OpenAI SDK; point it at any compatible endpoint.

```text
start.js            terminal IDE
agent/agent.js      tool loop
agent/llm.js        OpenAI Chat Completions client
ide/                tree, editor, shell, chat
tools/{name}/       {name}.json + {name}.js
```

- Agent loop
- Set of tools
- Any OpenAI-compatible provider via `BASE_URL` in `config.js`
- Configurable model via `MODEL` and `FALLBACK_MODELS`
- File workspace containment checks, including symlink-aware
  checks
- Interactive approval before writes, edits, and shell commands
  that leave the git repo
- In a git repo, in-project write/edit/bash calls are
  auto-approved; outer paths still prompt
- Step limit and tool-output truncation
- Context budget: when the conversation grows past
  `CONTEXT_TOKEN_BUDGET` estimated tokens, older tool results are
  pruned to stubs while the recent ones stay intact

## Safety

File tools stay inside the workspace. `bash` does not: it can reach the network and paths outside the project. In a git repo, in-project writes, edits, and bash auto-approve; otherwise you are prompted. This is **not a sandbox**. Do not run an untrusted task on a valuable host.

## License

Copyright (c) 2026 How.Programming.Works contributors. Licensed under the [MIT License](LICENSE).
