import { GenerateArgs, Provider, ProviderError, ProviderResponse } from "./base";

// HuggingFace router endpoint. As of 2026-05 this endpoint requires an
// Authorization: Bearer token for every request — the anonymous tier was
// removed. We treat the key as required (the catch-all 401 path returns a
// huge HTML page, so we throw a short friendly message instead of leaking it).
//
// Schema is OpenAI-compatible:
//   POST https://router.huggingface.co/v1/chat/completions
//
// Get a free HF token at https://huggingface.co/settings/tokens (Read scope
// is enough). Default model: Qwen 2.5 7B Instruct.
export class HuggingFaceProvider extends Provider {
  override async generate(args: GenerateArgs): Promise<ProviderResponse> {
    if (!args.apiKey) {
      throw new ProviderError(
        this.id,
        "Missing API token. Get a free token from your account dashboard and paste it via the settings panel.",
      );
    }

    const url = "https://router.huggingface.co/v1/chat/completions";
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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${args.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new ProviderError(this.id, `Network error: ${(err as Error).message}`);
    }

    if (!resp.ok) {
      const text = await resp.text();
      // 401/403 pages on this endpoint return a large HTML body. Surface a
      // tight, actionable message instead of dumping the markup at the user.
      if (resp.status === 401 || resp.status === 403) {
        throw new ProviderError(
          this.id,
          "Token rejected. Generate a new one (Read scope) and re-paste it.",
          resp.status,
        );
      }
      // JSON error bodies survive truncation; HTML / very long bodies get cut.
      const snippet = text.trim().startsWith("{") ? text.slice(0, 400) : text.slice(0, 120) + "…";
      throw new ProviderError(this.id, `HTTP ${resp.status}: ${snippet}`, resp.status);
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
