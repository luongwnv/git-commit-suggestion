import { z } from "zod";
import { Language } from "./config";

export const SuggestionSchema = z.object({
  type: z.string().min(1),
  scope: z.string().default(""),
  subject_en: z.string().default(""),
  subject_vi: z.string().default(""),
  body_en: z.string().default(""),
  body_vi: z.string().default(""),
});

export type Suggestion = z.infer<typeof SuggestionSchema>;

export const SuggestionArraySchema = z.array(SuggestionSchema).min(1);

const TYPE_EMOJI: Record<string, string> = {
  feat: "✨", fix: "🐛", docs: "📝", style: "💄", refactor: "♻️",
  perf: "⚡", test: "✅", build: "📦", ci: "👷", chore: "🔧", revert: "⏪",
};

export interface FormatOptions {
  language: Language;
  showEmoji: boolean;
  showBody: boolean;
}

export function formatCommitMessage(s: Suggestion, opts: FormatOptions): string {
  const { language, showEmoji, showBody } = opts;
  const emojiPrefix = showEmoji && TYPE_EMOJI[s.type] ? `${TYPE_EMOJI[s.type]} ` : "";
  const scope = s.scope ? `(${s.scope})` : "";

  // For non-English/Vietnamese languages the prompt writes the requested
  // language into both subject_en and subject_vi — prefer subject_en, fall
  // back to subject_vi so we still produce something if the model only
  // populated one field.
  const pickPrimary = (): { subject: string; body: string } => {
    if (language === "vi") {
      return { subject: s.subject_vi || s.subject_en, body: s.body_vi || s.body_en };
    }
    if (language === "en" || language === "bilingual") {
      return { subject: s.subject_en || s.subject_vi, body: s.body_en || s.body_vi };
    }
    return { subject: s.subject_en || s.subject_vi, body: s.body_en || s.body_vi };
  };

  if (language === "bilingual") {
    const header = `${emojiPrefix}${s.type}${scope}: ${s.subject_en || s.subject_vi}`;
    const parts: string[] = [header];
    if (showBody && s.body_en) parts.push("", s.body_en);
    if (s.subject_vi) parts.push("", `VI: ${s.subject_vi}`);
    if (showBody && s.body_vi) parts.push("", s.body_vi);
    return parts.join("\n");
  }

  const { subject, body } = pickPrimary();
  const header = `${emojiPrefix}${s.type}${scope}: ${subject}`;
  if (showBody && body) return `${header}\n\n${body}`;
  return header;
}
