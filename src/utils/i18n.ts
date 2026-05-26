// Static UI strings for the extension itself (NOT the LLM output).
// Picked based on VSCode language; defaults to English.
import * as vscode from "vscode";

type Lang = "en" | "vi";

const STRINGS = {
  en: {
    noStagedChanges: "No staged changes. Stage some files first (git add).",
    pickSuggestion: "Pick a commit message",
    suggesting: "Generating commit suggestions…",
    written: "Commit message written to Source Control input.",
    enterApiKey: "Enter API key for {0}",
    keySaved: "API key saved for {0}.",
    keyCleared: "API key cleared for {0}.",
    pickProvider: "Which provider's API key?",
    unofficialWarning:
      "g4f is an unofficial reverse-proxy provider. It violates upstream ToS, has no SLA, and may stop working without notice. Use only for non-production experimentation.",
    enableUnofficial: "Enable anyway",
    cancel: "Cancel",
  },
  vi: {
    noStagedChanges: "Chưa có file nào được stage. Hãy git add trước.",
    pickSuggestion: "Chọn commit message",
    suggesting: "Đang sinh gợi ý commit…",
    written: "Đã ghi commit message vào ô Source Control.",
    enterApiKey: "Nhập API key cho {0}",
    keySaved: "Đã lưu API key cho {0}.",
    keyCleared: "Đã xoá API key cho {0}.",
    pickProvider: "Chọn provider để cấu hình API key",
    unofficialWarning:
      "g4f là provider reverse-proxy không chính thức. Vi phạm ToS upstream, không có SLA, có thể ngưng hoạt động bất cứ lúc nào. Chỉ dùng để thử nghiệm.",
    enableUnofficial: "Vẫn bật",
    cancel: "Huỷ",
  },
} as const;

function detectLang(): Lang {
  const env = vscode.env.language.toLowerCase();
  return env.startsWith("vi") ? "vi" : "en";
}

export function t(key: keyof typeof STRINGS.en, ...args: string[]): string {
  const lang = detectLang();
  let s: string = STRINGS[lang][key];
  args.forEach((a, i) => {
    s = s.replace(`{${i}}`, a);
  });
  return s;
}
