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

## Tooling / shell

### `npm`/`npx`/`node` not on PATH; nvm shell functions don't survive a non-interactive Bash invocation
Context: on this machine, the user's zsh defines `node`/`npm`/`npx` as lazy-loaded nvm functions. A non-interactive Bash invocation prints `command not found: _load_nvm`.
Apply: prepend `export PATH="$HOME/.nvm/versions/node/v22.22.1/bin:$PATH" && ` to every shell call that needs node. The `_load_nvm: command not found` line in stderr is harmless noise.
