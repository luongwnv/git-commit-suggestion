import { z } from "zod";

export const ProviderIdSchema = z.enum([
  "auto",
  "mistral",
  "openai",
  "anthropic",
  "groq",
  "ollama",
  "pollinations",
  "duckduckgo",
  "huggingface",
  "g4f",
]);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const LanguageSchema = z.enum(["bilingual", "en", "vi"]);
export type Language = z.infer<typeof LanguageSchema>;

export const ExtensionConfigSchema = z.object({
  provider: ProviderIdSchema,
  model: z.string(),
  language: LanguageSchema,
  suggestionCount: z.number().int().min(1).max(8),
  maxDiffTokens: z.number().int().min(500),
  enableUnofficialProviders: z.boolean(),
  customPromptPath: z.string(),
  ollamaBaseUrl: z.string(),
});
export type ExtensionConfig = z.infer<typeof ExtensionConfigSchema>;

export const ProviderEntrySchema = z.object({
  label: z.string(),
  free_tier: z.boolean(),
  byok: z.boolean(),
  base_url: z.string(),
  endpoint: z.string(),
  default_model: z.string(),
  auth: z.enum(["bearer", "x-api-key", "none"]),
  api_version: z.string().optional(),
  unofficial: z.boolean().optional(),
  notes: z.string().optional(),
});
export type ProviderEntry = z.infer<typeof ProviderEntrySchema>;

export const ProvidersConfigSchema = z.record(ProviderIdSchema, ProviderEntrySchema);
export type ProvidersConfig = z.infer<typeof ProvidersConfigSchema>;

export const CommitTypeSchema = z.object({
  type: z.string(),
  emoji: z.string(),
  en: z.string(),
  vi: z.string(),
});
export type CommitType = z.infer<typeof CommitTypeSchema>;

export const PromptsConfigSchema = z.object({
  system: z.string(),
  user: z.string(),
});
export type PromptsConfig = z.infer<typeof PromptsConfigSchema>;
