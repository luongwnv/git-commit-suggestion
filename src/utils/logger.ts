import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

export function getLogger(): vscode.OutputChannel {
  if (!channel) channel = vscode.window.createOutputChannel("Git Commit Suggestion");
  return channel;
}

export function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 23);
  getLogger().appendLine(`[${ts}] ${msg}`);
}
