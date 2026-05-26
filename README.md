# git-commit-suggestion

VSCode extension that reads the **staged git diff** and asks an LLM for **3-5 Conventional Commits suggestions** in **English + Vietnamese**. Pick one, it lands in the Source Control input box.

UX modeled on [RedJue/git-commit-plugin](https://github.com/RedJue/git-commit-plugin); architecture modeled on `index-crawl` (declarative `config/*.yml`, separated `models / providers / pipeline / ui / utils`, knowledge-base doc).

A dedicated **Commit Suggestions** webview lives in its own Activity Bar container — one card per suggestion with bilingual subject/body and a *Use this* button that drops the message into the SCM input.

The default `Auto` provider tries Whale, Platypus, and Polar Bear in turn — no API key needed to start. Other providers (Mistral, OpenAI, Anthropic, Groq) require a key you paste via the settings panel or the command palette.

> **Read first** if you are an AI agent: [docs/knowledge-base.html](docs/knowledge-base.html) and [docs/provider-comparison.html](docs/provider-comparison.html). Both contain non-obvious gotchas (Mistral free-tier rate limit, g4f endpoint rotation, JSON parse repair, etc.).

## Layout

```
config/
  providers.yml           # endpoint, default model, free/paid flag per provider
  commit-types.yml        # Conventional Commits catalogue (EN + VI descriptions)
  prompts.yml             # system + user prompt templates ({{vars}})
src/
  models/                 # zod schemas: Suggestion, ParsedDiff, ExtensionConfig
  providers/              # one class per LLM provider + a registry
  pipeline/               # diff-collector → prompt-builder → orchestrator → parser
  ui/                     # webview-view (sidebar GUI), quick-pick (palette fallback), scm-writer, status-bar
  utils/                  # git child_process, OutputChannel logger, i18n
  extension.ts            # activation, command registration, view provider wiring
docs/
  knowledge-base.html     # non-obvious facts; append as discovered
  provider-comparison.html
```

## Providers

UI labels use codenames; the table also lists the internal `provider:` id used in settings.

| UI label | id | Key |
|----------|----|-----|
| **Auto** | `auto` | none — **default**, tries Whale → Platypus → Polar Bear and returns the first success |
| Whale | `pollinations` | none |
| Platypus | `duckduckgo` | none |
| Polar Bear | `huggingface` | optional |
| Axolotl | `ollama` | none (local) |
| Dinosaur | `g4f` | none (opt-in via `enableUnofficialProviders: true`) |
| Mistral | `mistral` | required (BYOK) |
| OpenAI | `openai` | required (BYOK) |
| Anthropic | `anthropic` | required (BYOK) |
| Groq | `groq` | required (BYOK) |

Upstream endpoints, model lists, and protocol quirks for each id live in [docs/provider-comparison.html](docs/provider-comparison.html).

The default `auto` chain means **the extension works with zero setup** — no API key needed. The first no-key provider that responds wins.

## Quick start

```bash
# 1. Install deps + build
npm install
npm run compile

# 2. Open this folder in VSCode, press F5 → an Extension Development Host launches
#    In that host, open any git repo, stage some files, run:
#      "Git Commit Suggestion: Set API Key for Provider"  (pick mistral, paste key)
#      "Git Commit Suggestion: Suggest Commit Message"     (or click the status bar lightbulb)

# 3. Package the .vsix when you want to install permanently
npx @vscode/vsce package
code --install-extension git-commit-suggestion-0.1.0.vsix
```

Get a free Mistral API key at <https://console.mistral.ai/>.

## Settings

| Key | Default | Purpose |
|-----|---------|---------|
| `gitCommitSuggestion.provider` | `mistral` | One of the providers in the table above |
| `gitCommitSuggestion.model` | `""` | Override default model from `config/providers.yml` |
| `gitCommitSuggestion.language` | `bilingual` | `bilingual` / `en` / `vi` |
| `gitCommitSuggestion.suggestionCount` | `4` | How many suggestions to request |
| `gitCommitSuggestion.maxDiffTokens` | `6000` | Diff budget; larger diffs are truncated file-by-file |
| `gitCommitSuggestion.enableUnofficialProviders` | `false` | Gate for `g4f` |
| `gitCommitSuggestion.customPromptPath` | `""` | Override `config/prompts.yml` |
| `gitCommitSuggestion.ollamaBaseUrl` | `http://localhost:11434` | Only used when `provider=ollama` |

API keys are stored in **VSCode SecretStorage**, not settings — they never appear in `settings.json`. Use the `Set API Key for Provider` command.

## How it works

1. User opens the **Commit Suggestions** view in the Source Control sidebar (or runs `gitCommitSuggestion.suggest` from the palette/status bar).
2. The webview ([src/ui/webview-view.ts](src/ui/webview-view.ts)) sends a `suggest` postMessage to the extension host on button click.
3. [src/pipeline/diff-collector.ts](src/pipeline/diff-collector.ts) runs `git diff --staged --no-color -U3`, splits per file, truncates to `maxDiffTokens` keeping small files whole.
4. [src/pipeline/prompt-builder.ts](src/pipeline/prompt-builder.ts) loads templates from `config/prompts.yml` and substitutes `{{count}}`, `{{language}}`, `{{types_block}}`, `{{diff}}`.
5. [src/pipeline/orchestrator.ts](src/pipeline/orchestrator.ts) picks the provider (per setting), calls it. If `g4f` fails, it falls back to `mistral` automatically.
6. [src/pipeline/parser.ts](src/pipeline/parser.ts) strips markdown fences, extracts the JSON array, validates with zod, normalizes type/scope.
7. Extension posts `{ type: "state", state: { suggestions, ... } }` back to the webview, which re-renders cards (EN subject + VI gloss + body, *Use this* button).
8. Clicking *Use this* sends `{ type: "use", index }` back; the extension calls [src/ui/scm-writer.ts](src/ui/scm-writer.ts) to drop the formatted message into the Git extension's `repository.inputBox`. User reviews and presses Commit normally.
9. The command-palette entrypoint additionally falls back to a `vscode.window.showQuickPick` so it works even if the sidebar view isn't visible.

## Common gotchas

- **Mistral free tier ~1 req/sec.** A second click within ~1s of the first may 429. The orchestrator surfaces the HTTP body in the error message.
- **g4f endpoints rotate.** Treat any g4f success as luck. The provider tries a list of community endpoints in order; if all fail, it falls back to Mistral (so you'll need a Mistral key set even when using g4f).
- **LLMs sometimes wrap JSON in ```json fences** despite the system prompt. The parser strips them. If the model returns prose anyway, the call fails — re-run.
- **Empty SCM input box after Suggest.** Means the `vscode.git` extension wasn't activated or no repo matched the workspace folder. The message is copied to clipboard as a fallback.
- **Anthropic uses `/messages`, not `/chat/completions`.** Don't try to share code with the OpenAI-compatible providers beyond what `providers/anthropic.ts` already does.
- **Diff truncation is by-file, not by-line.** A single huge file gets head-truncated with a `[truncated N chars]` marker; small files always go in whole.

## Adding a new provider

1. Append an entry to [config/providers.yml](config/providers.yml) with `base_url`, `endpoint`, `default_model`, `auth`, and free-tier notes.
2. If the provider uses the OpenAI `/chat/completions` schema, the existing `OpenAICompatibleProvider` handles it — just add the id to [src/providers/index.ts](src/providers/index.ts) `buildProvider`.
3. Otherwise add a new class under [src/providers/](src/providers/) extending `Provider`.
4. Add the id to the enum in `package.json` (`gitCommitSuggestion.provider.enum`) and to `ProviderIdSchema` in [src/models/config.ts](src/models/config.ts).
5. Document quirks in [docs/knowledge-base.html](docs/knowledge-base.html) and update the table in [docs/provider-comparison.html](docs/provider-comparison.html).

## Conventions

- All artifacts (README, code, comments, HTML docs, commit-type labels) are in **English**. User conversation may be Vietnamese.
- LLM **output** is bilingual (or English/Vietnamese-only per `language` setting) — that is a product feature, not part of the repo's artifact-language rule.
- API keys live in VSCode `SecretStorage`. Never `vscode.workspace.getConfiguration().update(...)` an API key — that writes to `settings.json`.
- `config/*.yml` is the single source of truth for endpoints, default models, and commit-type catalogue. Code should not hardcode these.
- The orchestrator's only automatic fallback is `g4f → mistral`. All other providers raise on failure.
