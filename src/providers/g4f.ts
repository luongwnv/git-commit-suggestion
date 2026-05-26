import { GenerateArgs, ProviderError, ProviderResponse } from "./base";
import { OpenAICompatibleProvider } from "./openai-compatible";

// Community-maintained reverse-proxy endpoints that mimic the OpenAI
// /chat/completions schema. Endpoints rotate frequently; if a request fails,
// the provider tries the next one. If all fail, ProviderError is raised and
// the orchestrator falls back to Mistral.
//
// Listed here so users can see exactly what gets called — no hidden URLs.
// Update or override via gitCommitSuggestion settings if you maintain your own.
const FALLBACK_ENDPOINTS = [
  "https://api.deepinfra.com/v1/openai",
  "https://api.together.xyz/v1",
];

export class G4FProvider extends OpenAICompatibleProvider {
  override async generate(args: GenerateArgs): Promise<ProviderResponse> {
    const candidates = this.entry.base_url
      ? [this.entry.base_url, ...FALLBACK_ENDPOINTS]
      : FALLBACK_ENDPOINTS;

    let lastError: Error | undefined;
    for (const base of candidates) {
      // Mutate a shallow copy of `entry` for each attempt. We do NOT persist
      // this — it only affects the current request.
      const cloned = Object.create(this);
      cloned.entry = { ...this.entry, base_url: base };
      try {
        return await OpenAICompatibleProvider.prototype.generate.call(cloned, args);
      } catch (err) {
        if ((err as Error).name === "AbortError") throw err;
        lastError = err as Error;
      }
    }
    throw new ProviderError(
      this.id,
      `All g4f endpoints failed. Last error: ${lastError?.message ?? "unknown"}`,
    );
  }
}
