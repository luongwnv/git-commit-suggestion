Read [docs/knowledge-base.html](docs/knowledge-base.html) in full before doing any task. When adding or modifying any provider, also read [docs/provider-comparison.html](docs/provider-comparison.html) — endpoint and model fields must match the schemas already in `config/providers.yml`. Append new non-obvious facts to the knowledge base in the same format when you discover them. All artifacts in this repo are in English; only the LLM's bilingual output is also Vietnamese.

## Working rules

**Plan first, code later.** Wrong mid-way? Stop, re-plan from scratch. When a conclusion turns out wrong, discard it AND every assumption it rested on, then rebuild from first evidence. Patching on top of a broken premise compounds the error.

**Sub-agents first (no permission needed).** Dispatch a sub-agent for ANY task that can be separated — research, code exploration, file reads, parallel analysis, code review, Docker/test runs. Do NOT ask the user before dispatching; announce with a one-line notification at the top of the response (e.g. "Dispatching sub-agent: read ssh2 event docs"). Sub-agents may spawn their own sub-agents recursively; avoid going beyond 3 levels deep (main → level 1 → level 2) unless clearly necessary. Goal: keep main context clean, prevent context compaction.

**Auto-document after every prompt.** After every response, scan all data that entered context (user message, tool results, error output, file contents): does anything here have generalizable value for future work? If yes, add it to [.adn/lessons.md](.adn/lessons.md) (tactical one-offs) or this `CLAUDE.md` (reusable patterns) in the SAME response. No confirmation needed, no waiting for the user to ask.
