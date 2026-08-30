# tiny-agent

> small, modular coding-agent harness for Node.js. It demonstrates the core loop behind agentic coding tools without hiding the mechanism behind a framework

## Run

Node.js 20+ and an API key for any OpenAI-compatible Chat Completions provider ([Gemini](https://aistudio.google.com/apikey) is the example).

```bash
npm install
npm start
```

First run copies `lib/config.template.js` to `config.js`. Put the key in `API_KEY` there. Open another directory with `npm start -- /my-project`.

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

Tools are `read`, `write`, `edit`, `bash`, `grep`, `glob`, `delete`, `patch`, `check`, `fetch`, and `todo`. Specs live in `lib/tools.md`. The LLM client is the OpenAI SDK; point it at any compatible endpoint.

```text
start.js            terminal IDE
lib/agent.js        tool loop
lib/llm.js          OpenAI Chat Completions client
lib/ide/            tree, editor, shell, chat
lib/tools/{name}/   {name}.json + {name}.js
```

- Agent loop
- Set of tools
- Any OpenAI-compatible provider (Gemini is only
  the example in this repo, not a lock-in) via the
  [OpenAI-compatible endpoint](https://ai.google.dev/gemini-api/
  docs/openai)
- Configurable model via `config.js`
- File workspace containment checks, including symlink-aware
  checks
- Interactive approval before writes, edits, and shell commands
  that leave the git repo
- In a git repo, in-project write/edit/bash calls are
  auto-approved; outer paths still prompt
- Step limit and tool-output truncation

## Safety

File tools stay inside the workspace. `bash` does not: it can reach the network and paths outside the project. In a git repo, in-project writes, edits, and bash auto-approve; otherwise you are prompted. This is **not a sandbox**. Do not run an untrusted task on a valuable host.

## License

Copyright (c) 2026 How.Programming.Works contributors. Licensed under the [MIT License](LICENSE).
