import { GenerateArgs, Provider, ProviderError, ProviderResponse, summarizeErrorBody } from "./base";

// Ollama runs locally. `args.model` is whatever the user picked (default comes
// from providers.yml, but every install has a different model set). When the
// requested model isn't installed Ollama returns 404 with a body like
// `{"error":"model 'llama3.1:8b' not found"}` — surface that as a clear
// "install this first" message and list what IS available via /api/tags.
export class OllamaProvider extends Provider {
  constructor(id: any, entry: any, private readonly baseUrlOverride: string) {
    super(id, entry);
  }

  private async listInstalledModels(baseUrl: string): Promise<string[] | null> {
    try {
      const resp = await fetch(`${baseUrl}/api/tags`, { method: "GET" });
      if (!resp.ok) return null;
      const json = (await resp.json()) as { models?: { name: string }[] };
      return (json.models ?? []).map((m) => m.name);
    } catch {
      return null;
    }
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
        signal: args.signal,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      throw new ProviderError(
        this.id,
        `Network error: ${(err as Error).message}. Is the local service running at ${baseUrl}?`,
      );
    }

    if (!resp.ok) {
      const text = await resp.text();
      // 404 = model not installed locally. Inspect /api/tags and tell the
      // user which models they have, plus the one-liner to install the
      // requested model.
      if (resp.status === 404 && text.includes("not found")) {
        const installed = await this.listInstalledModels(baseUrl);
        const have =
          installed && installed.length > 0
            ? `Installed locally: ${installed.join(", ")}. Pick one in the model setting.`
            : `No local models installed.`;
        throw new ProviderError(
          this.id,
          `Model "${args.model}" is not installed locally. ${have}`,
          resp.status,
        );
      }
      throw new ProviderError(this.id, `HTTP ${resp.status}: ${summarizeErrorBody(text)}`, resp.status);
    }

    const json = (await resp.json()) as { message?: { content?: string } };
    const content = json.message?.content;
    if (!content) {
      throw new ProviderError(this.id, `Empty response: ${JSON.stringify(json).slice(0, 200)}`);
    }
    return { rawText: content };
  }
}
