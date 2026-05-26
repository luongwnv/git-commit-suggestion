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

export const LanguageSchema = z.enum([
  "bilingual",
  "en",
  "vi",
  "zh",
  "zh-tw",
  "ja",
  "ko",
  "es",
  "fr",
  "de",
  "pt",
  "ru",
  "id",
  "th",
  "ar",
  "hi",
  "it",
  "tr",
  "pl",
  "nl",
  "uk",
  "sv",
]);
export type Language = z.infer<typeof LanguageSchema>;

// Human-readable labels for each language, used by the prompt and the UI.
// `bilingual` is special — the model fills both English and Vietnamese.
export const LANGUAGE_LABELS: Record<Language, string> = {
  bilingual: "English + Vietnamese (side by side)",
  en: "English",
  vi: "Tiếng Việt",
  zh: "简体中文 (Chinese Simplified)",
  "zh-tw": "繁體中文 (Chinese Traditional)",
  ja: "日本語 (Japanese)",
  ko: "한국어 (Korean)",
  es: "Español (Spanish)",
  fr: "Français (French)",
  de: "Deutsch (German)",
  pt: "Português (Portuguese)",
  ru: "Русский (Russian)",
  id: "Bahasa Indonesia (Indonesian)",
  th: "ภาษาไทย (Thai)",
  ar: "العربية (Arabic)",
  hi: "हिन्दी (Hindi)",
  it: "Italiano (Italian)",
  tr: "Türkçe (Turkish)",
  pl: "Polski (Polish)",
  nl: "Nederlands (Dutch)",
  uk: "Українська (Ukrainian)",
  sv: "Svenska (Swedish)",
};

export const DetailLevelSchema = z.enum(["concise", "normal", "detailed"]);
export type DetailLevel = z.infer<typeof DetailLevelSchema>;

export const DETAIL_LEVEL_LABELS: Record<DetailLevel, string> = {
  concise: "Concise — subject line only (vắn tắt)",
  normal: "Normal — subject + brief body (tổng quan)",
  detailed: "Detailed — subject + multi-paragraph body (chi tiết)",
};

export const ExtensionConfigSchema = z.object({
  provider: ProviderIdSchema,
  model: z.string(),
  language: LanguageSchema,
  detailLevel: DetailLevelSchema,
  suggestionCount: z.number().int().min(1).max(8),
  maxDiffTokens: z.number().int().min(500),
  enableUnofficialProviders: z.boolean(),
  customPromptPath: z.string(),
  ollamaBaseUrl: z.string(),
  showEmoji: z.boolean(),
  showBody: z.boolean(),
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
