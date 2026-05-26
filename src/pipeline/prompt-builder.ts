import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import {
  BestPracticeId,
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
  bestPractices: BestPracticeId[];
  diff: string;
  commitTypes: CommitType[];
}

// One line of prompt guidance per opt-in rule. The orchestrator renders the
// active subset into the user prompt as a bulleted block.
const BEST_PRACTICE_PROMPT: Record<BestPracticeId, string> = {
  imperative: "Use imperative mood for subjects (\"Add login\", not \"Added login\").",
  subject50: "Keep subject line to 50 characters or fewer.",
  capitalize: "Capitalize the first letter of the subject after the type/scope prefix.",
  noPeriod: "Do not end the subject with a period.",
  bodyWrap72: "Wrap body lines at 72 characters; insert line breaks as needed.",
  explainWhy: "Body must explain WHAT changed and WHY — never describe HOW (the diff already shows how).",
  referenceIssues: "If you can plausibly infer a related issue or PR from the diff or file path, reference it in a footer line like \"Refs: #123\". Otherwise omit the footer.",
};

export function renderBestPractices(ids: BestPracticeId[]): string {
  if (ids.length === 0) return "(no extra style rules applied)";
  return ids.map((id) => `- ${BEST_PRACTICE_PROMPT[id]}`).join("\n");
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
    best_practices: renderBestPractices(inputs.bestPractices),
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
