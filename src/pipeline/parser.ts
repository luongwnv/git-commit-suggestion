import { Suggestion, SuggestionArraySchema } from "../models/suggestion";

// LLMs occasionally wrap JSON in ```json fences or include leading prose
// despite the instruction. Strip those, then try to find the JSON array.
function stripFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

function extractJsonArray(s: string): string {
  const trimmed = stripFences(s);
  if (trimmed.startsWith("[")) return trimmed;
  // Some providers wrap in `{ "suggestions": [...] }`.
  const objectMatch = trimmed.match(/"suggestions"\s*:\s*(\[[\s\S]*\])/);
  if (objectMatch) return objectMatch[1];
  // Last resort: find the first `[` and matching `]`.
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  throw new Error(`No JSON array found in response: ${trimmed.slice(0, 200)}`);
}

const ALLOWED_TYPES = new Set([
  "feat", "fix", "docs", "style", "refactor", "perf",
  "test", "build", "ci", "chore", "revert",
]);

export function parseSuggestions(rawText: string): Suggestion[] {
  const jsonStr = extractJsonArray(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`Invalid JSON from LLM: ${(err as Error).message}`);
  }
  const arr = SuggestionArraySchema.parse(parsed);
  return arr.map((s) => ({
    ...s,
    type: ALLOWED_TYPES.has(s.type) ? s.type : "chore",
    scope: s.scope.trim().toLowerCase().replace(/\s+/g, "-"),
  }));
}
