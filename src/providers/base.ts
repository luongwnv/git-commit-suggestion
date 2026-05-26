import { ProviderEntry, ProviderId } from "../models/config";

// Map internal provider ids to the user-facing codename. Mirrors the labels
// in src/ui/webview-view.ts PROVIDER_OPTIONS. Error messages surfaced to
// the user must use these names — never the upstream brand.
const PROVIDER_CODENAMES: Record<ProviderId, string> = {
  auto: "Auto",
  pollinations: "Whale",
  duckduckgo: "Platypus",
  huggingface: "Polar Bear",
  ollama: "Axolotl",
  g4f: "Dinosaur",
  mistral: "Mistral",
  openai: "OpenAI",
  anthropic: "Anthropic",
  groq: "Groq",
};

export function codenameFor(id: ProviderId): string {
  return PROVIDER_CODENAMES[id] ?? id;
}

export interface GenerateArgs {
  systemPrompt: string;
  userPrompt: string;
  apiKey?: string;
  model: string;
  // When set, providers MUST forward this to their underlying `fetch`. Used
  // by the Stop button to cancel an in-flight LLM call. Optional so callers
  // that don't care about cancellation (tests, future internal uses) don't
  // have to build a controller.
  signal?: AbortSignal;
}

export interface ProviderResponse {
  rawText: string;
}

export abstract class Provider {
  constructor(
    public readonly id: ProviderId,
    public readonly entry: ProviderEntry,
  ) {}

  abstract generate(args: GenerateArgs): Promise<ProviderResponse>;

  resolveModel(override: string): string {
    return override.trim() || this.entry.default_model;
  }
}

// Squash a provider's HTTP error body into a single short, readable line.
// Why this exists: upstream load balancers (Cloudflare, nginx) return 502/503
// pages as full HTML with doctype + meta + inline CSS. Naively slicing the
// first 400 chars dumps `<!DOCTYPE html><html ...><head><title>...` into the
// orchestrator's aggregated "all auto-chain providers failed" message, which
// then shows as a wall of HTML in the webview. JSON bodies (most upstream
// API errors) carry the useful message text in their first chars, so we keep
// 400 of them; HTML/plain-text bodies get tag-stripped, whitespace-collapsed,
// and capped at 120 chars — usually just enough to reveal "502 Bad gateway"
// or "Rate limit exceeded".
export function summarizeErrorBody(text: string): string {
  const t = text.trim();
  if (t.startsWith("{") || t.startsWith("[")) return t.slice(0, 400);
  const stripped = t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return stripped.length > 120 ? stripped.slice(0, 120) + "…" : stripped;
}

export class ProviderError extends Error {
  // User-facing message: prefixed with the codename only. Internal id stays
  // on the object for logging / debugging.
  constructor(
    public readonly providerId: ProviderId,
    message: string,
    public readonly status?: number,
  ) {
    super(`[${codenameFor(providerId)}] ${message}`);
    this.name = "ProviderError";
  }
}
