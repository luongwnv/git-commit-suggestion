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

// Each language is a single-language output. There is no `bilingual` mode
// anymore — pick one language and the entire panel + commit messages use it.
export const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English",
  vi: "Tiếng Việt",
  zh: "简体中文",
  "zh-tw": "繁體中文",
  ja: "日本語",
  ko: "한국어",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  ru: "Русский",
  id: "Bahasa Indonesia",
  th: "ภาษาไทย",
  ar: "العربية",
  hi: "हिन्दी",
  it: "Italiano",
  tr: "Türkçe",
  pl: "Polski",
  nl: "Nederlands",
  uk: "Українська",
  sv: "Svenska",
};

export const DetailLevelSchema = z.enum(["concise", "normal", "detailed"]);
export type DetailLevel = z.infer<typeof DetailLevelSchema>;

// Best-practice rules the user can opt into individually. Each maps to a
// line of prompt guidance (see prompt-builder.ts). Order here is the order
// they appear in the settings panel.
export const BestPracticeIdSchema = z.enum([
  "imperative",         // "Add" not "Added"
  "subject50",          // subject ≤ 50 chars
  "capitalize",         // capitalize subject
  "noPeriod",           // no trailing period in subject
  "bodyWrap72",         // body wraps at 72 chars
  "explainWhy",         // body explains what + why, not how
  "referenceIssues",    // reference issues/PRs in footer
]);
export type BestPracticeId = z.infer<typeof BestPracticeIdSchema>;

// Labels are kept terse — the dropdown is narrow and 7 rows of text is
// already heavy. Long-form explanation lives in the prompt guidance, not
// the label.
export const BEST_PRACTICE_LABELS: Record<BestPracticeId, string> = {
  imperative: "Imperative mood",
  subject50: "Subject ≤ 50 chars",
  capitalize: "Capitalize subject",
  noPeriod: "No trailing period",
  bodyWrap72: "Wrap body at 72",
  explainWhy: "Body: why, not how",
  referenceIssues: "Reference issues",
};

export const BEST_PRACTICE_DEFAULTS: BestPracticeId[] = [
  "imperative",
  "subject50",
  "capitalize",
  "noPeriod",
  "explainWhy",
];

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

// =============================================================================
// Webview UI strings — translated into the user's output language so the whole
// panel switches when the language dropdown changes (labels, buttons, banner).
// Languages not listed fall back to English. Translations are deliberately
// short to fit the narrow sidebar.
// =============================================================================

export type UiStringKey =
  | "provider"
  | "outputLanguage"
  | "detailLevel"
  | "bestPractices"
  | "suggestionCount"
  | "showEmoji"
  | "showBody"
  | "showScope"
  | "suggestBtn"
  | "stopBtn"
  | "useThisBtn"
  | "stageHint"
  | "generating"
  | "providerLabel"
  | "apiKeyRequired"
  | "apiKeyBody"
  | "getFreeKey"
  | "pasteKey"
  | "bp_imperative"
  | "bp_subject50"
  | "bp_capitalize"
  | "bp_noPeriod"
  | "bp_bodyWrap72"
  | "bp_explainWhy"
  | "bp_referenceIssues";

const EN_STRINGS: Record<UiStringKey, string> = {
  provider: "Provider",
  outputLanguage: "Output language",
  detailLevel: "Detail level",
  bestPractices: "Best practices",
  suggestionCount: "Number of suggestions (1-8)",
  showEmoji: "Show emoji prefix",
  showBody: "Include explanation body",
  showScope: "Show scope in subject",
  suggestBtn: "Suggest",
  stopBtn: "Stop",
  useThisBtn: "Use this",
  stageHint: "Stage some files, then click",
  generating: "Generating suggestions…",
  providerLabel: "Provider:",
  apiKeyRequired: "API key required",
  apiKeyBody: "The {provider} provider needs an API key. Paste yours below, or switch to a no-key provider from the {icon} menu.",
  getFreeKey: "Get free key",
  pasteKey: "Paste my key",
  bp_imperative: "Imperative mood",
  bp_subject50: "Subject ≤ 50 chars",
  bp_capitalize: "Capitalize subject",
  bp_noPeriod: "No trailing period",
  bp_bodyWrap72: "Wrap body at 72",
  bp_explainWhy: "Body: why, not how",
  bp_referenceIssues: "Reference issues",
};

export const UI_STRINGS: Partial<Record<Language, Record<UiStringKey, string>>> = {
  en: EN_STRINGS,

  vi: {
    provider: "Nhà cung cấp",
    outputLanguage: "Ngôn ngữ đầu ra",
    detailLevel: "Mức chi tiết",
    bestPractices: "Quy tắc tốt",
    suggestionCount: "Số gợi ý (1-8)",
    showEmoji: "Hiển thị emoji ở đầu",
    showBody: "Kèm phần giải thích",
    showScope: "Hiển thị scope trong tiêu đề",
    suggestBtn: "Gợi ý",
    stopBtn: "Dừng",
    useThisBtn: "Dùng cái này",
    stageHint: "Stage một số file, rồi nhấn",
    generating: "Đang sinh gợi ý…",
    providerLabel: "Nhà cung cấp:",
    apiKeyRequired: "Cần API key",
    apiKeyBody: "Nhà cung cấp {provider} cần API key. Dán key của bạn bên dưới, hoặc chuyển sang nhà cung cấp không cần key trong menu {icon}.",
    getFreeKey: "Lấy key miễn phí",
    pasteKey: "Dán key của tôi",
    bp_imperative: "Mệnh lệnh thức",
    bp_subject50: "Tiêu đề ≤ 50 ký tự",
    bp_capitalize: "Viết hoa tiêu đề",
    bp_noPeriod: "Không dấu chấm cuối",
    bp_bodyWrap72: "Body 72 ký tự/dòng",
    bp_explainWhy: "Body: tại sao, không phải làm sao",
    bp_referenceIssues: "Tham chiếu issue",
  },

  zh: {
    provider: "提供商",
    outputLanguage: "输出语言",
    detailLevel: "详细程度",
    bestPractices: "最佳实践",
    suggestionCount: "建议数量 (1-8)",
    showEmoji: "显示 emoji 前缀",
    showBody: "包含说明正文",
    showScope: "在标题中显示作用域",
    suggestBtn: "生成建议",
    stopBtn: "停止",
    useThisBtn: "使用此项",
    stageHint: "暂存一些文件，然后点击",
    generating: "正在生成建议…",
    providerLabel: "提供商：",
    apiKeyRequired: "需要 API key",
    apiKeyBody: "{provider} 提供商需要 API key。请在下方粘贴，或在 {icon} 菜单中切换到无需 key 的提供商。",
    getFreeKey: "获取免费 key",
    pasteKey: "粘贴我的 key",
    bp_imperative: "祈使语气",
    bp_subject50: "标题 ≤ 50 字符",
    bp_capitalize: "标题首字母大写",
    bp_noPeriod: "标题末尾无句号",
    bp_bodyWrap72: "正文 72 字符换行",
    bp_explainWhy: "正文: 为什么, 而非如何",
    bp_referenceIssues: "引用 issue",
  },

  ja: {
    provider: "プロバイダー",
    outputLanguage: "出力言語",
    detailLevel: "詳細レベル",
    bestPractices: "ベストプラクティス",
    suggestionCount: "提案数 (1-8)",
    showEmoji: "絵文字プレフィックスを表示",
    showBody: "説明本文を含める",
    showScope: "件名にスコープを表示",
    suggestBtn: "提案する",
    stopBtn: "停止",
    useThisBtn: "これを使う",
    stageHint: "ファイルをステージしてからクリック",
    generating: "提案を生成中…",
    providerLabel: "プロバイダー:",
    apiKeyRequired: "API key が必要",
    apiKeyBody: "{provider} プロバイダーには API key が必要です。下に貼り付けるか、{icon} メニューから key 不要のプロバイダーに切り替えてください。",
    getFreeKey: "無料 key を取得",
    pasteKey: "key を貼り付け",
    bp_imperative: "命令形",
    bp_subject50: "件名 ≤ 50 文字",
    bp_capitalize: "件名を大文字で",
    bp_noPeriod: "件名末ピリオドなし",
    bp_bodyWrap72: "本文 72 文字折返し",
    bp_explainWhy: "本文: なぜ、どう以外",
    bp_referenceIssues: "issue を参照",
  },

  ko: {
    provider: "제공자",
    outputLanguage: "출력 언어",
    detailLevel: "상세 수준",
    bestPractices: "모범 사례",
    suggestionCount: "제안 수 (1-8)",
    showEmoji: "이모지 접두사 표시",
    showBody: "설명 본문 포함",
    showScope: "제목에 스코프 표시",
    suggestBtn: "제안",
    stopBtn: "중지",
    useThisBtn: "사용하기",
    stageHint: "파일을 스테이지한 후 클릭",
    generating: "제안 생성 중…",
    providerLabel: "제공자:",
    apiKeyRequired: "API key 필요",
    apiKeyBody: "{provider} 제공자에는 API key가 필요합니다. 아래에 붙여넣거나 {icon} 메뉴에서 key가 필요 없는 제공자로 전환하세요.",
    getFreeKey: "무료 key 받기",
    pasteKey: "내 key 붙여넣기",
    bp_imperative: "명령형",
    bp_subject50: "제목 ≤ 50자",
    bp_capitalize: "제목 대문자로",
    bp_noPeriod: "끝에 마침표 없음",
    bp_bodyWrap72: "본문 72자 줄바꿈",
    bp_explainWhy: "본문: 왜, 어떻게 아님",
    bp_referenceIssues: "issue 참조",
  },

  es: {
    provider: "Proveedor",
    outputLanguage: "Idioma de salida",
    detailLevel: "Nivel de detalle",
    bestPractices: "Buenas prácticas",
    suggestionCount: "Número de sugerencias (1-8)",
    showEmoji: "Mostrar prefijo emoji",
    showBody: "Incluir cuerpo explicativo",
    showScope: "Mostrar ámbito en el asunto",
    suggestBtn: "Sugerir",
    stopBtn: "Detener",
    useThisBtn: "Usar este",
    stageHint: "Prepara archivos y haz clic",
    generating: "Generando sugerencias…",
    providerLabel: "Proveedor:",
    apiKeyRequired: "Se requiere clave API",
    apiKeyBody: "El proveedor {provider} necesita una clave API. Pégala abajo o cambia a un proveedor sin clave en el menú {icon}.",
    getFreeKey: "Obtener clave gratis",
    pasteKey: "Pegar mi clave",
    bp_imperative: "Modo imperativo",
    bp_subject50: "Asunto ≤ 50 caracteres",
    bp_capitalize: "Asunto con mayúscula",
    bp_noPeriod: "Sin punto final",
    bp_bodyWrap72: "Cuerpo 72 char/línea",
    bp_explainWhy: "Cuerpo: por qué, no cómo",
    bp_referenceIssues: "Referenciar issues",
  },

  fr: {
    provider: "Fournisseur",
    outputLanguage: "Langue de sortie",
    detailLevel: "Niveau de détail",
    bestPractices: "Bonnes pratiques",
    suggestionCount: "Nombre de suggestions (1-8)",
    showEmoji: "Afficher le préfixe emoji",
    showBody: "Inclure le corps explicatif",
    showScope: "Afficher la portée dans le sujet",
    suggestBtn: "Suggérer",
    stopBtn: "Arrêter",
    useThisBtn: "Utiliser ceci",
    stageHint: "Préparez des fichiers et cliquez",
    generating: "Génération des suggestions…",
    providerLabel: "Fournisseur :",
    apiKeyRequired: "Clé API requise",
    apiKeyBody: "Le fournisseur {provider} nécessite une clé API. Collez la vôtre ci-dessous, ou basculez vers un fournisseur sans clé via le menu {icon}.",
    getFreeKey: "Obtenir une clé gratuite",
    pasteKey: "Coller ma clé",
    bp_imperative: "Mode impératif",
    bp_subject50: "Sujet ≤ 50 caractères",
    bp_capitalize: "Sujet en majuscule",
    bp_noPeriod: "Pas de point final",
    bp_bodyWrap72: "Corps 72 car/ligne",
    bp_explainWhy: "Corps: pourquoi, pas comment",
    bp_referenceIssues: "Référencer issues",
  },

  de: {
    provider: "Anbieter",
    outputLanguage: "Ausgabesprache",
    detailLevel: "Detailgrad",
    bestPractices: "Best Practices",
    suggestionCount: "Anzahl der Vorschläge (1-8)",
    showEmoji: "Emoji-Präfix anzeigen",
    showBody: "Erklärenden Text einfügen",
    showScope: "Scope im Betreff anzeigen",
    suggestBtn: "Vorschlagen",
    stopBtn: "Stoppen",
    useThisBtn: "Diesen verwenden",
    stageHint: "Dateien stagen, dann klicken",
    generating: "Vorschläge werden generiert…",
    providerLabel: "Anbieter:",
    apiKeyRequired: "API-Schlüssel erforderlich",
    apiKeyBody: "Der Anbieter {provider} benötigt einen API-Schlüssel. Füge deinen unten ein oder wechsle im {icon}-Menü zu einem Anbieter ohne Schlüssel.",
    getFreeKey: "Kostenlosen Schlüssel holen",
    pasteKey: "Meinen Schlüssel einfügen",
    bp_imperative: "Imperativ",
    bp_subject50: "Betreff ≤ 50 Zeichen",
    bp_capitalize: "Betreff großschreiben",
    bp_noPeriod: "Kein Punkt am Ende",
    bp_bodyWrap72: "Text 72 Zeichen/Zeile",
    bp_explainWhy: "Text: warum, nicht wie",
    bp_referenceIssues: "Issues referenzieren",
  },

  pt: {
    provider: "Provedor",
    outputLanguage: "Idioma de saída",
    detailLevel: "Nível de detalhe",
    bestPractices: "Boas práticas",
    suggestionCount: "Número de sugestões (1-8)",
    showEmoji: "Mostrar prefixo emoji",
    showBody: "Incluir corpo explicativo",
    showScope: "Mostrar escopo no assunto",
    suggestBtn: "Sugerir",
    stopBtn: "Parar",
    useThisBtn: "Usar este",
    stageHint: "Prepare arquivos e clique",
    generating: "Gerando sugestões…",
    providerLabel: "Provedor:",
    apiKeyRequired: "Chave API necessária",
    apiKeyBody: "O provedor {provider} precisa de uma chave API. Cole a sua abaixo ou mude para um provedor sem chave no menu {icon}.",
    getFreeKey: "Obter chave gratuita",
    pasteKey: "Colar minha chave",
    bp_imperative: "Modo imperativo",
    bp_subject50: "Assunto ≤ 50 caracteres",
    bp_capitalize: "Assunto com maiúscula",
    bp_noPeriod: "Sem ponto final",
    bp_bodyWrap72: "Corpo 72 car/linha",
    bp_explainWhy: "Corpo: por quê, não como",
    bp_referenceIssues: "Referenciar issues",
  },

  ru: {
    provider: "Провайдер",
    outputLanguage: "Язык вывода",
    detailLevel: "Уровень детализации",
    bestPractices: "Лучшие практики",
    suggestionCount: "Количество предложений (1-8)",
    showEmoji: "Префикс с эмодзи",
    showBody: "Включить описание",
    showScope: "Показывать scope в заголовке",
    suggestBtn: "Предложить",
    stopBtn: "Стоп",
    useThisBtn: "Использовать",
    stageHint: "Подготовьте файлы и нажмите",
    generating: "Генерация предложений…",
    providerLabel: "Провайдер:",
    apiKeyRequired: "Требуется API-ключ",
    apiKeyBody: "Провайдеру {provider} нужен API-ключ. Вставьте свой ниже или переключитесь на провайдера без ключа в меню {icon}.",
    getFreeKey: "Получить бесплатный ключ",
    pasteKey: "Вставить мой ключ",
    bp_imperative: "Повелительное",
    bp_subject50: "Заголовок ≤ 50",
    bp_capitalize: "С заглавной",
    bp_noPeriod: "Без точки в конце",
    bp_bodyWrap72: "Тело 72 символа/строка",
    bp_explainWhy: "Тело: почему, не как",
    bp_referenceIssues: "Ссылка на issue",
  },
};

export function uiString(key: UiStringKey, language: Language): string {
  return UI_STRINGS[language]?.[key] ?? EN_STRINGS[key];
}

export const ExtensionConfigSchema = z.object({
  provider: ProviderIdSchema,
  model: z.string(),
  language: LanguageSchema,
  detailLevel: DetailLevelSchema,
  bestPractices: z.array(BestPracticeIdSchema),
  suggestionCount: z.number().int().min(1).max(8),
  maxDiffTokens: z.number().int().min(500),
  enableUnofficialProviders: z.boolean(),
  customPromptPath: z.string(),
  ollamaBaseUrl: z.string(),
  showEmoji: z.boolean(),
  showBody: z.boolean(),
  showScope: z.boolean(),
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
