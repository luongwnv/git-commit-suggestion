import { spawn } from "child_process";

export function runGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`git ${args.join(" ")} exited ${code}: ${stderr.trim()}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

// Walks up from `start` to find the directory containing .git. Returns null
// if there is no git repo in any ancestor. We avoid `git rev-parse
// --show-toplevel` because that errors with the same misleading "--no-index"
// usage line when the cwd isn't inside a repo — we want to detect that
// ourselves and report it cleanly.
export async function findRepoRoot(start: string): Promise<string | null> {
  const { stat } = await import("fs/promises");
  const path = await import("path");
  let dir = path.resolve(start);
  while (true) {
    try {
      const s = await stat(path.join(dir, ".git"));
      if (s.isDirectory() || s.isFile()) return dir;
    } catch {
      // .git not present here; keep walking up.
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
