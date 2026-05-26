// No hardcoded API keys are shipped. Every provider that requires a key
// is BYOK — user supplies via the "Set API Key for Provider" command or
// the inline "Paste my key" button.
//
// The free, no-key providers (pollinations, duckduckgo, huggingface,
// ollama, g4f) require no key at all.
//
// This file is intentionally kept as a tiny indirection so the orchestrator
// can stay agnostic about whether or not a default exists. If you ever
// want to ship a throwaway key again, return it from defaultKeyFor.

import { ProviderId } from "../models/config";

export function defaultKeyFor(_provider: ProviderId): string | undefined {
  return undefined;
}

export function hasDefaultKey(_provider: ProviderId): boolean {
  return false;
}
