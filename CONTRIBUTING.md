# Contributing

Developer documentation for the Git Commit Suggestion extension. End-user docs
live in [README.md](README.md).

> **Read first** if you are an AI agent: [docs/knowledge-base.html](docs/knowledge-base.html)
> and [docs/provider-comparison.html](docs/provider-comparison.html). Both
> contain non-obvious gotchas (provider rate limits, endpoint rotation, JSON
> parse repair, etc.).

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
.adn/
  lessons.html            # tactical one-offs from this project
```

## Working rules

See [CLAUDE.md](CLAUDE.md) for the three top-of-file rules: **plan first, code
later**, **sub-agents first**, **auto-document after every prompt**.

## Provider table

| UI codename | Internal id | Key |
|-------------|-------------|-----|
| **Auto** | `auto` | none (default — tries the no-key chain) |
| Whale | `pollinations` | none |
| Platypus | `duckduckgo` | none (currently broken; JS challenge) |
| Polar Bear | `huggingface` | required |
| Axolotl | `ollama` | none (local) |
| Dinosaur | `g4f` | none (opt-in via `enableUnofficialProviders: true`) |
| Mistral | `mistral` | required (BYOK) |
| OpenAI | `openai` | required (BYOK) |
| Anthropic | `anthropic` | required (BYOK) |
| Groq | `groq` | required (BYOK) |

The codename is what users see in the dropdown and in error prefixes; the
internal id is used in config, secrets, and OutputChannel logs.

## Dev quick start

```bash
npm install
npm run compile

# Open this folder in VSCode, press F5 → an Extension Development Host launches.
# Inside the host: open any git repo, stage some files, click the lightbulb
# icon in the Activity Bar.
```

## How it works

1. User opens the **Commit Suggestion** view in the Activity Bar (or runs
   `gitCommitSuggestion.suggest` from the palette).
2. The webview ([src/ui/webview-view.ts](src/ui/webview-view.ts)) sends a
   `suggest` postMessage to the extension host on button click.
3. [src/pipeline/diff-collector.ts](src/pipeline/diff-collector.ts) runs
   `git diff --cached --no-color -U3`, splits per file, truncates to
   `maxDiffTokens` keeping small files whole.
4. [src/pipeline/prompt-builder.ts](src/pipeline/prompt-builder.ts) loads
   templates from `config/prompts.yml` and substitutes `{{count}}`,
   `{{language}}`, `{{detail_level}}`, `{{best_practices}}`, `{{diff}}`.
5. [src/pipeline/orchestrator.ts](src/pipeline/orchestrator.ts) picks the
   provider per setting. If `auto`, it walks `AUTO_CHAIN` and returns the
   first success. Provider classes live in [src/providers/](src/providers/).
6. [src/pipeline/parser.ts](src/pipeline/parser.ts) strips markdown fences,
   extracts the JSON array (or repairs a truncated one), validates with zod,
   normalizes type/scope.
7. Extension posts `{ type: "state", state: { suggestions, ... } }` back to
   the webview, which re-renders cards.
8. Clicking *Use this* sends `{ type: "use", index }` back; the extension
   calls [src/ui/scm-writer.ts](src/ui/scm-writer.ts) to drop the formatted
   message into the Git extension's `repository.inputBox`.

## Adding a new provider

1. Append an entry to [config/providers.yml](config/providers.yml) with
   `base_url`, `endpoint`, `default_model`, `auth`, and free-tier notes.
2. If it uses the OpenAI `/chat/completions` schema, the existing
   `OpenAICompatibleProvider` handles it — add the id to
   [src/providers/index.ts](src/providers/index.ts) `buildProvider`.
3. Otherwise add a new class under [src/providers/](src/providers/) extending
   `Provider`.
4. Add the id to `ProviderIdSchema` in
   [src/models/config.ts](src/models/config.ts), the enum in
   `package.json#contributes.configuration.gitCommitSuggestion.provider.enum`,
   and the codename map in [src/providers/base.ts](src/providers/base.ts).
5. Add the dropdown entry in `PROVIDER_OPTIONS` in
   [src/ui/webview-view.ts](src/ui/webview-view.ts) using a codename — never
   the upstream brand.
6. Document quirks in [docs/knowledge-base.html](docs/knowledge-base.html)
   and update [docs/provider-comparison.html](docs/provider-comparison.html).

## Conventions

- All artifacts (code, comments, docs) are in **English**. User conversation
  may be Vietnamese; LLM output is per the user's chosen `language` setting.
- API keys live in VSCode `SecretStorage`. Never `workspace.getConfiguration().update(...)`
  an API key — that writes to `settings.json`.
- `config/*.yml` is the single source of truth for endpoints, default models,
  and the commit-type catalogue. Code should not hardcode these.
- Error messages surfaced to the user MUST use codenames, never upstream
  brand names. `ProviderError`'s prefix is the codename automatically.
- The internal id is fine in OutputChannel logs (developer-facing).
