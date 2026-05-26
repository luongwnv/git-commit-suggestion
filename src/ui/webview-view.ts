import * as vscode from "vscode";
import {
  BEST_PRACTICE_LABELS,
  BestPracticeId,
  DETAIL_LEVEL_LABELS,
  DETAIL_LEVEL_TRANSLATIONS,
  DetailLevel,
  LANGUAGE_LABELS,
  Language,
  UI_STRINGS,
} from "../models/config";
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
  | { type: "set-best-practice"; id: BestPracticeId; value: boolean }
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
  bestPractices: BestPracticeId[];
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

// Zero-config providers are aliased to animal codenames in the UI so the
// extension doesn't advertise upstream provider names. The internal id (used
// by the orchestrator + config) is unchanged. Labels are plain text — no
// emoji, no parenthetical descriptors — so every option looks equivalent and
// there's no implied hierarchy between "free" and "BYOK" providers.
// Hidden from the dropdown:
//   - duckduckgo: JS anti-bot challenge can't be solved from Node
//   - huggingface: router endpoint now requires a Bearer token; the BYOK
//     experience is rough enough that we'd rather not advertise it
//   - ollama: per-machine model installs make the friendly-error path
//     still too much friction
// Provider classes + config entries are kept so the orchestrator and any
// user with a custom settings override (gitCommitSuggestion.provider) still
// works; they just don't appear in the picker.
const PROVIDER_OPTIONS: { id: string; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "pollinations", label: "Whale" },
  { id: "g4f", label: "Dinosaur" },
  { id: "mistral", label: "Mistral" },
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "groq", label: "Groq" },
];

const LANGUAGE_OPTIONS: { id: Language; label: string }[] = (
  Object.keys(LANGUAGE_LABELS) as Language[]
).map((id) => ({ id, label: LANGUAGE_LABELS[id] }));

const DETAIL_IDS = Object.keys(DETAIL_LEVEL_LABELS) as DetailLevel[];

// Detail-level translations injected into the webview as a single table.
// The webview script rebuilds the dropdown options whenever the output
// language changes, using DETAIL_TRANSLATIONS_TABLE["<lang>"] || ["_default"].
const DETAIL_TRANSLATIONS_TABLE: Record<string, Record<DetailLevel, string>> = {
  _default: DETAIL_LEVEL_LABELS,
  ...(DETAIL_LEVEL_TRANSLATIONS as Record<string, Record<DetailLevel, string>>),
};

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
  onSetBestPractice: (id: BestPracticeId, value: boolean) => Promise<void>;
  onSetSuggestionCount: (count: number) => Promise<void>;
  onSetShowEmoji: (value: boolean) => Promise<void>;
  onSetShowBody: (value: boolean) => Promise<void>;
  onReady: () => Promise<void>;
}

const DEFAULT_SETTINGS: DisplaySettings = {
  providerId: "auto",
  language: "en",
  detailLevel: "normal",
  bestPractices: ["imperative", "subject50", "capitalize", "noPeriod", "explainWhy"],
  suggestionCount: 4,
  showEmoji: true,
  showBody: true,
};

const BEST_PRACTICE_IDS = Object.keys(BEST_PRACTICE_LABELS) as BestPracticeId[];

// Settings icon for the header. The earlier form/list icon (settings-svgrepo)
// felt heavy in the small header bar; switched back to the pencil-edit icon
// (setting-edit-svgrepo) which reads clearly at 20×20 and matches the same
// icon used inline in the banner text. Solid SVG, currentColor-themed.
const GEAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 40 40" fill="currentColor" aria-hidden="true"><path d="M25.1,18.6c-0.1,0-0.3,0-0.4-0.1l-3.2-3.2c-0.1-0.1-0.1-0.2-0.1-0.4s0.1-0.3,0.1-0.4l1.3-1.3c0.8-0.8,2.1-0.8,2.8,0l1.1,1.1c0.8,0.8,0.8,2.1,0,2.8l-1.3,1.3C25.4,18.6,25.2,18.6,25.1,18.6z M22.6,14.9l2.5,2.5l1-1c0.4-0.4,0.4-1,0-1.4L25,13.9c-0.4-0.4-1-0.4-1.4,0L22.6,14.9z"/><path d="M12.5,28c-0.1,0-0.3-0.1-0.4-0.1C12,27.7,12,27.6,12,27.4l0.6-3.8c0-0.1,0.1-0.2,0.1-0.3l8.8-8.8c0.2-0.2,0.5-0.2,0.7,0l3.2,3.2c0.1,0.1,0.1,0.2,0.1,0.4s-0.1,0.3-0.1,0.4l-8.8,8.8c-0.1,0.1-0.2,0.1-0.3,0.1L12.5,28C12.6,28,12.5,28,12.5,28z M13.6,23.9l-0.5,3l3-0.5l8.3-8.3l-2.5-2.5L13.6,23.9z"/><path d="M17.2,26.5c-0.1,0-0.3,0-0.4-0.1l-3.2-3.2c-0.2-0.2-0.2-0.5,0-0.7s0.5-0.2,0.7,0l3.2,3.2c0.2,0.2,0.2,0.5,0,0.7C17.5,26.4,17.4,26.5,17.2,26.5z"/></svg>`;

// Remote-control SVG used in place of 🔑 in the "API key required" banner.
// Source: assets/remote.svg. Original two-tone (light body, dark buttons)
// flattened to currentColor so it themes properly.
const REMOTE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 -0.01 64.04 64.04" fill="currentColor" aria-hidden="true"><path d="M62.886,12.297L51.741,1.154c-1.539-1.539-4.034-1.539-5.573,0L1.154,46.16c-1.539,1.539-1.539,4.033,0,5.571l11.145,11.144c1.539,1.538,4.034,1.538,5.572,0l45.015-45.006C64.425,16.33,64.425,13.836,62.886,12.297z" fill-opacity="0.35"/><circle cx="44.063" cy="20.035" r="8.006"/><circle cx="44.063" cy="20.035" r="4.003" fill-opacity="0.35"/><circle cx="31.05" cy="27.041" r="3.002"/><circle cx="37.056" cy="33.046" r="3.003"/></svg>`;

// Pencil-edit SVG used inline in the banner text where ⚙️ used to be.
// Source: assets/setting-edit-svgrepo-com.svg. Flattened fill to currentColor.
const PENCIL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 40 40" fill="currentColor" aria-hidden="true" style="vertical-align: -4px;"><path d="M25.1,18.6c-0.1,0-0.3,0-0.4-0.1l-3.2-3.2c-0.1-0.1-0.1-0.2-0.1-0.4s0.1-0.3,0.1-0.4l1.3-1.3c0.8-0.8,2.1-0.8,2.8,0l1.1,1.1c0.8,0.8,0.8,2.1,0,2.8l-1.3,1.3C25.4,18.6,25.2,18.6,25.1,18.6z M22.6,14.9l2.5,2.5l1-1c0.4-0.4,0.4-1,0-1.4L25,13.9c-0.4-0.4-1-0.4-1.4,0L22.6,14.9z"/><path d="M12.5,28c-0.1,0-0.3-0.1-0.4-0.1C12,27.7,12,27.6,12,27.4l0.6-3.8c0-0.1,0.1-0.2,0.1-0.3l8.8-8.8c0.2-0.2,0.5-0.2,0.7,0l3.2,3.2c0.1,0.1,0.1,0.2,0.1,0.4s-0.1,0.3-0.1,0.4l-8.8,8.8c-0.1,0.1-0.2,0.1-0.3,0.1L12.5,28C12.6,28,12.5,28,12.5,28z M13.6,23.9l-0.5,3l3-0.5l8.3-8.3l-2.5-2.5L13.6,23.9z"/><path d="M17.2,26.5c-0.1,0-0.3,0-0.4-0.1l-3.2-3.2c-0.2-0.2-0.2-0.5,0-0.7s0.5-0.2,0.7,0l3.2,3.2c0.2,0.2,0.2,0.5,0,0.7C17.5,26.4,17.4,26.5,17.2,26.5z"/></svg>`;

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

  // Update just the settings + hasUserKey while preserving any in-flight
  // suggestions. Used when a UI toggle changes config — we don't want
  // toggling "show emoji" to wipe the cards the user already has.
  refreshSettings(settings: DisplaySettings, hasUserKey: boolean): void {
    this.state = { ...this.state, settings, hasUserKey };
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
        if (!s) return;
        // Recompute the final message at click time using the live settings
        // — the serialized copy in state.suggestions was formatted when the
        // suggestions arrived, so it doesn't reflect later toggles to
        // showEmoji / showBody / language.
        const final = formatCommitMessage(s, {
          language: this.state.settings.language,
          showEmoji: this.state.settings.showEmoji,
          showBody: this.state.settings.showBody,
        });
        await this.cb.onUse(s, final);
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
      case "set-best-practice":
        await this.cb.onSetBestPractice(msg.id, msg.value);
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
    // Detail-level options are rendered initially in English; the webview
    // script rebuilds them whenever the output language changes, using the
    // injected DETAIL_TRANSLATIONS table.
    const detailOptionsHtml = DETAIL_IDS.map(
      (id) => `<option value="${id}">${escapeServerSide(DETAIL_LEVEL_LABELS[id])}</option>`,
    ).join("");
    // Best-practice checkboxes are rendered once with the English labels;
    // the `checked` state is synced per-instance from settings.bestPractices.
    const bestPracticesHtml = BEST_PRACTICE_IDS.map(
      (id) =>
        `<div class="settings-row inline"><input type="checkbox" id="bp-${id}" data-bp="${id}">`
        + `<label for="bp-${id}">${escapeServerSide(BEST_PRACTICE_LABELS[id])}</label></div>`,
    ).join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
  body {
    font-family: var(--vscode-font-family);
    /* var(--vscode-font-size) is ~13px which reads too small against the rest
       of the VSCode chrome inside an Activity Bar webview. Bump to 15px. */
    font-size: 15px;
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
    padding: 0 12px;
    border-radius: 2px;
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
    height: 32px;
    display: inline-flex;
    align-items: center;
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
    padding: 0;
    cursor: pointer;
    border-radius: 2px;
    height: 32px;
    width: 32px;
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
    /* Pin the dropdown to the sidebar width — long option labels (e.g.
       "Bahasa Indonesia (Indonesian)") otherwise force the <select> to expand
       beyond the VSCode container and clip behind the editor. */
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }
  /* Same for the settings card itself: never overflow horizontally. */
  .settings, body { box-sizing: border-box; max-width: 100%; }
  body { overflow-x: hidden; }
  .settings-row.inline {
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }
  .settings-row.inline label { color: var(--vscode-foreground); font-size: 1em; }
  .bp-group { display: flex; flex-direction: column; gap: 4px; }
  .bp-group .settings-row.inline { margin-bottom: 0; }
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
  .banner-title { font-weight: 600; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
  .banner-icon { display: inline-flex; align-items: center; }
  .banner-icon svg { display: block; }
  .inline-icon { display: inline-flex; align-items: center; vertical-align: -2px; margin: 0 1px; }
  .inline-icon svg { display: block; }
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
    <button id="suggest-btn" data-i18n="suggestBtn">Suggest</button>
  </div>
  <div class="settings hidden" id="settings">
    <div class="settings-row">
      <label for="language-select" data-i18n="outputLanguage">Output language</label>
      <select id="language-select">${languageOptionsHtml}</select>
    </div>
    <div class="settings-row">
      <label for="provider-select" data-i18n="provider">Provider</label>
      <select id="provider-select">${providerOptionsHtml}</select>
    </div>
    <div class="settings-row">
      <label for="detail-select" data-i18n="detailLevel">Detail level</label>
      <select id="detail-select">${detailOptionsHtml}</select>
    </div>
    <div class="settings-row">
      <label data-i18n="bestPractices">Best practices</label>
      <div class="bp-group">
        ${bestPracticesHtml}
      </div>
    </div>
    <div class="settings-row">
      <label for="count-input" data-i18n="suggestionCount">Number of suggestions (1-8)</label>
      <input type="number" id="count-input" min="1" max="8" step="1">
    </div>
    <div class="settings-row inline">
      <input type="checkbox" id="emoji-toggle">
      <label for="emoji-toggle" data-i18n="showEmoji">Show emoji prefix</label>
    </div>
    <div class="settings-row inline">
      <input type="checkbox" id="body-toggle">
      <label for="body-toggle" data-i18n="showBody">Include explanation body</label>
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

  // Per-language translations for the Detail level dropdown.
  const DETAIL_TRANSLATIONS = ${JSON.stringify(DETAIL_TRANSLATIONS_TABLE)};
  const DETAIL_IDS_CLIENT = ${JSON.stringify(DETAIL_IDS)};
  // UI string translations covering labels, buttons, banner text. Missing
  // languages fall back to English. Key format matches data-i18n attrs on
  // labels/buttons + best-practice ids prefixed with "bp_".
  const UI_TRANSLATIONS = ${JSON.stringify(UI_STRINGS)};
  function uiStr(key, language) {
    return (UI_TRANSLATIONS[language] && UI_TRANSLATIONS[language][key])
      || UI_TRANSLATIONS.en[key]
      || key;
  }
  function applyI18n(language) {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      el.textContent = uiStr(key, language);
    });
    // Best-practice checkbox labels live in <label for="bp-<id>">; sync them
    // from bp_<id> entries.
    document.querySelectorAll("input[data-bp]").forEach((cb) => {
      const id = cb.getAttribute("data-bp");
      const lbl = document.querySelector('label[for="bp-' + id + '"]');
      if (lbl) lbl.textContent = uiStr("bp_" + id, language);
    });
  }

  function rebuildDetailOptions(language) {
    const table = DETAIL_TRANSLATIONS[language] || DETAIL_TRANSLATIONS._default;
    const prev = detailSelect.value;
    detailSelect.innerHTML = DETAIL_IDS_CLIENT
      .map((id) => '<option value="' + id + '">' + escapeHtml(table[id]) + "</option>")
      .join("");
    if (prev) detailSelect.value = prev;
  }

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

  // Best-practice checkboxes. Each emits set-best-practice with its id.
  document.querySelectorAll('input[data-bp]').forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const id = e.target.getAttribute("data-bp");
      vscode.postMessage({ type: "set-best-practice", id, value: e.target.checked });
    });
  });

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
    const remoteIcon = ${JSON.stringify(REMOTE_SVG)};
    const pencilIcon = ${JSON.stringify(PENCIL_SVG)};
    const lang = state.settings.language;
    const titleText = uiStr("apiKeyRequired", lang);
    const bodyTpl = uiStr("apiKeyBody", lang)
      .replace("{provider}", "</b>" + escapeHtml(provider) + "<b>")
      .replace("{icon}", '</b><span class="inline-icon">' + pencilIcon + "</span><b>");
    const getKeyLabel = uiStr("getFreeKey", lang);
    const pasteLabel = uiStr("pasteKey", lang);
    bannerEl.innerHTML =
      '<div class="banner">'
      + '<div class="banner-title"><span class="banner-icon">' + remoteIcon + "</span> " + escapeHtml(titleText) + "</div>"
      + "<b></b>" + bodyTpl + "<b></b>"
      + '<div class="banner-actions">'
      + (provider === "mistral"
          ? '<button class="secondary" id="open-console">' + escapeHtml(getKeyLabel) + "</button>"
          : "")
      + '<button id="paste-key">' + escapeHtml(pasteLabel) + "</button>"
      + "</div></div>";
    if (provider === "mistral") {
      $("open-console").addEventListener("click", () =>
        vscode.postMessage({ type: "open-mistral-console" }));
    }
    $("paste-key").addEventListener("click", () =>
      vscode.postMessage({ type: "paste-key" }));
  }

  function renderCard(s, idx, settings) {
    const language = settings.language;
    const scope = s.scope ? "(" + escapeHtml(s.scope) + ")" : "";
    const showEn = language !== "vi";
    const showVi = language === "vi" || language === "bilingual";
    const isOther = language !== "en" && language !== "vi" && language !== "bilingual";
    const primarySubject = isOther ? (s.subjectEn || s.subjectVi) : (showEn ? s.subjectEn : "");
    const primaryBody = isOther ? (s.bodyEn || s.bodyVi) : (showEn ? s.bodyEn : "");
    const emojiPrefix = settings.showEmoji ? s.emoji + " " : "";
    const headerLine = primarySubject
      ? '<div class="subject-en">' + emojiPrefix + escapeHtml(s.type) + scope + ": " + escapeHtml(primarySubject) + "</div>"
      : "";
    const subjectVi = !isOther && showVi && s.subjectVi
      ? '<div class="subject-vi">' + escapeHtml(s.subjectVi) + "</div>"
      : "";
    const bodyParts = [];
    if (settings.showBody && primaryBody) bodyParts.push(escapeHtml(primaryBody));
    if (settings.showBody && !isOther && showVi && s.bodyVi && s.bodyVi !== primaryBody) {
      bodyParts.push(escapeHtml(s.bodyVi));
    }
    const body = bodyParts.length
      ? '<div class="body">' + bodyParts.join("\\n\\n") + "</div>"
      : "";
    const useLabel = escapeHtml(uiStr("useThisBtn", language));
    return '<div class="card">'
      + headerLine + subjectVi + body
      + '<div class="actions"><button data-idx="' + idx + '" class="use-btn">' + useLabel + "</button></div>"
      + "</div>";
  }

  let lastDetailLang = null;
  function syncSettings(settings) {
    if (providerSelect.value !== settings.providerId) providerSelect.value = settings.providerId;
    if (languageSelect.value !== settings.language) languageSelect.value = settings.language;
    // Rebuild Detail level options + retranslate every UI label whenever
    // the output language changes, so the entire panel switches language.
    if (lastDetailLang !== settings.language) {
      rebuildDetailOptions(settings.language);
      applyI18n(settings.language);
      lastDetailLang = settings.language;
    }
    if (detailSelect.value !== settings.detailLevel) detailSelect.value = settings.detailLevel;
    if (parseInt(countInput.value, 10) !== settings.suggestionCount) {
      countInput.value = String(settings.suggestionCount);
    }
    if (emojiToggle.checked !== settings.showEmoji) emojiToggle.checked = settings.showEmoji;
    if (bodyToggle.checked !== settings.showBody) bodyToggle.checked = settings.showBody;
    // Sync best-practice checkboxes from the active list.
    const active = new Set(settings.bestPractices || []);
    document.querySelectorAll('input[data-bp]').forEach((cb) => {
      const id = cb.getAttribute("data-bp");
      const want = active.has(id);
      if (cb.checked !== want) cb.checked = want;
    });
  }

  function render(state) {
    const lang = state.settings.language;
    providerEl.textContent = state.providerLabel
      ? uiStr("providerLabel", lang) + " " + state.providerLabel
      : "";
    suggestBtn.disabled = state.status === "loading";
    syncSettings(state.settings);
    renderBanner(state);
    if (state.status === "loading") {
      const msg = escapeHtml(uiStr("generating", state.settings.language));
      contentEl.innerHTML = '<div class="loading"><span class="spinner"></span>' + msg + "</div>";
      return;
    }
    if (state.status === "error") {
      contentEl.innerHTML = '<div class="error">' + escapeHtml(state.errorMessage || "Unknown error") + "</div>";
      return;
    }
    if (state.status === "idle" || state.suggestions.length === 0) {
      const lang = state.settings.language;
      const hint = escapeHtml(uiStr("stageHint", lang));
      const btn = escapeHtml(uiStr("suggestBtn", lang));
      contentEl.innerHTML = '<div class="empty">' + hint + ' <b>' + btn + "</b>.</div>";
      return;
    }
    contentEl.innerHTML = state.suggestions
      .map((s, i) => renderCard(s, i, state.settings))
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
