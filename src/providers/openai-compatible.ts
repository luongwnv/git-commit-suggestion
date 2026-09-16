import { GenerateArgs, Provider, ProviderError, ProviderResponse, summarizeErrorBody } from "./base";

// OpenAI-style /chat/completions schema. Mistral, OpenAI, Groq, and g4f all
// speak this. Anthropic and Ollama do not — they have their own classes.
const MAX_RATE_LIMIT_RETRIES = 2;

function retryDelayMs(retryAfter: string | null, retryNumber: number): number {
  // Providers may send Retry-After either as seconds or as an HTTP date. If
  // absent (as is common with Mistral), use a small exponential backoff. A
  // minimum of one second avoids immediately repeating the throttled request.
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.max(1_000, Math.ceil(seconds * 1_000));
    }
    const dateMs = Date.parse(retryAfter);
    if (!Number.isNaN(dateMs)) return Math.max(1_000, dateMs - Date.now());
  }

  return 1_000 * 2 ** retryNumber;
}

function abortError(): Error {
  const error = new Error("Request aborted");
  error.name = "AbortError";
  return error;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

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

    let resp: Response | undefined;
    for (let retry = 0; retry <= MAX_RATE_LIMIT_RETRIES; retry += 1) {
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

      if (resp.status !== 429 || retry === MAX_RATE_LIMIT_RETRIES) break;
      await wait(retryDelayMs(resp.headers.get("retry-after"), retry), args.signal);
    }

    // The loop always assigns this before exiting, but keeping the guard
    // makes the invariant explicit for TypeScript and future maintenance.
    if (!resp) throw new ProviderError(this.id, "No response received.");

    if (!resp.ok) {
      const text = await resp.text();
      if (resp.status === 429) {
        throw new ProviderError(
          this.id,
          `Rate limit exceeded after ${MAX_RATE_LIMIT_RETRIES} automatic retries. `
            + "Wait a minute, then try again or check this API key's quota/billing. "
            + `Details: ${summarizeErrorBody(text).slice(0, 300)}`,
          resp.status,
        );
      }
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
