import * as assert from "assert";
import { ProviderEntry } from "../../src/models/config";
import { OpenAICompatibleProvider } from "../../src/providers/openai-compatible";

const entry: ProviderEntry = {
  label: "Test provider",
  free_tier: true,
  byok: true,
  base_url: "https://example.test/v1",
  endpoint: "/chat/completions",
  default_model: "test-model",
  auth: "bearer",
};

describe("OpenAICompatibleProvider", () => {
  it("retries a rate-limited request before returning a successful response", async function () {
    this.timeout(5_000);
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) return new Response("rate limited", { status: 429 });
      return new Response(JSON.stringify({
        choices: [{ message: { content: "[]" } }],
      }), { status: 200 });
    }) as typeof fetch;

    try {
      const provider = new OpenAICompatibleProvider("mistral", entry);
      const result = await provider.generate({
        systemPrompt: "system",
        userPrompt: "user",
        apiKey: "key",
        model: "test-model",
      });
      assert.strictEqual(result.rawText, "[]");
      assert.strictEqual(calls, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
