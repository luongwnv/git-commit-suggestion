import { GenerateArgs, Provider, ProviderError, ProviderResponse } from "./base";

export class OllamaProvider extends Provider {
  constructor(id: any, entry: any, private readonly baseUrlOverride: string) {
    super(id, entry);
  }

  override async generate(args: GenerateArgs): Promise<ProviderResponse> {
    const baseUrl = (this.baseUrlOverride || this.entry.base_url).replace(/\/$/, "");
    const url = `${baseUrl}${this.entry.endpoint}`;

    const body = {
      model: args.model,
      stream: false,
      format: "json",
      messages: [
        { role: "system", content: args.systemPrompt },
        { role: "user", content: args.userPrompt },
      ],
      options: { temperature: 0.4 },
    };

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new ProviderError(
        this.id,
        `Network error: ${(err as Error).message}. Is Ollama running at ${baseUrl}?`,
      );
    }

    if (!resp.ok) {
      const text = await resp.text();
      throw new ProviderError(this.id, `HTTP ${resp.status}: ${text.slice(0, 400)}`, resp.status);
    }

    const json = (await resp.json()) as { message?: { content?: string } };
    const content = json.message?.content;
    if (!content) {
      throw new ProviderError(this.id, `Empty response: ${JSON.stringify(json).slice(0, 200)}`);
    }
    return { rawText: content };
  }
}
