import { GenerateArgs, Provider, ProviderError, ProviderResponse } from "./base";

// DuckDuckGo AI Chat (duckduckgo.com/aichat) is officially advertised as a
// privacy-respecting free chat UI. It uses a public endpoint that requires a
// `x-vqd-4` token obtained from /duckduckgo.com/duckchat/v1/status.
//
// Reverse-engineered protocol (matches their browser client):
//   1. GET /duckchat/v1/status   with header `x-vqd-accept: 1`
//        → response header `x-vqd-4: <token>`
//   2. POST /duckchat/v1/chat    with header `x-vqd-4: <token>`
//        body: { model, messages: [{ role, content }] }
//        response: SSE / NDJSON stream of `data: {"message": "..."}`
//
// The vqd token rotates per session. If we get a 418 ("I'm a teapot") it
// usually means the token expired — refresh and retry once.

const MODELS: Record<string, string> = {
  "gpt-4o-mini": "gpt-4o-mini",
  "claude-haiku": "claude-3-haiku-20240307",
  "llama-3.3-70b": "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  "mistral-small": "mistralai/Mistral-Small-24B-Instruct-2501",
  "o3-mini": "o3-mini",
};

async function fetchVqd(): Promise<string> {
  const resp = await fetch("https://duckduckgo.com/duckchat/v1/status", {
    method: "GET",
    headers: {
      "x-vqd-accept": "1",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
    },
  });
  if (!resp.ok) {
    throw new Error(`vqd handshake failed: HTTP ${resp.status}`);
  }
  const vqd = resp.headers.get("x-vqd-4");
  if (!vqd) throw new Error("vqd handshake failed: no x-vqd-4 header");
  return vqd;
}

async function postChat(vqd: string, model: string, system: string, user: string): Promise<string> {
  const resp = await fetch("https://duckduckgo.com/duckchat/v1/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-vqd-4": vqd,
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "user", content: `${system}\n\n${user}` },
      ],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${t.slice(0, 200)}`);
  }
  // Stream is SSE-style: `data: {"message":"chunk"}\ndata: {"message":""}` ...
  // Concatenate all `message` fields. Final terminator is `data: [DONE]`.
  const text = await resp.text();
  const out: string[] = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const obj = JSON.parse(payload) as { message?: string };
      if (obj.message) out.push(obj.message);
    } catch {
      // Skip malformed chunks; DDG occasionally emits them.
    }
  }
  return out.join("");
}

export class DuckDuckGoProvider extends Provider {
  override async generate(args: GenerateArgs): Promise<ProviderResponse> {
    const requested = args.model || "gpt-4o-mini";
    const modelId = MODELS[requested] ?? requested;
    let vqd: string;
    try {
      vqd = await fetchVqd();
    } catch (err) {
      throw new ProviderError(this.id, `vqd handshake failed: ${(err as Error).message}`);
    }
    try {
      const text = await postChat(vqd, modelId, args.systemPrompt, args.userPrompt);
      if (!text.trim()) throw new Error("Empty response");
      return { rawText: text };
    } catch (err) {
      throw new ProviderError(this.id, (err as Error).message);
    }
  }
}
