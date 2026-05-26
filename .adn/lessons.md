# Lessons

Tactical one-offs discovered while working on this project. Each entry is a single fact + the situation where it applies. Append; do not edit history.

---

## VSCode extension contributions

### `views` contribution rejects `when` clause silently
Context: tried gating `views.scm` with `"when": "scmProvider == git"` so the panel only appears in git workspaces.
Result: VSCode hid the view entirely — no error, no log. Context keys like `scmProvider` are valid only on **menu** contributions, not view contributions.
Apply: do not put `when` on a view contribution. Gate visibility from the extension's `activate()` via `vscode.commands.executeCommand("setContext", ...)` with a custom key, or just let the parent container's own visibility logic handle it.

### `tsconfig.rootDir: "."` + `include: ["src/**", "test/**"]` puts main at `out/src/extension.js`
Context: package.json `"main": "./out/extension.js"` caused "Cannot find module" on activation.
Apply: with rootDir=`.` and multi-dir include, tsc preserves the src/ prefix in the output. Either set `"main": "./out/src/extension.js"` (what we did) or move tests outside `include` and set rootDir=`src`.

### Webview CSP must allow `style-src` inline + script nonce; no external assets
Context: VSCode webviews sandbox aggressively. Browser-style `<link>` to local CSS or `require()` inside the inline script silently fails.
Apply: build the entire UI as one self-contained HTML string with inline `<style>` and one nonce'd `<script>`. For icons that need to be solid+themed, use inline SVG with `fill="currentColor"`.

### Inject SVG into a webview's runtime JS string via `${JSON.stringify(SVG)}`
Context: webview script needs the raw SVG markup at runtime to swap an emoji for an icon inside dynamically-rendered HTML. `bannerEl.innerHTML = "..." + RAW_SVG + "..."` doesn't work because the SVG contains quotes/angle brackets that break the JS literal.
Apply: in the host-side template literal that emits the script, write `const remoteIcon = ${JSON.stringify(REMOTE_SVG)};`. The `JSON.stringify` runs at host build time, escaping the SVG into a valid JS string literal that the runtime script can concat freely.

### Multi-tone source SVG → flatten to currentColor
Context: source SVGs from svgrepo often have multiple explicit `fill="#XXXXXX"` colors. Inlining them locks the icon to those colors and breaks dark/HC themes.
Apply: change all `fill="..."` to either omit (inherit currentColor via the `fill="currentColor"` on `<svg>`) or use `fill-opacity` for the lighter shade. The icon then themes via `color:` CSS.

### `vscode.SecretStorage.get` returns `Thenable`, not `Promise`
Context: passing `secrets.get(...)` as a `Promise<string | undefined>` callback errors `TS2739: missing catch, finally, [Symbol.toStringTag]`.
Apply: type the callback signature as `PromiseLike<string | undefined>` or wrap the call.

---

## Git CLI quirks

### `git diff --cached/--staged` falls through to `--no-index` mode silently
Context: running `git diff --staged` from a directory that isn't a git repo prints "usage: git diff --no-index" and rejects `--staged` as unknown.
Apply: probe for repo root first (walk up looking for `.git`) before calling diff. Throw a clean error instead of letting git's misleading usage block surface to the user.

### Prefer `--cached` over `--staged` for compatibility
Context: `--staged` only exists since Git 2.18 (2018). `--cached` works back to 1.6.
Apply: no upside to requiring the newer spelling.

---

## LLM provider quirks (no-key tier)

### Pollinations responses are sometimes `text/plain`, sometimes `application/json`
Apply: branch on `Content-Type`. If JSON, read `choices[0].message.content`; if plain, treat the whole body as the model output.

### DuckDuckGo AI Chat needs a two-step handshake
Context: GET `/duckchat/v1/status` with `x-vqd-accept: 1` → response header `x-vqd-4` is the session token → POST `/duckchat/v1/chat` with `x-vqd-4: <token>`. Response is SSE; concat `message` fields, ignore `[DONE]`.
Apply: Empty/non-browser UA gets rejected. Send Chrome-on-macOS UA. HTTP 418 means token expired → fetch a fresh vqd and retry once.

### LLM JSON parse: strip ```json fences, accept `{ suggestions: [...] }` wrapper
Apply: even with `response_format: json_object`, ~10% of responses come wrapped. Parser must strip fences first, then look for `[...]` directly OR `"suggestions": [...]`.

---

## Git workflow

### `git add -A` includes random files dropped into the working tree
Context: user dropped 6 SVG files into the project root (asset stash). Running `git add -A && git commit` silently swept all of them into the commit, polluting history with three unrelated `smartphone-*.svg` files.
Apply: before any commit, scan `git status -s` for unexpected `??` entries. If a binary/asset file appears that you didn't touch, ask before adding. Prefer staging by explicit paths over `-A` when the working tree has mystery files.

### When an unwanted file lands in HEAD, prefer `git restore --staged` over amend-rewriting
Context: amending HEAD to drop the files would have been faster but risky during a multi-step commit chain. Removing files from the tree + committing the deletions is cleaner — history records the mistake and the cleanup, both honest.
Apply: only amend if HEAD hasn't been verified yet; otherwise create a follow-up cleanup commit.

### `response_format: json_object` on small models collapses arrays to single objects
Context: Pollinations' anonymous tier (gpt-oss-20b) with `response_format: {type: "json_object"}` returns one bare suggestion object instead of the requested array — JSON schema mode constrains the output to *a* JSON object, not necessarily an array. The parser expecting `[{...}, {...}]` throws "No JSON array found".
Apply: For small models, drop `response_format: json_object` and rely on prompt instruction + parser robustness. Have the parser accept three shapes: bare array `[...]`, `{suggestions: [...]}` wrapper, and bare object `{...}` (wrap as `[obj]`). Set generous `max_tokens` because reasoning models burn tokens before emitting structured output.

### Friendly errors when an endpoint returns HTML
Context: HuggingFace router 401 returns a full HTML page (~10KB) as the response body. Dumping `text.slice(0, 400)` of that into the error message shows the user the start of `<!DOCTYPE html>` — useless.
Apply: detect HTML responses (`text.trim().startsWith("<")`) and either truncate them aggressively or replace with a curated message that includes the actionable next step ("get a token at …").

### Ollama 404 = model not installed; probe `/api/tags` for what IS available
Context: Hardcoding `default_model: llama3.1:8b` breaks every install that doesn't have that specific tag. Ollama returns `{"error":"model 'X' not found"}` with HTTP 404.
Apply: On 404 with "not found" in body, GET `/api/tags`, list installed models, and surface that list plus the `ollama pull <model>` command. Don't pick one automatically — the user has reasons for what they have.

### Anonymous public LLM endpoints break often — verify before shipping
Context: by 2026-05, three "zero-config" providers we relied on had all broken in subtly different ways:
- Pollinations: legacy model id `openai-large` returned 404; anonymous tier dropped to one model `openai-fast` (gpt-oss-20b). GET `/models` lists what's currently exposed.
- DuckDuckGo AI Chat: replaced `x-vqd-4` token with a JS challenge token `x-vqd-hash-1` (base64-encoded obfuscated JS that must be executed in a browser-like env). Reverse-engineering this is not feasible from a Node fetch.
- HuggingFace router (`router.huggingface.co/v1/chat/completions`): now requires `Authorization: Bearer` for every request; anonymous calls return HTML 401.
Apply: before adding/keeping a public no-key provider, curl the exact endpoint with the exact payload you'll send. Don't trust docs — these endpoints change without notice. Auto-chain should only include providers verified within the last week or two. Mark broken providers as "selectable but not in auto chain" rather than removing them — they sometimes come back.

## Tooling / shell

### `npm`/`npx`/`node` not on PATH; nvm shell functions don't survive a non-interactive Bash invocation
Context: on this machine, the user's zsh defines `node`/`npm`/`npx` as lazy-loaded nvm functions. A non-interactive Bash invocation prints `command not found: _load_nvm`.
Apply: prepend `export PATH="$HOME/.nvm/versions/node/v22.22.1/bin:$PATH" && ` to every shell call that needs node. The `_load_nvm: command not found` line in stderr is harmless noise.

### `preLaunchTask 'npm: compile' terminated with exit code 127` in launch.json
Context: VSCode's `type: "npm"` task resolves `npm` via the user's default shell PATH. With nvm, that resolves to a shell function which a non-login non-interactive shell can't expand → exit 127. Symptoms: F5 debug fails before the Extension Development Host even opens.
Apply: rewrite the task as `type: "shell"` calling `./node_modules/.bin/tsc` directly, and inject PATH via `options.env.PATH = "${env:HOME}/.nvm/versions/node/v22.22.1/bin:/usr/local/bin:/usr/bin:/bin"`. The local tsc binary still needs `node` on PATH because its shebang is `#!/usr/bin/env node`, so the PATH override is non-optional.
