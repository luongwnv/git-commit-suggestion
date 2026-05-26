import { ProviderEntry, ProviderId, ProvidersConfig } from "../models/config";
import { AnthropicProvider } from "./anthropic";
import { Provider } from "./base";
import { G4FProvider } from "./g4f";
import { OllamaProvider } from "./ollama";
import { OpenAICompatibleProvider } from "./openai-compatible";

export function buildProvider(
  id: ProviderId,
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
    case "g4f":
      return new G4FProvider(id, entry);
  }
}

export { Provider, ProviderEntry };
