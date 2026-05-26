import { GenerateArgs, Provider, ProviderError, ProviderResponse } from "./base";

export class AnthropicProvider extends Provider {
  override async generate(args: GenerateArgs): Promise<ProviderResponse> {
    if (!args.apiKey) {
      throw new ProviderError(
        this.id,
        `Missing API key. Run "Git Commit Suggestion: Set API Key for Provider".`,
      );
    }
    const baseUrl = this.entry.base_url.replace(/\/$/, "");
    const url = `${baseUrl}${this.entry.endpoint}`;

    const body = {
      model: args.model,
      max_tokens: 1500,
      system: args.systemPrompt,
      messages: [{ role: "user", content: args.userPrompt }],
    };

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": args.apiKey,
          "anthropic-version": this.entry.api_version ?? "2023-06-01",
        },
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
      content?: { type: string; text?: string }[];
    };
    const text = json.content
      ?.filter((c) => c.type === "text" && c.text)
      .map((c) => c.text!)
      .join("");
    if (!text) {
      throw new ProviderError(this.id, `Empty response: ${JSON.stringify(json).slice(0, 200)}`);
    }
    return { rawText: text };
  }
}
