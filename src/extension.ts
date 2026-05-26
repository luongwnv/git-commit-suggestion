import * as vscode from "vscode";
import { ExtensionConfig, ExtensionConfigSchema, ProviderId, ProviderIdSchema } from "./models/config";
import { Suggestion, formatCommitMessage } from "./models/suggestion";
import { suggestCommits } from "./pipeline/orchestrator";
import { pickSuggestion } from "./ui/quick-pick";
import { writeToScmInput } from "./ui/scm-writer";
import { createStatusBarItem } from "./ui/status-bar";
import { CommitSuggestionViewProvider } from "./ui/webview-view";
import { t } from "./utils/i18n";
import { log } from "./utils/logger";

const SECRET_KEY = (provider: string) => `gitCommitSuggestion.apiKey.${provider}`;

function readConfig(): ExtensionConfig {
  const c = vscode.workspace.getConfiguration("gitCommitSuggestion");
  return ExtensionConfigSchema.parse({
    provider: c.get("provider"),
    model: c.get("model", ""),
    language: c.get("language"),
    suggestionCount: c.get("suggestionCount"),
    maxDiffTokens: c.get("maxDiffTokens"),
    enableUnofficialProviders: c.get("enableUnofficialProviders"),
    customPromptPath: c.get("customPromptPath", ""),
    ollamaBaseUrl: c.get("ollamaBaseUrl"),
  });
}

function getWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return undefined;
  return folders[0].uri.fsPath;
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

  if (config.provider === "g4f" && !config.enableUnofficialProviders) {
    const choice = await vscode.window.showWarningMessage(
      t("unofficialWarning"),
      { modal: true },
      t("enableUnofficial"),
      t("cancel"),
    );
    if (choice !== t("enableUnofficial")) return;
    await vscode.workspace
      .getConfiguration("gitCommitSuggestion")
      .update("enableUnofficialProviders", true, vscode.ConfigurationTarget.Global);
  }

  const hasUserKey = Boolean(await secrets.get(SECRET_KEY(config.provider)));
  view.setLoading(config.provider, config.language, hasUserKey);

  try {
    const result = await suggestCommits({
      extensionRoot,
      cwd,
      config,
      getApiKey: (p) => secrets.get(SECRET_KEY(p)),
      log,
    });
    suggestionsRef.current = result.suggestions;
    view.setSuggestions(result.suggestions, result.providerUsed, config.language, config.provider, hasUserKey);
    log(`Got ${result.suggestions.length} suggestions from ${result.providerUsed}`);

    // When invoked via command palette (no visible view), still surface a
    // QuickPick so the user can act without opening the sidebar.
    if (source === "command") {
      const picked = await pickSuggestion(result.suggestions, config.language, t("pickSuggestion"));
      if (!picked) return;
      await applySuggestion(cwd, picked.suggestion, picked.finalMessage);
    }
  } catch (err) {
    const msg = (err as Error).message;
    log(`ERROR: ${msg}`);
    view.setError(msg, config.language, config.provider, hasUserKey);
    vscode.window.showErrorMessage(`Git Commit Suggestion: ${msg}`);
  }
}

async function refreshIdleState(
  secrets: vscode.SecretStorage,
  view: CommitSuggestionViewProvider,
): Promise<void> {
  const config = readConfig();
  const hasUserKey = Boolean(await secrets.get(SECRET_KEY(config.provider)));
  view.setIdle(config.provider, config.language, hasUserKey);
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
    ["mistral", "openai", "anthropic", "groq", "ollama", "g4f"],
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
  const onSuggest = (): Promise<void> =>
    runSuggest(context.extensionPath, context.secrets, viewRef.current!, suggestionsRef, "webview");
  const onUse = async (suggestion: Suggestion, finalMessage: string): Promise<void> => {
    const cwd = getWorkspaceRoot();
    if (!cwd) return;
    await applySuggestion(cwd, suggestion, finalMessage);
  };
  const onPasteKey = async (): Promise<void> => {
    const config = readConfig();
    const key = await vscode.window.showInputBox({
      prompt: t("enterApiKey", config.provider),
      password: true,
      ignoreFocusOut: true,
    });
    if (!key) return;
    await context.secrets.store(SECRET_KEY(config.provider), key);
    vscode.window.showInformationMessage(t("keySaved", config.provider));
    if (viewRef.current) await refreshIdleState(context.secrets, viewRef.current);
  };
  const onOpenMistralConsole = async (): Promise<void> => {
    await vscode.env.openExternal(vscode.Uri.parse("https://console.mistral.ai/api-keys"));
  };
  const onSetProvider = async (providerId: string): Promise<void> => {
    await vscode.workspace
      .getConfiguration("gitCommitSuggestion")
      .update("provider", providerId, vscode.ConfigurationTarget.Global);
    if (viewRef.current) await refreshIdleState(context.secrets, viewRef.current);
  };
  const onReady = async (): Promise<void> => {
    if (viewRef.current) await refreshIdleState(context.secrets, viewRef.current);
  };
  const view = new CommitSuggestionViewProvider(
    context.extensionUri,
    onSuggest,
    onUse,
    onPasteKey,
    onOpenMistralConsole,
    onSetProvider,
    onReady,
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

// Used by tests of formatCommitMessage indirectly via models/suggestion.
export { formatCommitMessage };
