import * as vscode from "vscode";
import {
  BestPracticeId,
  DetailLevel,
  ExtensionConfig,
  ExtensionConfigSchema,
  Language,
  ProviderId,
  ProviderIdSchema,
} from "./models/config";
import { Suggestion, formatCommitMessage } from "./models/suggestion";
import { suggestCommits } from "./pipeline/orchestrator";
import { pickSuggestion } from "./ui/quick-pick";
import { writeToScmInput } from "./ui/scm-writer";
import { createStatusBarItem } from "./ui/status-bar";
import { CommitSuggestionViewProvider, DisplaySettings } from "./ui/webview-view";
import { t } from "./utils/i18n";
import { log } from "./utils/logger";

const SECRET_KEY = (provider: string) => `gitCommitSuggestion.apiKey.${provider}`;

function readConfig(): ExtensionConfig {
  const c = vscode.workspace.getConfiguration("gitCommitSuggestion");
  return ExtensionConfigSchema.parse({
    provider: c.get("provider"),
    model: c.get("model", ""),
    language: c.get("language"),
    detailLevel: c.get("detailLevel"),
    bestPractices: c.get("bestPractices"),
    suggestionCount: c.get("suggestionCount"),
    maxDiffTokens: c.get("maxDiffTokens"),
    enableUnofficialProviders: c.get("enableUnofficialProviders"),
    customPromptPath: c.get("customPromptPath", ""),
    ollamaBaseUrl: c.get("ollamaBaseUrl"),
    showEmoji: c.get("showEmoji"),
    showBody: c.get("showBody"),
  });
}

function settingsFromConfig(config: ExtensionConfig): DisplaySettings {
  return {
    providerId: config.provider,
    language: config.language,
    detailLevel: config.detailLevel,
    bestPractices: config.bestPractices,
    suggestionCount: config.suggestionCount,
    showEmoji: config.showEmoji,
    showBody: config.showBody,
  };
}

function getWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return undefined;
  return folders[0].uri.fsPath;
}

async function updateGlobal<T>(key: string, value: T): Promise<void> {
  await vscode.workspace
    .getConfiguration("gitCommitSuggestion")
    .update(key, value, vscode.ConfigurationTarget.Global);
}

// Shared between the webview view and the command-palette entry. The webview
// updates its UI via the provider; the command palette falls back to a
// QuickPick when the view isn't open.
async function runSuggest(
  extensionRoot: string,
  secrets: vscode.SecretStorage,
  view: CommitSuggestionViewProvider,
  suggestionsRef: { current: Suggestion[] },
  source: "webview" | "command",
): Promise<void> {
  const cwd = getWorkspaceRoot();
  if (!cwd) {
    vscode.window.showErrorMessage("Open a folder first.");
    return;
  }
  const config = readConfig();
  const settings = settingsFromConfig(config);

  if (config.provider === "g4f" && !config.enableUnofficialProviders) {
    const choice = await vscode.window.showWarningMessage(
      t("unofficialWarning"),
      { modal: true },
      t("enableUnofficial"),
      t("cancel"),
    );
    if (choice !== t("enableUnofficial")) return;
    await updateGlobal("enableUnofficialProviders", true);
  }

  const hasUserKey = Boolean(await secrets.get(SECRET_KEY(config.provider)));
  view.setLoading(settings, hasUserKey);

  try {
    const result = await suggestCommits({
      extensionRoot,
      cwd,
      config,
      getApiKey: (p) => secrets.get(SECRET_KEY(p)),
      log,
    });
    suggestionsRef.current = result.suggestions;
    view.setSuggestions(result.suggestions, result.providerUsed, settings, hasUserKey);
    log(`Got ${result.suggestions.length} suggestions from ${result.providerUsed}`);

    if (source === "command") {
      const picked = await pickSuggestion(
        result.suggestions,
        config.language,
        t("pickSuggestion"),
        config.showEmoji,
        config.showBody,
      );
      if (!picked) return;
      await applySuggestion(cwd, picked.suggestion, picked.finalMessage);
    }
  } catch (err) {
    const msg = (err as Error).message;
    log(`ERROR: ${msg}`);
    view.setError(msg, settings, hasUserKey);
    vscode.window.showErrorMessage(`Git Commit Suggestion: ${msg}`);
  }
}

// Push the latest settings + hasUserKey to the view without wiping any
// suggestions that may already be on screen. Called after every toggle so
// e.g. flipping "show emoji" re-styles the cards instead of clearing them.
async function refreshIdleState(
  secrets: vscode.SecretStorage,
  view: CommitSuggestionViewProvider,
): Promise<void> {
  const config = readConfig();
  const hasUserKey = Boolean(await secrets.get(SECRET_KEY(config.provider)));
  view.refreshSettings(settingsFromConfig(config), hasUserKey);
}

async function applySuggestion(
  cwd: string,
  _suggestion: Suggestion,
  finalMessage: string,
): Promise<void> {
  const ok = await writeToScmInput(cwd, finalMessage);
  if (ok) vscode.window.showInformationMessage(t("written"));
  else {
    await vscode.env.clipboard.writeText(finalMessage);
    vscode.window.showWarningMessage("SCM input not found; copied to clipboard.");
  }
}

async function pickProviderId(): Promise<ProviderId | undefined> {
  const picked = await vscode.window.showQuickPick(
    ["mistral", "openai", "anthropic", "groq", "ollama", "huggingface", "g4f"],
    { placeHolder: t("pickProvider") },
  );
  if (!picked) return undefined;
  return ProviderIdSchema.parse(picked);
}

async function commandSetApiKey(secrets: vscode.SecretStorage): Promise<void> {
  const provider = await pickProviderId();
  if (!provider) return;
  const key = await vscode.window.showInputBox({
    prompt: t("enterApiKey", provider),
    password: true,
    ignoreFocusOut: true,
  });
  if (!key) return;
  await secrets.store(SECRET_KEY(provider), key);
  vscode.window.showInformationMessage(t("keySaved", provider));
}

async function commandClearApiKey(secrets: vscode.SecretStorage): Promise<void> {
  const provider = await pickProviderId();
  if (!provider) return;
  await secrets.delete(SECRET_KEY(provider));
  vscode.window.showInformationMessage(t("keyCleared", provider));
}

export function activate(context: vscode.ExtensionContext): void {
  log(`Activated at ${context.extensionPath}`);

  const suggestionsRef: { current: Suggestion[] } = { current: [] };
  const viewRef: { current?: CommitSuggestionViewProvider } = {};

  const refresh = async (): Promise<void> => {
    if (viewRef.current) await refreshIdleState(context.secrets, viewRef.current);
  };

  const view = new CommitSuggestionViewProvider(
    context.extensionUri,
    {
      onSuggest: () =>
        runSuggest(context.extensionPath, context.secrets, viewRef.current!, suggestionsRef, "webview"),
      onUse: async (_suggestion, finalMessage) => {
        const cwd = getWorkspaceRoot();
        if (!cwd) return;
        await applySuggestion(cwd, _suggestion, finalMessage);
      },
      onPasteKey: async () => {
        const config = readConfig();
        const key = await vscode.window.showInputBox({
          prompt: t("enterApiKey", config.provider),
          password: true,
          ignoreFocusOut: true,
        });
        if (!key) return;
        await context.secrets.store(SECRET_KEY(config.provider), key);
        vscode.window.showInformationMessage(t("keySaved", config.provider));
        await refresh();
      },
      onOpenMistralConsole: async () => {
        await vscode.env.openExternal(vscode.Uri.parse("https://console.mistral.ai/api-keys"));
      },
      onSetProvider: async (providerId) => {
        await updateGlobal("provider", providerId);
        await refresh();
      },
      onSetLanguage: async (language: Language) => {
        await updateGlobal("language", language);
        await refresh();
      },
      onSetDetailLevel: async (detailLevel: DetailLevel) => {
        await updateGlobal("detailLevel", detailLevel);
        await refresh();
      },
      onSetBestPractice: async (id: BestPracticeId, value: boolean) => {
        const current = readConfig().bestPractices;
        const next = value
          ? Array.from(new Set([...current, id]))
          : current.filter((x) => x !== id);
        await updateGlobal("bestPractices", next);
        await refresh();
      },
      onSetSuggestionCount: async (count) => {
        await updateGlobal("suggestionCount", count);
        await refresh();
      },
      onSetShowEmoji: async (value) => {
        await updateGlobal("showEmoji", value);
        await refresh();
      },
      onSetShowBody: async (value) => {
        await updateGlobal("showBody", value);
        await refresh();
      },
      onReady: refresh,
    },
    suggestionsRef,
  );
  viewRef.current = view;

  context.subscriptions.push(createStatusBarItem());
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(CommitSuggestionViewProvider.viewId, view),
    vscode.commands.registerCommand("gitCommitSuggestion.suggest", () =>
      runSuggest(context.extensionPath, context.secrets, view, suggestionsRef, "command"),
    ),
    vscode.commands.registerCommand("gitCommitSuggestion.setApiKey", () =>
      commandSetApiKey(context.secrets),
    ),
    vscode.commands.registerCommand("gitCommitSuggestion.clearApiKey", () =>
      commandClearApiKey(context.secrets),
    ),
  );
}

export function deactivate(): void {}

export { formatCommitMessage };
