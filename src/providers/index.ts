import { ProviderEntry, ProviderId, ProvidersConfig } from "../models/config";
import { AnthropicProvider } from "./anthropic";
import { Provider } from "./base";
import { DuckDuckGoProvider } from "./duckduckgo";
import { G4FProvider } from "./g4f";
import { HuggingFaceProvider } from "./huggingface";
import { OllamaProvider } from "./ollama";
import { OpenAICompatibleProvider } from "./openai-compatible";
import { PollinationsProvider } from "./pollinations";

// The "auto" id is a virtual provider — resolved by the orchestrator's
// fallback chain, never passed to buildProvider directly.
export type ConcreteProviderId = Exclude<ProviderId, "auto">;

export function buildProvider(
  id: ConcreteProviderId,
  providers: ProvidersConfig,
  opts: { ollamaBaseUrl: string },
): Provider {
  const entry = providers[id];
  if (!entry) throw new Error(`Provider not registered in providers.yml: ${id}`);
  switch (id) {
    case "mistral":
    case "openai":
    case "groq":
      return new OpenAICompatibleProvider(id, entry);
    case "anthropic":
      return new AnthropicProvider(id, entry);
    case "ollama":
      return new OllamaProvider(id, entry, opts.ollamaBaseUrl);
    case "pollinations":
      return new PollinationsProvider(id, entry);
    case "duckduckgo":
      return new DuckDuckGoProvider(id, entry);
    case "huggingface":
      return new HuggingFaceProvider(id, entry);
    case "g4f":
      return new G4FProvider(id, entry);
  }
}

export { Provider, ProviderEntry };
