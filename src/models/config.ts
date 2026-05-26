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

// English fallback labels for the detail level dropdown. The UI translates
// these per the user's output language setting via DETAIL_LEVEL_TRANSLATIONS
// below; if a language has no translation we fall back to English.
export const DETAIL_LEVEL_LABELS: Record<DetailLevel, string> = {
  concise: "Concise — subject line only",
  normal: "Normal — subject + brief body",
  detailed: "Detailed — subject + multi-paragraph body",
};

export const DETAIL_LEVEL_TRANSLATIONS: Partial<
  Record<Language, Record<DetailLevel, string>>
> = {
  vi: {
    concise: "Vắn tắt — chỉ tiêu đề",
    normal: "Tổng quan — tiêu đề + mô tả ngắn",
    detailed: "Chi tiết — tiêu đề + mô tả nhiều đoạn",
  },
  bilingual: {
    concise: "Concise / Vắn tắt — subject only",
    normal: "Normal / Tổng quan — subject + brief body",
    detailed: "Detailed / Chi tiết — subject + multi-paragraph",
  },
  zh: {
    concise: "简洁 — 仅标题行",
    normal: "标准 — 标题 + 简要说明",
    detailed: "详细 — 标题 + 多段说明",
  },
  "zh-tw": {
    concise: "簡潔 — 僅標題行",
    normal: "標準 — 標題 + 簡要說明",
    detailed: "詳細 — 標題 + 多段說明",
  },
  ja: {
    concise: "簡潔 — 件名のみ",
    normal: "標準 — 件名 + 短い本文",
    detailed: "詳細 — 件名 + 複数段落の本文",
  },
  ko: {
    concise: "간결 — 제목만",
    normal: "기본 — 제목 + 짧은 본문",
    detailed: "상세 — 제목 + 여러 단락 본문",
  },
  es: {
    concise: "Conciso — solo título",
    normal: "Normal — título + cuerpo breve",
    detailed: "Detallado — título + cuerpo extenso",
  },
  fr: {
    concise: "Concis — titre uniquement",
    normal: "Normal — titre + corps bref",
    detailed: "Détaillé — titre + corps multi-paragraphe",
  },
  de: {
    concise: "Knapp — nur Betreff",
    normal: "Standard — Betreff + kurzer Text",
    detailed: "Ausführlich — Betreff + mehrere Absätze",
  },
  pt: {
    concise: "Conciso — somente assunto",
    normal: "Normal — assunto + corpo breve",
    detailed: "Detalhado — assunto + corpo extenso",
  },
  ru: {
    concise: "Кратко — только заголовок",
    normal: "Стандарт — заголовок + краткое описание",
    detailed: "Подробно — заголовок + развернутое описание",
  },
  id: {
    concise: "Singkat — hanya judul",
    normal: "Normal — judul + isi singkat",
    detailed: "Rinci — judul + isi panjang",
  },
  th: {
    concise: "กระชับ — เฉพาะหัวข้อ",
    normal: "ปกติ — หัวข้อ + เนื้อหาสั้น",
    detailed: "ละเอียด — หัวข้อ + เนื้อหายาว",
  },
  ar: {
    concise: "موجز — العنوان فقط",
    normal: "عادي — العنوان + نص قصير",
    detailed: "مفصل — العنوان + نص متعدد الفقرات",
  },
  hi: {
    concise: "संक्षिप्त — केवल विषय",
    normal: "सामान्य — विषय + संक्षिप्त विवरण",
    detailed: "विस्तृत — विषय + बहु-अनुच्छेद विवरण",
  },
  it: {
    concise: "Conciso — solo oggetto",
    normal: "Normale — oggetto + corpo breve",
    detailed: "Dettagliato — oggetto + corpo esteso",
  },
  tr: {
    concise: "Kısa — sadece başlık",
    normal: "Normal — başlık + kısa açıklama",
    detailed: "Ayrıntılı — başlık + uzun açıklama",
  },
  pl: {
    concise: "Zwięzły — tylko temat",
    normal: "Standard — temat + krótki opis",
    detailed: "Szczegółowy — temat + długi opis",
  },
  nl: {
    concise: "Beknopt — alleen onderwerp",
    normal: "Normaal — onderwerp + korte tekst",
    detailed: "Uitgebreid — onderwerp + lange tekst",
  },
  uk: {
    concise: "Стисло — лише заголовок",
    normal: "Стандарт — заголовок + короткий опис",
    detailed: "Детально — заголовок + розгорнутий опис",
  },
  sv: {
    concise: "Kort — endast ämne",
    normal: "Normal — ämne + kort text",
    detailed: "Detaljerad — ämne + lång text",
  },
};

export function detailLevelLabel(level: DetailLevel, language: Language): string {
  return (
    DETAIL_LEVEL_TRANSLATIONS[language]?.[level] ?? DETAIL_LEVEL_LABELS[level]
  );
}

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
