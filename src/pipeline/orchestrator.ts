import * as fs from "fs";
import * as yaml from "js-yaml";
import { ExtensionConfig, ProvidersConfig, ProvidersConfigSchema } from "../models/config";
import { Suggestion } from "../models/suggestion";
import { buildProvider, Provider } from "../providers";
import { ProviderError } from "../providers/base";
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
    diff: renderDiff(diff),
    commitTypes,
  });

  const primaryId = config.provider;
  const primary = buildProvider(primaryId, providersConfig, { ollamaBaseUrl: config.ollamaBaseUrl });
  const primaryKey = await getApiKey(primaryId);

  try {
    log(`Calling provider: ${primaryId} (model: ${primary.resolveModel(config.model)})`);
    const suggestions = await callProvider(primary, system, user, primaryKey, config.model);
    return { suggestions, providerUsed: primaryId, truncated: diff.truncated };
  } catch (err) {
    const isUnofficial = primaryId === "g4f";
    if (!isUnofficial) throw err;
    log(`g4f failed (${(err as ProviderError).message}); falling back to mistral`);
    const fallback = buildProvider("mistral", providersConfig, {
      ollamaBaseUrl: config.ollamaBaseUrl,
    });
    const fallbackKey = await getApiKey("mistral");
    const suggestions = await callProvider(fallback, system, user, fallbackKey, "");
    return { suggestions, providerUsed: "mistral (fallback)", truncated: diff.truncated };
  }
}
