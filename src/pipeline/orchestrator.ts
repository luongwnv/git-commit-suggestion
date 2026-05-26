import * as fs from "fs";
import * as yaml from "js-yaml";
import { ExtensionConfig, ProvidersConfig, ProvidersConfigSchema } from "../models/config";
import { Suggestion } from "../models/suggestion";
import { buildProvider, ConcreteProviderId, Provider } from "../providers";
import { ProviderError } from "../providers/base";
import { defaultKeyFor } from "../providers/default-keys";
import { collectStagedDiff, renderDiff } from "./diff-collector";
import { buildPrompt, loadCommitTypes, loadPrompts, resolveConfigPath } from "./prompt-builder";
import { parseSuggestions } from "./parser";

export interface OrchestratorDeps {
  extensionRoot: string;
  cwd: string;
  config: ExtensionConfig;
  getApiKey: (providerId: string) => PromiseLike<string | undefined>;
  log: (msg: string) => void;
  // When set, forwarded to provider fetch calls so the Stop button can
  // abort the in-flight LLM request. Auto-mode short-circuits the chain
  // once `signal.aborted` is true rather than walking to the next leg.
  signal?: AbortSignal;
}

export interface OrchestratorResult {
  suggestions: Suggestion[];
  providerUsed: string;
  truncated: boolean;
}

// Order matters: cheapest/most-reliable first. Each is tried in turn until
// one returns parseable suggestions. All legs are zero-config (no API key
// required) — providers that need a key (mistral, openai, anthropic, groq)
// must be selected explicitly by the user after pasting their key.
//
// DuckDuckGo was dropped from auto chain in 2026-05 after they shipped a
// JS-based anti-bot challenge (response header x-vqd-hash-1 instead of
// x-vqd-4). Replicating the challenge would require running JS — not worth
// it for a commit suggestion tool. Still selectable manually as Platypus
// in case it ever opens back up.
//
// HuggingFace router started requiring a Bearer token for /v1/chat/completions
// in 2026-05 as well. Still selectable manually as Polar Bear; the user
// supplies their own free token via the API key flow.
const AUTO_CHAIN: ConcreteProviderId[] = ["pollinations"];

function loadProviders(extensionRoot: string): ProvidersConfig {
  const p = resolveConfigPath(extensionRoot, "providers.yml");
  const raw = fs.readFileSync(p, "utf-8");
  return ProvidersConfigSchema.parse(yaml.load(raw));
}

async function callProvider(
  provider: Provider,
  systemPrompt: string,
  userPrompt: string,
  apiKey: string | undefined,
  modelOverride: string,
  signal: AbortSignal | undefined,
): Promise<Suggestion[]> {
  const resp = await provider.generate({
    systemPrompt,
    userPrompt,
    apiKey,
    model: provider.resolveModel(modelOverride),
    signal,
  });
  return parseSuggestions(resp.rawText);
}

interface AttemptArgs {
  id: ConcreteProviderId;
  providersConfig: ProvidersConfig;
  ollamaBaseUrl: string;
  modelOverride: string;
  systemPrompt: string;
  userPrompt: string;
  getApiKey: OrchestratorDeps["getApiKey"];
  log: OrchestratorDeps["log"];
  signal?: AbortSignal;
}

interface AttemptResult {
  suggestions: Suggestion[];
  label: string;
}

// Hard ceiling on a single provider call. Measured worst-case on a realistic
// ~1.5k-token prompt against Pollinations' gpt-oss-20b reasoning model is
// ~37s end-to-end (reasoning trace + JSON emit). 30s was cutting off
// otherwise-successful calls; 75s gives ~2x headroom while still bounding
// a true endpoint hang (the bug class this whole wrapper exists to kill —
// see lessons.html "Node fetch() has no default timeout").
const PROVIDER_TIMEOUT_MS = 75_000;

// Build a child AbortController that fires when EITHER:
//   - the parent (user Stop) aborts, or
//   - the timeout elapses.
// Returns the child controller, plus a `timedOut` flag the caller can read
// after a thrown AbortError to distinguish "user pressed Stop" from "we
// gave up waiting". Cleanup is in `dispose` — always call it in finally.
function withTimeout(
  parent: AbortSignal | undefined,
  ms: number,
): { signal: AbortSignal; timedOut: () => boolean; dispose: () => void } {
  const ctrl = new AbortController();
  let timedOut = false;
  const onParentAbort = (): void => ctrl.abort();
  if (parent) {
    if (parent.aborted) ctrl.abort();
    else parent.addEventListener("abort", onParentAbort, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, ms);
  return {
    signal: ctrl.signal,
    timedOut: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onParentAbort);
    },
  };
}

async function attempt(args: AttemptArgs): Promise<AttemptResult> {
  const provider = buildProvider(args.id, args.providersConfig, {
    ollamaBaseUrl: args.ollamaBaseUrl,
  });
  const userKey = (await args.getApiKey(args.id)) || undefined;
  const key = userKey ?? defaultKeyFor(args.id);
  const keySource = userKey ? "user key" : key ? "default key" : "no key";
  args.log(
    `Calling provider: ${args.id} (model: ${provider.resolveModel(args.modelOverride)}) using ${keySource}`,
  );
  const t = withTimeout(args.signal, PROVIDER_TIMEOUT_MS);
  try {
    const suggestions = await callProvider(
      provider,
      args.systemPrompt,
      args.userPrompt,
      key,
      args.modelOverride,
      t.signal,
    );
    return { suggestions, label: `${args.id} (${keySource})` };
  } catch (err) {
    // Timeout fires AbortError on the child signal. Convert it to a normal
    // provider failure so the auto chain can move on AND the user sees a
    // useful banner instead of an empty cancel. User-initiated aborts (the
    // parent signal) are still AbortError — orchestrator re-throws those.
    if ((err as Error).name === "AbortError" && t.timedOut()) {
      throw new ProviderError(
        args.id,
        `Timed out after ${Math.round(PROVIDER_TIMEOUT_MS / 1000)}s`,
      );
    }
    throw err;
  } finally {
    t.dispose();
  }
}

export async function suggestCommits(deps: OrchestratorDeps): Promise<OrchestratorResult> {
  const { extensionRoot, cwd, config, getApiKey, log } = deps;

  if (config.provider === "g4f" && !config.enableUnofficialProviders) {
    throw new Error(
      "g4f is unofficial and disabled by default. Enable gitCommitSuggestion.enableUnofficialProviders to use it.",
    );
  }

  const providersConfig = loadProviders(extensionRoot);
  const promptsPath = config.customPromptPath || resolveConfigPath(extensionRoot, "prompts.yml");
  const prompts = loadPrompts(promptsPath);
  const commitTypes = loadCommitTypes(resolveConfigPath(extensionRoot, "commit-types.yml"));

  log(`Collecting staged diff in ${cwd}`);
  const diff = await collectStagedDiff(cwd, config.maxDiffTokens);
  if (diff.files.length === 0) {
    throw new Error("No staged changes. Stage some files first (git add).");
  }
  log(`Diff: ${diff.files.length} files, ~${diff.totalApproxTokens} tokens, truncated=${diff.truncated}`);

  const { system, user } = buildPrompt(prompts, {
    count: config.suggestionCount,
    language: config.language,
    detailLevel: config.detailLevel,
    bestPractices: config.bestPractices,
    diff: renderDiff(diff),
    commitTypes,
  });

  const baseArgs = {
    providersConfig,
    ollamaBaseUrl: config.ollamaBaseUrl,
    modelOverride: config.model,
    systemPrompt: system,
    userPrompt: user,
    getApiKey,
    log,
    signal: deps.signal,
  };

  // Auto mode: walk the chain, return the first success. Surface the chain
  // of errors in the final exception if every leg fails. If the caller
  // aborted (Stop button), re-throw the abort immediately rather than
  // burning subsequent legs on a request that's already cancelled.
  if (config.provider === "auto") {
    const errors: string[] = [];
    for (const id of AUTO_CHAIN) {
      try {
        const r = await attempt({ id, ...baseArgs });
        return { suggestions: r.suggestions, providerUsed: `auto → ${r.label}`, truncated: diff.truncated };
      } catch (err) {
        if ((err as Error).name === "AbortError" || deps.signal?.aborted) throw err;
        const msg = (err as Error).message;
        log(`auto: ${id} failed — ${msg}`);
        errors.push(`${id}: ${msg}`);
      }
    }
    throw new Error(`All auto-chain providers failed:\n${errors.join("\n")}`);
  }

  // Explicit provider: try once. g4f still falls back to mistral default on
  // failure (the unofficial reverse-proxy provider has no SLA).
  try {
    const r = await attempt({ id: config.provider as ConcreteProviderId, ...baseArgs });
    return { suggestions: r.suggestions, providerUsed: r.label, truncated: diff.truncated };
  } catch (err) {
    if (config.provider !== "g4f") throw err;
    log(`g4f failed (${(err as ProviderError).message}); falling back to mistral`);
    const r = await attempt({ id: "mistral", ...baseArgs });
    return { suggestions: r.suggestions, providerUsed: `g4f → ${r.label}`, truncated: diff.truncated };
  }
}
