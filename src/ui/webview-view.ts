import * as vscode from "vscode";
import { DETAIL_LEVEL_LABELS, DetailLevel, LANGUAGE_LABELS, Language } from "../models/config";
import { formatCommitMessage, Suggestion } from "../models/suggestion";

const TYPE_EMOJI: Record<string, string> = {
  feat: "✨", fix: "🐛", docs: "📝", style: "💄", refactor: "♻️",
  perf: "⚡", test: "✅", build: "📦", ci: "👷", chore: "🔧", revert: "⏪",
};

// Messages from webview → extension. Kept minimal: the UI is presentation-only,
// the extension owns LLM calls, SCM writes, and config persistence.
type FromWebview =
  | { type: "ready" }
  | { type: "suggest" }
  | { type: "use"; index: number }
  | { type: "paste-key" }
  | { type: "open-mistral-console" }
  | { type: "set-provider"; providerId: string }
  | { type: "set-language"; language: Language }
  | { type: "set-detail-level"; detailLevel: DetailLevel }
  | { type: "set-suggestion-count"; count: number }
  | { type: "set-show-emoji"; value: boolean }
  | { type: "set-show-body"; value: boolean };

type ToWebview = { type: "state"; state: ViewState };

// Settings the user can flip from the inline panel. Kept as a single object
// so adding a new option means changing one struct, one renderer, one wiring.
export interface DisplaySettings {
  providerId: string;
  language: Language;
  detailLevel: DetailLevel;
  suggestionCount: number;
  showEmoji: boolean;
  showBody: boolean;
}

interface ViewState {
  status: "idle" | "loading" | "error" | "ready";
  errorMessage?: string;
  providerLabel?: string;
  settings: DisplaySettings;
  hasUserKey: boolean;
  suggestions: SerializedSuggestion[];
}

const PROVIDER_OPTIONS: { id: string; label: string }[] = [
  { id: "auto", label: "Auto (try all free providers)" },
  { id: "pollinations", label: "Pollinations (free, no key)" },
  { id: "duckduckgo", label: "DuckDuckGo AI (free, no key)" },
  { id: "huggingface", label: "HuggingFace (free, optional key)" },
  { id: "mistral", label: "Mistral (free tier or BYOK)" },
  { id: "openai", label: "OpenAI (BYOK)" },
  { id: "anthropic", label: "Anthropic (BYOK)" },
  { id: "groq", label: "Groq (free tier)" },
  { id: "ollama", label: "Ollama (local)" },
  { id: "g4f", label: "g4f (unofficial)" },
];

const LANGUAGE_OPTIONS: { id: Language; label: string }[] = (
  Object.keys(LANGUAGE_LABELS) as Language[]
).map((id) => ({ id, label: LANGUAGE_LABELS[id] }));

const DETAIL_OPTIONS: { id: DetailLevel; label: string }[] = (
  Object.keys(DETAIL_LEVEL_LABELS) as DetailLevel[]
).map((id) => ({ id, label: DETAIL_LEVEL_LABELS[id] }));

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

export interface ViewCallbacks {
  onSuggest: () => Promise<void>;
  onUse: (suggestion: Suggestion, finalMessage: string) => Promise<void>;
  onPasteKey: () => Promise<void>;
  onOpenMistralConsole: () => Promise<void>;
  onSetProvider: (providerId: string) => Promise<void>;
  onSetLanguage: (language: Language) => Promise<void>;
  onSetDetailLevel: (detailLevel: DetailLevel) => Promise<void>;
  onSetSuggestionCount: (count: number) => Promise<void>;
  onSetShowEmoji: (value: boolean) => Promise<void>;
  onSetShowBody: (value: boolean) => Promise<void>;
  onReady: () => Promise<void>;
}

const DEFAULT_SETTINGS: DisplaySettings = {
  providerId: "auto",
  language: "bilingual",
  detailLevel: "normal",
  suggestionCount: 4,
  showEmoji: true,
  showBody: true,
};

// Settings icon. Solid SVG, no outer rectangle frame — just the form/list
// content paths from settings-svgrepo-com.svg. Inline so the webview's strict
// CSP (no external assets) stays happy and the icon scales/recolors with
// currentColor.
const GEAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 218.207 218.207" fill="currentColor" aria-hidden="true"><path d="M54.521,105.207h35.13c12.875,0,23.349-10.487,23.349-23.379c0-12.892-10.474-23.379-23.349-23.379h-35.13c-12.875,0-23.349,10.487-23.349,23.379C31.172,94.72,41.646,105.207,54.521,105.207z M54.521,66.241h35.13c8.577,0,15.556,6.99,15.556,15.586c0,8.596-6.979,15.586-15.556,15.586h-35.13c-8.577,0-15.556-6.99-15.556-15.586C38.965,73.231,45.944,66.241,54.521,66.241z"/><rect x="128.586" y="58.448" width="58.599" height="7.793"/><rect x="128.586" y="74.034" width="38.966" height="7.793"/><rect x="128.586" y="113" width="27.276" height="7.793"/><rect x="128.586" y="128.586" width="50.832" height="7.793"/><rect x="128.586" y="144.172" width="50.832" height="7.793"/><path d="M85.724,93.517c6.446,0,11.69-5.244,11.69-11.69c0-6.446-5.244-11.69-11.69-11.69s-11.69,5.244-11.69,11.69C74.034,88.274,79.278,93.517,85.724,93.517z M85.724,77.931c2.148,0,3.897,1.746,3.897,3.897s-1.748,3.897-3.897,3.897s-3.897-1.746-3.897-3.897S83.576,77.931,85.724,77.931z"/><path d="M54.521,159.759h35.13c12.875,0,23.349-10.487,23.349-23.379c0-12.893-10.474-23.38-23.349-23.38h-35.13c-12.875,0-23.349,10.487-23.349,23.379C31.172,149.271,41.646,159.759,54.521,159.759z M54.521,120.793h35.13c8.577,0,15.556,6.99,15.556,15.586c0,8.596-6.979,15.586-15.556,15.586h-35.13c-8.577,0-15.556-6.99-15.556-15.586C38.966,127.783,45.944,120.793,54.521,120.793z"/><path d="M58.448,148.069c6.446,0,11.69-5.244,11.69-11.69c0-6.446-5.244-11.69-11.69-11.69s-11.69,5.244-11.69,11.69C46.759,142.825,52.002,148.069,58.448,148.069z M58.448,132.483c2.148,0,3.897,1.746,3.897,3.897c0,2.15-1.748,3.897-3.897,3.897c-2.148,0-3.897-1.746-3.897-3.897C54.552,134.229,56.3,132.483,58.448,132.483z"/></svg>`;

export class CommitSuggestionViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "gitCommitSuggestion.view";

  private view?: vscode.WebviewView;
  private state: ViewState = {
    status: "idle",
    settings: { ...DEFAULT_SETTINGS },
    suggestions: [],
    hasUserKey: false,
  };

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly cb: ViewCallbacks,
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

  setLoading(settings: DisplaySettings, hasUserKey: boolean): void {
    this.state = {
      status: "loading",
      providerLabel: settings.providerId,
      settings,
      hasUserKey,
      suggestions: [],
    };
    this.post();
  }

  setError(errorMessage: string, settings: DisplaySettings, hasUserKey: boolean): void {
    this.state = {
      status: "error",
      errorMessage,
      settings,
      hasUserKey,
      suggestions: [],
    };
    this.post();
  }

  setIdle(settings: DisplaySettings, hasUserKey: boolean): void {
    this.state = {
      status: "idle",
      settings,
      hasUserKey,
      suggestions: [],
    };
    this.post();
  }

  setSuggestions(
    suggestions: Suggestion[],
    providerLabel: string,
    settings: DisplaySettings,
    hasUserKey: boolean,
  ): void {
    this.state = {
      status: "ready",
      providerLabel,
      settings,
      hasUserKey,
      suggestions: suggestions.map((s) => ({
        emoji: TYPE_EMOJI[s.type] ?? "•",
        type: s.type,
        scope: s.scope,
        subjectEn: s.subject_en,
        subjectVi: s.subject_vi,
        bodyEn: s.body_en,
        bodyVi: s.body_vi,
        finalMessage: formatCommitMessage(s, {
          language: settings.language,
          showEmoji: settings.showEmoji,
          showBody: settings.showBody,
        }),
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
        await this.cb.onReady();
        this.post();
        break;
      case "suggest":
        await this.cb.onSuggest();
        break;
      case "use": {
        const s = this.suggestionsRef.current[msg.index];
        const serialized = this.state.suggestions[msg.index];
        if (!s || !serialized) return;
        await this.cb.onUse(s, serialized.finalMessage);
        break;
      }
      case "paste-key":
        await this.cb.onPasteKey();
        break;
      case "open-mistral-console":
        await this.cb.onOpenMistralConsole();
        break;
      case "set-provider":
        await this.cb.onSetProvider(msg.providerId);
        break;
      case "set-language":
        await this.cb.onSetLanguage(msg.language);
        break;
      case "set-detail-level":
        await this.cb.onSetDetailLevel(msg.detailLevel);
        break;
      case "set-suggestion-count":
        await this.cb.onSetSuggestionCount(msg.count);
        break;
      case "set-show-emoji":
        await this.cb.onSetShowEmoji(msg.value);
        break;
      case "set-show-body":
        await this.cb.onSetShowBody(msg.value);
        break;
    }
  }

  private renderHtml(webview: vscode.Webview): string {
    const nonce = randomNonce();
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
    ].join("; ");

    const providerOptionsHtml = PROVIDER_OPTIONS.map(
      (p) => `<option value="${p.id}">${escapeServerSide(p.label)}</option>`,
    ).join("");
    const languageOptionsHtml = LANGUAGE_OPTIONS.map(
      (l) => `<option value="${l.id}">${escapeServerSide(l.label)}</option>`,
    ).join("");
    const detailOptionsHtml = DETAIL_OPTIONS.map(
      (d) => `<option value="${d.id}">${escapeServerSide(d.label)}</option>`,
    ).join("");

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
    gap: 6px;
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
  .icon-btn {
    background: transparent;
    color: var(--vscode-icon-foreground, var(--vscode-foreground));
    border: none;
    padding: 4px 6px;
    cursor: pointer;
    border-radius: 2px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
  }
  .icon-btn:hover { background: var(--vscode-toolbar-hoverBackground); }
  .icon-btn svg { display: block; }
  .settings {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 10px;
    margin-bottom: 10px;
    background: var(--vscode-editor-background);
  }
  .settings.hidden { display: none; }
  .settings-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 10px;
  }
  .settings-row:last-child { margin-bottom: 0; }
  .settings-row label {
    font-size: 0.85em;
    color: var(--vscode-descriptionForeground);
  }
  .settings-row select,
  .settings-row input[type="number"] {
    background: var(--vscode-dropdown-background);
    color: var(--vscode-dropdown-foreground);
    border: 1px solid var(--vscode-dropdown-border);
    padding: 4px 6px;
    font-family: inherit;
    font-size: inherit;
    border-radius: 2px;
  }
  .settings-row.inline {
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }
  .settings-row.inline label { color: var(--vscode-foreground); font-size: 1em; }
  .card {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 8px 10px;
    margin-bottom: 8px;
    background: var(--vscode-editor-background);
  }
  .card:hover { border-color: var(--vscode-focusBorder); }
  .subject-en { font-weight: 600; word-break: break-word; }
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
  .banner {
    border: 1px solid var(--vscode-inputValidation-warningBorder, #f0ad4e);
    background: var(--vscode-inputValidation-warningBackground, rgba(240, 173, 78, 0.1));
    color: var(--vscode-foreground);
    padding: 8px 10px;
    border-radius: 4px;
    margin-bottom: 10px;
    font-size: 0.85em;
    line-height: 1.4;
  }
  .banner-title { font-weight: 600; margin-bottom: 4px; }
  .banner-actions { display: flex; gap: 6px; margin-top: 6px; }
  .banner-actions button { font-size: 0.95em; padding: 3px 8px; }
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
    <button class="icon-btn" id="settings-btn" title="Settings">${GEAR_SVG}</button>
    <button id="suggest-btn">Suggest</button>
  </div>
  <div class="settings hidden" id="settings">
    <div class="settings-row">
      <label for="provider-select">Provider</label>
      <select id="provider-select">${providerOptionsHtml}</select>
    </div>
    <div class="settings-row">
      <label for="language-select">Output language</label>
      <select id="language-select">${languageOptionsHtml}</select>
    </div>
    <div class="settings-row">
      <label for="detail-select">Detail level</label>
      <select id="detail-select">${detailOptionsHtml}</select>
    </div>
    <div class="settings-row">
      <label for="count-input">Number of suggestions (1-8)</label>
      <input type="number" id="count-input" min="1" max="8" step="1">
    </div>
    <div class="settings-row inline">
      <input type="checkbox" id="emoji-toggle">
      <label for="emoji-toggle">Show emoji prefix (✨ feat: …)</label>
    </div>
    <div class="settings-row inline">
      <input type="checkbox" id="body-toggle">
      <label for="body-toggle">Include explanation body</label>
    </div>
  </div>
  <div id="banner"></div>
  <div id="content"><div class="empty">Stage some files, then click <b>Suggest</b>.</div></div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const contentEl = $("content");
  const providerEl = $("provider");
  const bannerEl = $("banner");
  const suggestBtn = $("suggest-btn");
  const settingsBtn = $("settings-btn");
  const settingsEl = $("settings");
  const providerSelect = $("provider-select");
  const languageSelect = $("language-select");
  const detailSelect = $("detail-select");
  const countInput = $("count-input");
  const emojiToggle = $("emoji-toggle");
  const bodyToggle = $("body-toggle");

  suggestBtn.addEventListener("click", () => vscode.postMessage({ type: "suggest" }));
  settingsBtn.addEventListener("click", () => settingsEl.classList.toggle("hidden"));
  providerSelect.addEventListener("change", (e) =>
    vscode.postMessage({ type: "set-provider", providerId: e.target.value }));
  languageSelect.addEventListener("change", (e) =>
    vscode.postMessage({ type: "set-language", language: e.target.value }));
  detailSelect.addEventListener("change", (e) =>
    vscode.postMessage({ type: "set-detail-level", detailLevel: e.target.value }));
  countInput.addEventListener("change", (e) => {
    const n = Math.max(1, Math.min(8, parseInt(e.target.value, 10) || 4));
    e.target.value = String(n);
    vscode.postMessage({ type: "set-suggestion-count", count: n });
  });
  emojiToggle.addEventListener("change", (e) =>
    vscode.postMessage({ type: "set-show-emoji", value: e.target.checked }));
  bodyToggle.addEventListener("change", (e) =>
    vscode.postMessage({ type: "set-show-body", value: e.target.checked }));

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // Providers that require an API key. Auto/Pollinations/DuckDuckGo/HF/Ollama/g4f
  // work without one. Mirrors the BYOK column in docs/provider-comparison.html.
  const KEY_REQUIRED = ["mistral", "openai", "anthropic", "groq"];

  function renderBanner(state) {
    const needsKey = KEY_REQUIRED.indexOf(state.settings.providerId) >= 0;
    if (!needsKey || state.hasUserKey) {
      bannerEl.innerHTML = "";
      return;
    }
    const provider = state.settings.providerId;
    bannerEl.innerHTML =
      '<div class="banner">'
      + '<div class="banner-title">🔑 API key required</div>'
      + "The <b>" + escapeHtml(provider) + "</b> provider needs an API key. "
      + "Paste yours below, or switch to a no-key provider from the ⚙️ menu."
      + '<div class="banner-actions">'
      + (provider === "mistral"
          ? '<button class="secondary" id="open-console">Get free key</button>'
          : "")
      + '<button id="paste-key">Paste my key</button>'
      + "</div></div>";
    if (provider === "mistral") {
      $("open-console").addEventListener("click", () =>
        vscode.postMessage({ type: "open-mistral-console" }));
    }
    $("paste-key").addEventListener("click", () =>
      vscode.postMessage({ type: "paste-key" }));
  }

  function renderCard(s, idx, language) {
    const scope = s.scope ? "(" + escapeHtml(s.scope) + ")" : "";
    const showEn = language !== "vi";
    const showVi = language === "vi" || language === "bilingual";
    const isOther = language !== "en" && language !== "vi" && language !== "bilingual";
    const primarySubject = isOther ? (s.subjectEn || s.subjectVi) : (showEn ? s.subjectEn : "");
    const primaryBody = isOther ? (s.bodyEn || s.bodyVi) : (showEn ? s.bodyEn : "");
    const headerLine = primarySubject
      ? '<div class="subject-en">' + s.emoji + " " + escapeHtml(s.type) + scope + ": " + escapeHtml(primarySubject) + "</div>"
      : "";
    const subjectVi = !isOther && showVi && s.subjectVi
      ? '<div class="subject-vi">' + escapeHtml(s.subjectVi) + "</div>"
      : "";
    const bodyParts = [];
    if (primaryBody) bodyParts.push(escapeHtml(primaryBody));
    if (!isOther && showVi && s.bodyVi && s.bodyVi !== primaryBody) bodyParts.push(escapeHtml(s.bodyVi));
    const body = bodyParts.length
      ? '<div class="body">' + bodyParts.join("\\n\\n") + "</div>"
      : "";
    return '<div class="card">'
      + headerLine + subjectVi + body
      + '<div class="actions"><button data-idx="' + idx + '" class="use-btn">Use this</button></div>'
      + "</div>";
  }

  function syncSettings(settings) {
    if (providerSelect.value !== settings.providerId) providerSelect.value = settings.providerId;
    if (languageSelect.value !== settings.language) languageSelect.value = settings.language;
    if (detailSelect.value !== settings.detailLevel) detailSelect.value = settings.detailLevel;
    if (parseInt(countInput.value, 10) !== settings.suggestionCount) {
      countInput.value = String(settings.suggestionCount);
    }
    if (emojiToggle.checked !== settings.showEmoji) emojiToggle.checked = settings.showEmoji;
    if (bodyToggle.checked !== settings.showBody) bodyToggle.checked = settings.showBody;
  }

  function render(state) {
    providerEl.textContent = state.providerLabel ? "Provider: " + state.providerLabel : "";
    suggestBtn.disabled = state.status === "loading";
    syncSettings(state.settings);
    renderBanner(state);
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
      .map((s, i) => renderCard(s, i, state.settings.language))
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

function escapeServerSide(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

function randomNonce(): string {
  let s = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
