import { ProviderEntry, ProviderId } from "../models/config";

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
  constructor(
    public readonly providerId: ProviderId,
    message: string,
    public readonly status?: number,
  ) {
    super(`[${providerId}] ${message}`);
    this.name = "ProviderError";
  }
}
