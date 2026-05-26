import { GenerateArgs, Provider, ProviderError, ProviderResponse } from "./base";

// Pollinations.ai is a free community-sponsored gateway that speaks the
// OpenAI Chat Completions schema. No key, no signup.
//
// Endpoint quirks vs vanilla OpenAI:
//   - POST https://text.pollinations.ai/openai (NOT /v1/chat/completions)
//   - No `Authorization` header
//   - `response_format: { type: "json_object" }` is honored
//   - Rate limit is roughly 1 req / 3-5s per IP; bursts get throttled silently
//   - As of 2026-05 the anonymous tier exposes one model: `openai-fast`
//     (backed by GPT-OSS-20B). Older ids like `openai-large` now 404 —
//     the deprecation notice points to enter.pollinations.ai for authenticated
//     use. List currently-available models with: GET /models
export class PollinationsProvider extends Provider {
  override async generate(args: GenerateArgs): Promise<ProviderResponse> {
    const url = "https://text.pollinations.ai/openai";
    const body = {
      model: args.model || "openai-fast",
      messages: [
        { role: "system", content: args.systemPrompt },
        { role: "user", content: args.userPrompt },
      ],
      temperature: 0.4,
      response_format: { type: "json_object" },
      seed: Math.floor(Math.random() * 1e9),
    };

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new ProviderError(this.id, `Network error: ${(err as Error).message}`);
    }

    if (!resp.ok) {
      const text = await resp.text();
      throw new ProviderError(this.id, `HTTP ${resp.status}: ${text.slice(0, 400)}`, resp.status);
    }

    // Pollinations sometimes returns plain text, sometimes the full OpenAI
    // schema. Handle both.
    const contentType = resp.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const json = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        throw new ProviderError(this.id, `Empty response: ${JSON.stringify(json).slice(0, 200)}`);
      }
      return { rawText: content };
    }
    const text = await resp.text();
    if (!text.trim()) throw new ProviderError(this.id, "Empty response body");
    return { rawText: text };
  }
}
