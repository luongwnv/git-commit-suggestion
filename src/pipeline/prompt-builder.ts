import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { CommitType, CommitTypeSchema, PromptsConfig, PromptsConfigSchema } from "../models/config";

export interface PromptInputs {
  count: number;
  language: "bilingual" | "en" | "vi";
  diff: string;
  commitTypes: CommitType[];
}

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
