import * as vscode from "vscode";

interface GitRepository {
  rootUri: vscode.Uri;
  inputBox: { value: string };
}

interface GitApi {
  repositories: GitRepository[];
  getRepository?(uri: vscode.Uri): GitRepository | null;
}

interface GitExtension {
  getAPI(version: 1): GitApi;
}

export async function writeToScmInput(cwd: string, message: string): Promise<boolean> {
  const ext = vscode.extensions.getExtension<GitExtension>("vscode.git");
  if (!ext) return false;
  const api = (await ext.activate()).getAPI(1);
  const repo =
    api.getRepository?.(vscode.Uri.file(cwd)) ??
    api.repositories.find((r) => r.rootUri.fsPath === cwd) ??
    api.repositories[0];
  if (!repo) return false;
  repo.inputBox.value = message;
  return true;
}
