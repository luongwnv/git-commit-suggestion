export interface FileDiff {
  path: string;
  hunks: string;
  approxTokens: number;
}

export interface ParsedDiff {
  files: FileDiff[];
  totalApproxTokens: number;
  truncated: boolean;
}
