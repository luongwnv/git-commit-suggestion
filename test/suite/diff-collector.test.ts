import * as assert from "assert";
import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { collectStagedDiff } from "../../src/pipeline/diff-collector";

function sh(cwd: string, cmd: string): void {
  cp.execSync(cmd, { cwd, stdio: "ignore" });
}

describe("diff-collector.collectStagedDiff", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gcs-test-"));
    sh(tmp, "git init -b main");
    sh(tmp, 'git config user.email test@test.test');
    sh(tmp, 'git config user.name test');
    fs.writeFileSync(path.join(tmp, "a.txt"), "hello\n");
    sh(tmp, "git add a.txt");
    sh(tmp, 'git commit -m "init"');
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("returns empty for no staged changes", async () => {
    const out = await collectStagedDiff(tmp, 6000);
    assert.strictEqual(out.files.length, 0);
  });

  it("captures staged changes per file", async () => {
    fs.writeFileSync(path.join(tmp, "a.txt"), "hello\nworld\n");
    fs.writeFileSync(path.join(tmp, "b.txt"), "new\n");
    sh(tmp, "git add a.txt b.txt");
    const out = await collectStagedDiff(tmp, 6000);
    assert.strictEqual(out.files.length, 2);
    assert.ok(out.files.some((f) => f.path === "a.txt"));
    assert.ok(out.files.some((f) => f.path === "b.txt"));
    assert.strictEqual(out.truncated, false);
  });

  it("truncates when budget is too small", async () => {
    const big = "x".repeat(20000);
    fs.writeFileSync(path.join(tmp, "big.txt"), big);
    sh(tmp, "git add big.txt");
    const out = await collectStagedDiff(tmp, 500);
    assert.strictEqual(out.truncated, true);
    assert.ok(out.totalApproxTokens <= 500);
  });
});
