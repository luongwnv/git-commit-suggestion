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
}

export interface OrchestratorResult {
  suggestions: Suggestion[];
  providerUsed: string;
  truncated: boolean;
}

// Order matters: cheapest/most-reliable first. Each is tried in turn until
// one returns parseable suggestions. All legs are zero-config (no API key
// required) — providers that need a key (mistral, openai, anthropic, groq,
// and now huggingface) must be selected explicitly by the user after
// pasting their key.
//
// As of May 2026 only Pollinations remains anonymous-accessible:
//   - DuckDuckGo introduced a JS challenge handshake (x-vqd-hash-1) we
//     can't replicate without a headless browser.
//   - HuggingFace router now returns 401 without a bearer token.
// Keeping the chain in this form means we don't try-and-fail loudly through
// providers we know are broken; the orchestrator surfaces a single clean
// error if Pollinations is also down.
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
): Promise<Suggestion[]> {
  const resp = await provider.generate({
    systemPrompt,
    userPrompt,
    apiKey,
    model: provider.resolveModel(modelOverride),
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
}

interface AttemptResult {
  suggestions: Suggestion[];
  label: string;
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
  const suggestions = await callProvider(
    provider,
    args.systemPrompt,
    args.userPrompt,
    key,
    args.modelOverride,
  );
  return { suggestions, label: `${args.id} (${keySource})` };
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
  };

  // Auto mode: walk the chain, return the first success. Surface the chain
  // of errors in the final exception if every leg fails.
  if (config.provider === "auto") {
    const errors: string[] = [];
    for (const id of AUTO_CHAIN) {
      try {
        const r = await attempt({ id, ...baseArgs });
        return { suggestions: r.suggestions, providerUsed: `auto → ${r.label}`, truncated: diff.truncated };
      } catch (err) {
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
