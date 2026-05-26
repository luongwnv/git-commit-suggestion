import * as assert from "assert";
import { parseSuggestions } from "../../src/pipeline/parser";

describe("parser.parseSuggestions", () => {
  it("parses a clean JSON array", () => {
    const raw = JSON.stringify([
      {
        type: "feat",
        scope: "auth",
        subject_en: "add login",
        subject_vi: "thêm đăng nhập",
        body_en: "",
        body_vi: "",
      },
    ]);
    const out = parseSuggestions(raw);
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].type, "feat");
    assert.strictEqual(out[0].scope, "auth");
  });

  it("strips ```json fences", () => {
    const raw = "```json\n[{\"type\":\"fix\",\"subject_en\":\"x\",\"subject_vi\":\"y\"}]\n```";
    const out = parseSuggestions(raw);
    assert.strictEqual(out[0].type, "fix");
  });

  it("handles { suggestions: [...] } wrapper", () => {
    const raw = JSON.stringify({
      suggestions: [{ type: "docs", subject_en: "readme", subject_vi: "docs" }],
    });
    const out = parseSuggestions(raw);
    assert.strictEqual(out[0].type, "docs");
  });

  it("normalizes scope (lowercases, hyphenates)", () => {
    const raw = JSON.stringify([
      { type: "feat", scope: "User Auth", subject_en: "x", subject_vi: "y" },
    ]);
    const out = parseSuggestions(raw);
    assert.strictEqual(out[0].scope, "user-auth");
  });

  it("falls back to chore for invalid types", () => {
    const raw = JSON.stringify([
      { type: "feature", subject_en: "x", subject_vi: "y" },
    ]);
    const out = parseSuggestions(raw);
    assert.strictEqual(out[0].type, "chore");
  });

  it("throws on non-JSON garbage", () => {
    assert.throws(() => parseSuggestions("totally not json"));
  });
});
