import * as vscode from "vscode";

export function createStatusBarItem(): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.text = "$(lightbulb) Suggest commit";
  item.tooltip = "Generate a commit message from the staged diff";
  item.command = "gitCommitSuggestion.suggest";
  item.show();
  return item;
}
