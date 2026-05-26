import { Suggestion, SuggestionArraySchema, SuggestionSchema } from "../models/suggestion";

// LLMs occasionally wrap JSON in ```json fences or include leading prose
// despite the instruction. Strip those, then try to find the JSON payload.
function stripFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

// Returns the JSON payload as a string, plus a hint about whether the model
// emitted a single object instead of an array. We accept three shapes:
//   1. `[ {...}, {...} ]`
//   2. `{ "suggestions": [...] }`
//   3. `{ "type": "...", "scope": "...", ... }`  — single suggestion as a bare
//      object. Pollinations' anonymous tier (gpt-oss-20b) frequently emits this
//      when only one suggestion is requested or when the model collapses
//      multiple candidates into one.
function extractJsonPayload(s: string): { json: string; wasObject: boolean } {
  const trimmed = stripFences(s);
  if (trimmed.startsWith("[")) return { json: trimmed, wasObject: false };

  const wrapperMatch = trimmed.match(/"suggestions"\s*:\s*(\[[\s\S]*\])/);
  if (wrapperMatch) return { json: wrapperMatch[1], wasObject: false };

  if (trimmed.startsWith("{")) return { json: trimmed, wasObject: true };

  const arrStart = trimmed.indexOf("[");
  const arrEnd = trimmed.lastIndexOf("]");
  if (arrStart >= 0 && arrEnd > arrStart) {
    return { json: trimmed.slice(arrStart, arrEnd + 1), wasObject: false };
  }

  const objStart = trimmed.indexOf("{");
  const objEnd = trimmed.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) {
    return { json: trimmed.slice(objStart, objEnd + 1), wasObject: true };
  }
  throw new Error(`No JSON payload found in response: ${trimmed.slice(0, 200)}`);
}

// Drop the trailing incomplete element of a truncated JSON array, then close
// brackets. Handles the common `[{...full}, {...full}, {"body_vi": "Th` cut.
function repairTruncatedJson(s: string): string {
  const trimmed = s.trim();
  if (!trimmed.startsWith("[")) return s;
  // Find the last `},` that closes a complete element (i.e. closing brace at
  // top-level inside the array). Walk through tracking depth and string state.
  let depth = 0;
  let inStr = false;
  let escape = false;
  let lastSafeClose = -1;
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 1 && c === "}") lastSafeClose = i;
    }
  }
  if (lastSafeClose < 0) return s;
  return trimmed.slice(0, lastSafeClose + 1) + "]";
}

const ALLOWED_TYPES = new Set([
  "feat", "fix", "docs", "style", "refactor", "perf",
  "test", "build", "ci", "chore", "revert",
]);

export function parseSuggestions(rawText: string): Suggestion[] {
  const { json, wasObject } = extractJsonPayload(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    // Token-budget truncation often cuts off the JSON mid-string. Try a
    // repair: drop the last incomplete object/string, close braces, retry.
    try {
      parsed = JSON.parse(repairTruncatedJson(json));
    } catch (err) {
      throw new Error(`Invalid JSON from LLM: ${(err as Error).message}`);
    }
  }

  let arr: Suggestion[];
  if (wasObject) {
    // The model emitted one suggestion as a bare object. Wrap it.
    const single = SuggestionSchema.parse(parsed);
    arr = [single];
  } else {
    arr = SuggestionArraySchema.parse(parsed);
  }

  return arr.map((s) => ({
    ...s,
    type: ALLOWED_TYPES.has(s.type) ? s.type : "chore",
    scope: s.scope.trim().toLowerCase().replace(/\s+/g, "-"),
  }));
}
