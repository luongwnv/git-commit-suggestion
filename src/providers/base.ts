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
