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

### Banner "disappears" when it's actually below an expanded panel
Context: user reported "the API-key banner is gone after I pick a key-required provider". The banner was rendering correctly — but its DOM order placed it AFTER the settings panel. When the user opened settings (⚙️) to pick the new provider, the still-open panel pushed the banner below the visible area in a narrow sidebar. The state was right, the render was right, but the user simply couldn't see it.
Apply: in a sidebar webview with collapsible sections, put any "must-see-immediately" message (banners, warnings, errors) BEFORE the collapsible sections in DOM order. Don't trust scroll position — narrow sidebars often have no scrolling at all if content fits one screen. The fix here is one line: swap the order of `<div id="banner">` and `<div id="settings">`.

### Multi-color SVG icons flattened to `currentColor` + opacity render as a black slab in light themes
Context: tried to make a remote-controller settings icon work in both themes by replacing all source colors with `currentColor` and using `opacity="0.45"` / `"0.25"` to differentiate dial face from body. In dark mode it looked fine (faded white shapes), but in light mode `currentColor` is black and all the opacity-faded regions also became dark — the icon read as a single blackish blob.
Apply: don't simulate "tones" with opacity on a monochrome icon. Use a stencil/outline approach instead:
- The outer "case" of the icon: `fill="none" stroke="currentColor"` (a hollow shape; the background shows through).
- Inner highlights/buttons: `fill="currentColor" stroke="none"` (solid against the hollow case).
Result: clear contrast in both themes. The same pattern fits any "device with buttons / panel with controls" icon.

### IDE diagnostics after sequential Edits are stale until the next tick
Context: did two Edits in the same turn (rename a const, then update its single caller). The post-Edit IDE diagnostics block flagged `Cannot find name 'GEAR_SVG'` on the caller line — even though both Edits succeeded and `tsc -p .` was clean.
Apply: when IDE diagnostics fire after a multi-Edit sequence, verify with `tsc -p .` (or the language server's command-line equivalent) before chasing the "error". A real type error survives one extra tick.

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

### `git add -A` keeps eating user-pasted SVG files from the project root
Context: third time in this session that an unrelated SVG appeared at the repo root between commits (smartphone-*.svg earlier; dj-mixer + remote this time). Each time, the previous commit's `git add -A` swept them in.
Apply: in a project where the user routinely drops asset files into the root, NEVER use `git add -A`. Stage explicit paths: `git add src/ docs/ README.md CLAUDE.md package.json …`. If something unknown is at the root, it's almost certainly user staging-area material, not yours to commit.

### Edit fails with "string not found" when an earlier Edit already changed the heading level
Context: tried to insert content before `<h2 id="byok">` but the actual file had `<h3 id="byok">` because an earlier edit demoted the heading. Edit silently fails the entire call — no partial match, no helpful diff.
Apply: when an Edit's `old_string` includes a structural marker (heading level, brace, doctype), grep the file first to confirm the marker still exists in that form. Don't trust your in-context memory of file state across multiple Edits.

### Files restored from history via `git show HEAD~N:path > dest` may end up in BOTH dest and original location
Context: ran `git show HEAD~1:setting-edit-svgrepo-com.svg > assets/setting-edit-svgrepo-com.svg` to recover an asset. The destination file was written correctly, but the original path (project root) also gained a copy — likely an IDE/auto-restore reaction to the historical path becoming "active" again.
Apply: after `git show HEAD~N:path > dest`, immediately verify `git status -s` shows ONLY the new file. If a copy reappears at the original deleted path, `rm` it and re-stage before committing. Or use `git checkout HEAD~N -- path` and then `mv` to be explicit.

### When an unwanted file lands in HEAD, prefer `git restore --staged` over amend-rewriting
Context: amending HEAD to drop the files would have been faster but risky during a multi-step commit chain. Removing files from the tree + committing the deletions is cleaner — history records the mistake and the cleanup, both honest.
Apply: only amend if HEAD hasn't been verified yet; otherwise create a follow-up cleanup commit.

## Tooling / shell

### `npm`/`npx`/`node` not on PATH; nvm shell functions don't survive a non-interactive Bash invocation
Context: on this machine, the user's zsh defines `node`/`npm`/`npx` as lazy-loaded nvm functions. A non-interactive Bash invocation prints `command not found: _load_nvm`.
Apply: prepend `export PATH="$HOME/.nvm/versions/node/v22.22.1/bin:$PATH" && ` to every shell call that needs node. The `_load_nvm: command not found` line in stderr is harmless noise.
