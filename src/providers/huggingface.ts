import { GenerateArgs, Provider, ProviderError, ProviderResponse } from "./base";

// HuggingFace public Inference API. Free, no key required for many models,
// rate-limited per IP. The key (if present) bumps the rate limit and unlocks
// gated models — but we treat it as optional.
//
// Schema is OpenAI-compatible at the router endpoint:
//   POST https://router.huggingface.co/v1/chat/completions
//
// Default model: Qwen 2.5 7B Instruct. Small, fast, free, decent at JSON.
// User can override via gitCommitSuggestion.model.
export class HuggingFaceProvider extends Provider {
  override async generate(args: GenerateArgs): Promise<ProviderResponse> {
    const url = "https://router.huggingface.co/v1/chat/completions";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (args.apiKey) headers["Authorization"] = `Bearer ${args.apiKey}`;

    const body = {
      model: args.model || "Qwen/Qwen2.5-7B-Instruct",
      messages: [
        { role: "system", content: args.systemPrompt },
        { role: "user", content: args.userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 1500,
    };

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new ProviderError(this.id, `Network error: ${(err as Error).message}`);
    }

    if (!resp.ok) {
      const text = await resp.text();
      throw new ProviderError(this.id, `HTTP ${resp.status}: ${text.slice(0, 400)}`, resp.status);
    }

    const json = (await resp.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new ProviderError(this.id, `Empty response: ${JSON.stringify(json).slice(0, 200)}`);
    }
    return { rawText: content };
  }
}
