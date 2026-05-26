import { z } from "zod";

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

export function formatCommitMessage(
  s: Suggestion,
  language: "bilingual" | "en" | "vi",
): string {
  const scope = s.scope ? `(${s.scope})` : "";
  if (language === "vi") {
    const header = `${s.type}${scope}: ${s.subject_vi || s.subject_en}`;
    return s.body_vi ? `${header}\n\n${s.body_vi}` : header;
  }
  if (language === "en") {
    const header = `${s.type}${scope}: ${s.subject_en || s.subject_vi}`;
    return s.body_en ? `${header}\n\n${s.body_en}` : header;
  }
  const header = `${s.type}${scope}: ${s.subject_en}`;
  const parts: string[] = [header];
  if (s.body_en) parts.push("", s.body_en);
  if (s.subject_vi) parts.push("", `VI: ${s.subject_vi}`);
  if (s.body_vi) parts.push("", s.body_vi);
  return parts.join("\n");
}
