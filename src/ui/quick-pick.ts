import * as vscode from "vscode";
import { Language } from "../models/config";
import { formatCommitMessage, Suggestion } from "../models/suggestion";

const TYPE_EMOJI: Record<string, string> = {
  feat: "✨", fix: "🐛", docs: "📝", style: "💄", refactor: "♻️",
  perf: "⚡", test: "✅", build: "📦", ci: "👷", chore: "🔧", revert: "⏪",
};

interface PickItem extends vscode.QuickPickItem {
  suggestion: Suggestion;
  finalMessage: string;
}

export async function pickSuggestion(
  suggestions: Suggestion[],
  language: Language,
  placeholder: string,
  showEmoji: boolean,
  showBody: boolean,
): Promise<{ suggestion: Suggestion; finalMessage: string } | undefined> {
  const items: PickItem[] = suggestions.map((s) => {
    const emoji = TYPE_EMOJI[s.type] ?? "•";
    const scope = s.scope ? `(${s.scope})` : "";
    const labelEn = `${emoji} ${s.type}${scope}: ${s.subject_en || s.subject_vi}`;
    const detailVi = language === "en" ? "" : s.subject_vi;
    return {
      label: labelEn,
      description: detailVi || undefined,
      detail: s.body_en || s.body_vi || undefined,
      suggestion: s,
      finalMessage: formatCommitMessage(s, { language, showEmoji, showBody }),
    };
  });

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: placeholder,
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!picked) return undefined;
  return { suggestion: picked.suggestion, finalMessage: picked.finalMessage };
}
