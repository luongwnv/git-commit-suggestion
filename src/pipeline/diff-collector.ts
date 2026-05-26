import { FileDiff, ParsedDiff } from "../models/diff";
import { runGit } from "../utils/git";

// Rough heuristic: 1 token ≈ 4 chars for English/code. Used only for budgeting
// before the LLM call — providers do their own real tokenization.
function approxTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

function splitByFile(raw: string): FileDiff[] {
  if (!raw) return [];
  const parts = raw.split(/^diff --git /m).filter((p) => p.trim());
  return parts.map((p) => {
    const body = `diff --git ${p}`;
    const m = body.match(/^diff --git a\/(.+?) b\//m);
    const path = m?.[1] ?? "(unknown)";
    return { path, hunks: body, approxTokens: approxTokens(body) };
  });
}

export async function collectStagedDiff(cwd: string, maxTokens: number): Promise<ParsedDiff> {
  const raw = await runGit(cwd, ["diff", "--staged", "--no-color", "-U3"]);
  const all = splitByFile(raw);
  const total = all.reduce((acc, f) => acc + f.approxTokens, 0);
  if (total <= maxTokens) {
    return { files: all, totalApproxTokens: total, truncated: false };
  }

  // Keep small files whole; for large files, keep the header + first N hunks
  // until we exhaust the budget.
  const sorted = [...all].sort((a, b) => a.approxTokens - b.approxTokens);
  const kept: FileDiff[] = [];
  let used = 0;
  for (const f of sorted) {
    if (used + f.approxTokens <= maxTokens) {
      kept.push(f);
      used += f.approxTokens;
    } else {
      const remaining = maxTokens - used;
      if (remaining < 200) break;
      const truncated = truncateFile(f, remaining);
      kept.push(truncated);
      used += truncated.approxTokens;
      break;
    }
  }
  kept.sort((a, b) => a.path.localeCompare(b.path));
  return { files: kept, totalApproxTokens: used, truncated: true };
}

function truncateFile(f: FileDiff, tokenBudget: number): FileDiff {
  const marker = `\n... [truncated 999999999 chars]`;
  const charBudget = tokenBudget * 4 - marker.length;
  if (f.hunks.length <= charBudget) return f;
  const head = f.hunks.slice(0, Math.max(0, charBudget));
  const trimmed = `${head}\n... [truncated ${f.hunks.length - head.length} chars]`;
  return { path: f.path, hunks: trimmed, approxTokens: approxTokens(trimmed) };
}

export function renderDiff(p: ParsedDiff): string {
  return p.files.map((f) => f.hunks).join("\n");
}
