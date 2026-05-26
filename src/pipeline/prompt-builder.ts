import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import {
  CommitType,
  CommitTypeSchema,
  DetailLevel,
  LANGUAGE_LABELS,
  Language,
  PromptsConfig,
  PromptsConfigSchema,
} from "../models/config";

export interface PromptInputs {
  count: number;
  language: Language;
  detailLevel: DetailLevel;
  diff: string;
  commitTypes: CommitType[];
}

const DETAIL_GUIDANCE: Record<DetailLevel, string> = {
  concise:
    "Keep `body_en` and `body_vi` EMPTY. Make subjects as short as possible (under 50 chars) while still descriptive. Output is subject-only.",
  normal:
    "Body is 1–3 short sentences explaining the WHY. Skip the body entirely if the change is trivial (rename, typo, formatting).",
  detailed:
    "Body is a thorough multi-paragraph explanation. Cover: what changed, why it changed, what alternatives were considered, what callers/consumers are affected. 3–6 short paragraphs separated by blank lines.",
};

export interface BuiltPrompt {
  system: string;
  user: string;
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

function renderTypesBlock(types: CommitType[]): string {
  return types.map((t) => `- ${t.type} ${t.emoji}: ${t.en}`).join("\n");
}

export function buildPrompt(prompts: PromptsConfig, inputs: PromptInputs): BuiltPrompt {
  const vars = {
    count: String(inputs.count),
    language: inputs.language,
    language_label: LANGUAGE_LABELS[inputs.language],
    detail_level: inputs.detailLevel,
    detail_guidance: DETAIL_GUIDANCE[inputs.detailLevel],
    diff: inputs.diff,
    types_block: renderTypesBlock(inputs.commitTypes),
  };
  return {
    system: interpolate(prompts.system, vars),
    user: interpolate(prompts.user, vars),
  };
}

export function loadPrompts(promptsPath: string): PromptsConfig {
  const raw = fs.readFileSync(promptsPath, "utf-8");
  return PromptsConfigSchema.parse(yaml.load(raw));
}

export function loadCommitTypes(typesPath: string): CommitType[] {
  const raw = fs.readFileSync(typesPath, "utf-8");
  const parsed = yaml.load(raw);
  return (parsed as unknown[]).map((e) => CommitTypeSchema.parse(e));
}

export function resolveConfigPath(extensionRoot: string, file: string): string {
  return path.join(extensionRoot, "config", file);
}
