import * as vscode from "vscode";
import { ExtensionConfig, ExtensionConfigSchema, ProviderId, ProviderIdSchema } from "./models/config";
import { suggestCommits } from "./pipeline/orchestrator";
import { pickSuggestion } from "./ui/quick-pick";
import { writeToScmInput } from "./ui/scm-writer";
import { createStatusBarItem } from "./ui/status-bar";
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

async function commandSuggest(extensionRoot: string, secrets: vscode.SecretStorage): Promise<void> {
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

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: t("suggesting"), cancellable: false },
    async () => {
      try {
        const result = await suggestCommits({
          extensionRoot,
          cwd,
          config,
          getApiKey: (p) => secrets.get(SECRET_KEY(p)),
          log,
        });
        log(`Got ${result.suggestions.length} suggestions from ${result.providerUsed}`);
        const picked = await pickSuggestion(result.suggestions, config.language, t("pickSuggestion"));
        if (!picked) return;
        const ok = await writeToScmInput(cwd, picked.finalMessage);
        if (ok) vscode.window.showInformationMessage(t("written"));
        else {
          await vscode.env.clipboard.writeText(picked.finalMessage);
          vscode.window.showWarningMessage("SCM input not found; copied to clipboard.");
        }
      } catch (err) {
        const msg = (err as Error).message;
        log(`ERROR: ${msg}`);
        vscode.window.showErrorMessage(`Git Commit Suggestion: ${msg}`);
      }
    },
  );
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
  context.subscriptions.push(createStatusBarItem());
  context.subscriptions.push(
    vscode.commands.registerCommand("gitCommitSuggestion.suggest", () =>
      commandSuggest(context.extensionPath, context.secrets),
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
