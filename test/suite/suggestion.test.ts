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
    const msg = formatCommitMessage(sample, {
      language: "en",
      showEmoji: false,
      showBody: true,
      showScope: true,
    });
    assert.ok(msg.startsWith("feat(auth): add login endpoint"), msg);
    assert.ok(msg.includes("Wires up"));
    assert.ok(!msg.includes("thêm"));
  });

  it("renders Vietnamese-only", () => {
    const msg = formatCommitMessage(sample, {
      language: "vi",
      showEmoji: false,
      showBody: true,
      showScope: true,
    });
    assert.ok(msg.startsWith("feat(auth): thêm endpoint đăng nhập"), msg);
    assert.ok(msg.includes("bcrypt"));
    assert.ok(!msg.includes("Wires up"));
  });

  it("handles empty scope", () => {
    const s = { ...sample, scope: "" };
    const msg = formatCommitMessage(s, {
      language: "en",
      showEmoji: false,
      showBody: true,
      showScope: true,
    });
    assert.ok(msg.startsWith("feat: add login endpoint"));
  });

  it("prepends emoji when showEmoji=true", () => {
    const msg = formatCommitMessage(sample, {
      language: "en",
      showEmoji: true,
      showBody: false,
      showScope: true,
    });
    assert.ok(msg.startsWith("✨ feat(auth)"), msg);
  });

  it("omits body when showBody=false", () => {
    const msg = formatCommitMessage(sample, {
      language: "en",
      showEmoji: false,
      showBody: false,
      showScope: true,
    });
    assert.ok(!msg.includes("Wires up"));
    assert.strictEqual(msg.split("\n").length, 1);
  });

  it("omits scope when showScope=false", () => {
    const msg = formatCommitMessage(sample, {
      language: "en",
      showEmoji: false,
      showBody: false,
      showScope: false,
    });
    assert.ok(msg.startsWith("feat: add login endpoint"), msg);
    assert.ok(!msg.includes("(auth)"));
  });

  it("uses subject_en for non-English/Vietnamese languages", () => {
    // The prompt puts the requested language into both en and vi fields;
    // formatter prefers subject_en.
    const zh: Suggestion = {
      ...sample,
      subject_en: "添加登录端点",
      subject_vi: "添加登录端点",
      body_en: "",
      body_vi: "",
    };
    const msg = formatCommitMessage(zh, {
      language: "zh",
      showEmoji: false,
      showBody: false,
      showScope: true,
    });
    assert.ok(msg.includes("添加登录端点"));
  });
});
