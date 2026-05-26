import * as vscode from "vscode";

interface GitRepositoryState {
  HEAD?: { commit?: string };
  onDidChange: vscode.Event<void>;
}

interface GitRepository {
  rootUri: vscode.Uri;
  inputBox: { value: string };
  state: GitRepositoryState;
}

interface GitApi {
  repositories: GitRepository[];
  getRepository?(uri: vscode.Uri): GitRepository | null;
  onDidOpenRepository: vscode.Event<GitRepository>;
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

// Fires `onCommit` whenever any open repository's HEAD commit SHA changes —
// new commits, amends, resets, checkouts all qualify. The Git extension's
// `state.onDidChange` event fires for many reasons (index/worktree/refs);
// comparing the prior HEAD commit SHA filters out the noise. We attach to
// every repo open at activation time and to any that open later via
// `onDidOpenRepository`. The returned disposable tears down every listener.
export async function watchCommits(onCommit: () => void): Promise<vscode.Disposable> {
  const ext = vscode.extensions.getExtension<GitExtension>("vscode.git");
  if (!ext) return new vscode.Disposable(() => undefined);
  const api = (await ext.activate()).getAPI(1);
  const subs: vscode.Disposable[] = [];
  const attached = new WeakSet<GitRepository>();

  const attach = (repo: GitRepository): void => {
    if (attached.has(repo)) return;
    attached.add(repo);
    let lastHead = repo.state.HEAD?.commit;
    subs.push(
      repo.state.onDidChange(() => {
        const head = repo.state.HEAD?.commit;
        if (head !== lastHead) {
          lastHead = head;
          if (head) onCommit();
        }
      }),
    );
  };

  api.repositories.forEach(attach);
  subs.push(api.onDidOpenRepository(attach));
  return vscode.Disposable.from(...subs);
}
