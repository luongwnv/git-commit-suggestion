import * as vscode from "vscode";
import { ExtensionConfig } from "../models/config";
import { formatCommitMessage, Suggestion } from "../models/suggestion";

const TYPE_EMOJI: Record<string, string> = {
  feat: "✨", fix: "🐛", docs: "📝", style: "💄", refactor: "♻️",
  perf: "⚡", test: "✅", build: "📦", ci: "👷", chore: "🔧", revert: "⏪",
};

// Messages from webview → extension. Kept minimal: the UI is presentation-only,
// the extension owns LLM calls and SCM writes.
type FromWebview =
  | { type: "ready" }
  | { type: "suggest" }
  | { type: "use"; index: number };

// Messages from extension → webview.
type ToWebview =
  | { type: "state"; state: ViewState };

interface ViewState {
  status: "idle" | "loading" | "error" | "ready";
  errorMessage?: string;
  providerLabel?: string;
  language: "bilingual" | "en" | "vi";
  suggestions: SerializedSuggestion[];
}

interface SerializedSuggestion {
  emoji: string;
  type: string;
  scope: string;
  subjectEn: string;
  subjectVi: string;
  bodyEn: string;
  bodyVi: string;
  finalMessage: string;
}

export class CommitSuggestionViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "gitCommitSuggestion.view";

  private view?: vscode.WebviewView;
  private state: ViewState = { status: "idle", language: "bilingual", suggestions: [] };

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onSuggest: () => Promise<void>,
    private readonly onUse: (suggestion: Suggestion, finalMessage: string) => Promise<void>,
    private readonly suggestionsRef: { current: Suggestion[] },
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    view.webview.html = this.renderHtml(view.webview);
    view.webview.onDidReceiveMessage((msg: FromWebview) => this.handleMessage(msg));
  }

  setLoading(providerLabel: string, language: ExtensionConfig["language"]): void {
    this.state = { status: "loading", providerLabel, language, suggestions: [] };
    this.post();
  }

  setError(errorMessage: string, language: ExtensionConfig["language"]): void {
    this.state = { status: "error", errorMessage, language, suggestions: [] };
    this.post();
  }

  setSuggestions(
    suggestions: Suggestion[],
    providerLabel: string,
    language: ExtensionConfig["language"],
  ): void {
    this.state = {
      status: "ready",
      providerLabel,
      language,
      suggestions: suggestions.map((s) => ({
        emoji: TYPE_EMOJI[s.type] ?? "•",
        type: s.type,
        scope: s.scope,
        subjectEn: s.subject_en,
        subjectVi: s.subject_vi,
        bodyEn: s.body_en,
        bodyVi: s.body_vi,
        finalMessage: formatCommitMessage(s, language),
      })),
    };
    this.post();
  }

  private post(): void {
    if (!this.view) return;
    const msg: ToWebview = { type: "state", state: this.state };
    this.view.webview.postMessage(msg);
  }

  private async handleMessage(msg: FromWebview): Promise<void> {
    switch (msg.type) {
      case "ready":
        this.post();
        break;
      case "suggest":
        await this.onSuggest();
        break;
      case "use": {
        const s = this.suggestionsRef.current[msg.index];
        const serialized = this.state.suggestions[msg.index];
        if (!s || !serialized) return;
        await this.onUse(s, serialized.finalMessage);
        break;
      }
    }
  }

  private renderHtml(webview: vscode.Webview): string {
    const nonce = randomNonce();
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
    ].join("; ");

    // The HTML is intentionally self-contained — no external assets. Easier to
    // ship via Marketplace and keeps the CSP airtight.
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background);
    padding: 8px 10px;
    margin: 0;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    gap: 8px;
  }
  .provider {
    color: var(--vscode-descriptionForeground);
    font-size: 0.85em;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 4px 10px;
    border-radius: 2px;
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button:disabled { opacity: 0.55; cursor: default; }
  button.secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .card {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 8px 10px;
    margin-bottom: 8px;
    background: var(--vscode-editor-background);
  }
  .card:hover { border-color: var(--vscode-focusBorder); }
  .subject-en {
    font-weight: 600;
    word-break: break-word;
  }
  .subject-vi {
    color: var(--vscode-descriptionForeground);
    font-style: italic;
    margin-top: 2px;
    word-break: break-word;
  }
  .body {
    margin-top: 6px;
    color: var(--vscode-descriptionForeground);
    font-size: 0.9em;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 8px;
  }
  .empty, .loading, .error {
    color: var(--vscode-descriptionForeground);
    padding: 20px 6px;
    text-align: center;
  }
  .error { color: var(--vscode-errorForeground); white-space: pre-wrap; text-align: left; }
  .spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid var(--vscode-descriptionForeground);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-right: 6px;
    vertical-align: -2px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
  <div class="header">
    <span class="provider" id="provider"></span>
    <button id="suggest-btn">Suggest</button>
  </div>
  <div id="content"><div class="empty">Stage some files, then click <b>Suggest</b>.</div></div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const contentEl = document.getElementById("content");
  const providerEl = document.getElementById("provider");
  const suggestBtn = document.getElementById("suggest-btn");

  suggestBtn.addEventListener("click", () => vscode.postMessage({ type: "suggest" }));

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function renderCard(s, idx, language) {
    const scope = s.scope ? "(" + escapeHtml(s.scope) + ")" : "";
    const showEn = language !== "vi";
    const showVi = language !== "en";
    const subjectEn = showEn && s.subjectEn
      ? '<div class="subject-en">' + s.emoji + " " + escapeHtml(s.type) + scope + ": " + escapeHtml(s.subjectEn) + "</div>"
      : "";
    const subjectVi = showVi && s.subjectVi
      ? '<div class="subject-vi">' + escapeHtml(s.subjectVi) + "</div>"
      : "";
    const bodyParts = [];
    if (showEn && s.bodyEn) bodyParts.push(escapeHtml(s.bodyEn));
    if (showVi && s.bodyVi) bodyParts.push(escapeHtml(s.bodyVi));
    const body = bodyParts.length
      ? '<div class="body">' + bodyParts.join("\\n\\n") + "</div>"
      : "";
    return '<div class="card">'
      + subjectEn + subjectVi + body
      + '<div class="actions"><button data-idx="' + idx + '" class="use-btn">Use this</button></div>'
      + "</div>";
  }

  function render(state) {
    providerEl.textContent = state.providerLabel ? "Provider: " + state.providerLabel : "";
    suggestBtn.disabled = state.status === "loading";
    if (state.status === "loading") {
      contentEl.innerHTML = '<div class="loading"><span class="spinner"></span>Generating suggestions…</div>';
      return;
    }
    if (state.status === "error") {
      contentEl.innerHTML = '<div class="error">' + escapeHtml(state.errorMessage || "Unknown error") + "</div>";
      return;
    }
    if (state.status === "idle" || state.suggestions.length === 0) {
      contentEl.innerHTML = '<div class="empty">Stage some files, then click <b>Suggest</b>.</div>';
      return;
    }
    contentEl.innerHTML = state.suggestions
      .map((s, i) => renderCard(s, i, state.language))
      .join("");
    document.querySelectorAll(".use-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-idx"), 10);
        vscode.postMessage({ type: "use", index: idx });
      });
    });
  }

  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg.type === "state") render(msg.state);
  });

  vscode.postMessage({ type: "ready" });
</script>
</body>
</html>`;
  }
}

function randomNonce(): string {
  let s = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
