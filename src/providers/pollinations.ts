import { GenerateArgs, Provider, ProviderError, ProviderResponse, summarizeErrorBody } from "./base";

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
    const body: Record<string, unknown> = {
      model: args.model || "openai-fast",
      messages: [
        { role: "system", content: args.systemPrompt },
        { role: "user", content: args.userPrompt },
      ],
      temperature: 0.4,
      // We intentionally omit `response_format: json_object`. With it,
      // gpt-oss-20b (the only anonymous-tier model) tends to collapse the
      // requested array of suggestions into one bare object, breaking the
      // parser. Without the constraint the model emits a clean array; if it
      // occasionally returns a single object the parser wraps it for us.
      // Reasoning models eat ~2-3k tokens of internal thought before any
      // visible output, then need ~1k more for the JSON array of suggestions.
      // 8000 leaves headroom even when the user asks for 8 detailed
      // bilingual suggestions.
      max_tokens: 8000,
      // gpt-oss-20b is a reasoning model — at default effort it burns most
      // of its token budget on internal reasoning and emits an empty
      // `content` field. Force minimum effort so tokens go to output.
      reasoning_effort: "low",
      seed: Math.floor(Math.random() * 1e9),
    };

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: args.signal,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      throw new ProviderError(this.id, `Network error: ${(err as Error).message}`);
    }

    if (!resp.ok) {
      const text = await resp.text();
      throw new ProviderError(this.id, `HTTP ${resp.status}: ${summarizeErrorBody(text)}`, resp.status);
    }

    // Pollinations sometimes returns plain text, sometimes the full OpenAI
    // schema. Handle both. gpt-oss-20b additionally has a `reasoning` field
    // in `message` — when reasoning_effort overshoots and content comes
    // back empty, the JSON we want is sometimes embedded inside reasoning
    // instead. Mine it as a fallback before failing.
    const contentType = resp.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const json = (await resp.json()) as {
        choices?: { message?: { content?: string; reasoning?: string } }[];
      };
      const msg = json.choices?.[0]?.message;
      const content = msg?.content;
      if (content && content.trim()) return { rawText: content };

      // Fallback: extract JSON array or object from the reasoning trace.
      const reasoning = msg?.reasoning ?? "";
      const arrayMatch = reasoning.match(/\[[\s\S]*\]/);
      if (arrayMatch) return { rawText: arrayMatch[0] };
      const objectMatch = reasoning.match(/\{[\s\S]*\}/);
      if (objectMatch) return { rawText: objectMatch[0] };

      throw new ProviderError(
        this.id,
        `Empty content and no JSON in reasoning. Response: ${JSON.stringify(json).slice(0, 300)}`,
      );
    }
    const text = await resp.text();
    if (!text.trim()) throw new ProviderError(this.id, "Empty response body");
    return { rawText: text };
  }
}
