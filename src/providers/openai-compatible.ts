import { GenerateArgs, Provider, ProviderError, ProviderResponse, summarizeErrorBody } from "./base";

// OpenAI-style /chat/completions schema. Mistral, OpenAI, Groq, and g4f all
// speak this. Anthropic and Ollama do not — they have their own classes.
export class OpenAICompatibleProvider extends Provider {
  override async generate(args: GenerateArgs): Promise<ProviderResponse> {
    const baseUrl = this.entry.base_url.replace(/\/$/, "");
    const url = `${baseUrl}${this.entry.endpoint}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.entry.auth === "bearer") {
      if (!args.apiKey) {
        throw new ProviderError(
          this.id,
          `Missing API key. Run "Git Commit Suggestion: Set API Key for Provider".`,
        );
      }
      headers["Authorization"] = `Bearer ${args.apiKey}`;
    }

    const body = {
      model: args.model,
      messages: [
        { role: "system", content: args.systemPrompt },
        { role: "user", content: args.userPrompt },
      ],
      temperature: 0.4,
      response_format: { type: "json_object" },
    };

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers,
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
