import * as path from "path";
import Mocha from "mocha";
import * as fs from "fs";

function findTestFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...findTestFiles(full));
    else if (e.name.endsWith(".test.js")) out.push(full);
  }
  return out;
}

const mocha = new Mocha({ ui: "bdd", color: true, timeout: 10000 });
const testsRoot = path.join(__dirname, "suite");
for (const f of findTestFiles(testsRoot)) mocha.addFile(f);

mocha.run((failures) => {
  process.exitCode = failures ? 1 : 0;
});
