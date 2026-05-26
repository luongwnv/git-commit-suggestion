import * as assert from "assert";
import { formatCommitMessage, Suggestion } from "../../src/models/suggestion";

const sample: Suggestion = {
  type: "feat",
  scope: "auth",
  subject_en: "add login endpoint",
  subject_vi: "thêm endpoint đăng nhập",
  body_en: "Wires up POST /login with bcrypt hashing.",
  body_vi: "Thêm route POST /login dùng bcrypt.",
};

describe("formatCommitMessage", () => {
  it("renders English-only", () => {
    const msg = formatCommitMessage(sample, "en");
    assert.ok(msg.startsWith("feat(auth): add login endpoint"));
    assert.ok(msg.includes("Wires up"));
    assert.ok(!msg.includes("thêm"));
  });

  it("renders Vietnamese-only", () => {
    const msg = formatCommitMessage(sample, "vi");
    assert.ok(msg.startsWith("feat(auth): thêm endpoint đăng nhập"));
    assert.ok(msg.includes("bcrypt"));
    assert.ok(!msg.includes("Wires up"));
  });

  it("renders bilingual with both languages", () => {
    const msg = formatCommitMessage(sample, "bilingual");
    assert.ok(msg.includes("add login endpoint"));
    assert.ok(msg.includes("VI: thêm endpoint đăng nhập"));
  });

  it("handles empty scope", () => {
    const s = { ...sample, scope: "" };
    const msg = formatCommitMessage(s, "en");
    assert.ok(msg.startsWith("feat: add login endpoint"));
  });
});
