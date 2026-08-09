import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const kitRoot = path.resolve(scriptDir, "../../../..");
const discoverScript = path.join(
  kitRoot,
  ".agents/skills/vc-context-discovery/scripts/discover-context.mjs",
);
const contextValidator = path.join(scriptDir, "validate-context-discovery.mjs");
const planValidator = path.join(
  kitRoot,
  ".agents/skills/vc-audit-plans/scripts/validate-plan-inventory.mjs",
);
const tempRoots = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vc-harness-regression-"));
  tempRoots.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  return root;
}

function write(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function runJson(script, root, args = []) {
  return JSON.parse(execFileSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
  }));
}

function frontmatter(name, extra = "") {
  return `---\nname: ${name}\ndescription: Fixture for ${name}\n${extra}---\n`;
}

test("context discovery accepts YAML lists for keywords and related", () => {
  const root = fixture();
  write(root, "process/context/all-context.md", frontmatter("context:all-context", "keywords:\n  - root\n"));
  write(
    root,
    "process/context/catalog.md",
    frontmatter(
      "context:catalog",
      "keywords:\n  - product catalog\n  - collections\nrelated:\n  - context:all-context\n",
    ),
  );

  const inventory = runJson(discoverScript, root, ["--json"]);
  const catalog = inventory.context.find((entry) => entry.path === "process/context/catalog.md");
  assert.deepEqual(catalog.keywords, ["product catalog", "collections"]);
  assert.deepEqual(catalog.related, ["context:all-context"]);

  const matches = runJson(discoverScript, root, ["--match", "collections", "--json"]);
  assert.equal(matches.matches[0].name, "context:catalog");
  assert.equal(matches.related[0].name, "context:all-context");
});

test("context validation resolves YAML-list references to the root router", () => {
  const root = fixture();
  const skillNames = ["vc-audit-context", "vc-audit-plans", "vc-generate-context", "vc-generate-plan"];
  for (const skill of skillNames) {
    const body = skill === "vc-generate-context" ? "process/context/all-context.md\n" : "";
    write(root, `.agents/skills/${skill}/SKILL.md`, `${frontmatter(skill)}${body}`);
  }
  write(
    root,
    ".agents/skills/vc-generate-context/references/generate-context.md",
    "process/context/all-context.md\n",
  );
  fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
  fs.symlinkSync("../.agents/skills", path.join(root, ".claude/skills"));

  for (const agent of ["vc-research-agent", "vc-update-process-agent"]) {
    write(root, `.agents/agents/${agent}.md`, "process/context/all-context.md\n");
    write(root, `.codex/agents/${agent}.toml`, "# process/context/all-context.md\n");
  }
  fs.symlinkSync("../.agents/agents", path.join(root, ".claude/agents"));
  write(root, "AGENTS.md", "process/context/all-context.md\n");
  write(root, "CLAUDE.md", "process/context/all-context.md\n");

  write(
    root,
    "process/context/all-context.md",
    `${frontmatter("context:all-context", "keywords:\n  - root\n")}Context Group Lifecycle\nexample/all-example.md\n`,
  );
  write(
    root,
    "process/context/example/all-example.md",
    `${frontmatter("context:example", "keywords:\n  - example\nrelated:\n  - context:all-context\n")}details.md\n`,
  );
  write(
    root,
    "process/context/example/details.md",
    frontmatter("context:details", "keywords:\n  - details\nrelated:\n  - context:all-context\n"),
  );

  const result = runJson(contextValidator, root);
  assert.deepEqual(result.failures, []);
  assert.equal(result.checkedContextDocs, 3);
});

test("plan inventory counts only plans and exempts umbrella completion rules", () => {
  const root = fixture();
  for (const directory of [
    "process/general-plans/active/task",
    "process/general-plans/completed",
    "process/features/catalog/active/legacy",
  ]) {
    fs.mkdirSync(path.join(root, directory), { recursive: true });
  }

  const completePlan = "Phase Completion Rules\nVerification\n";
  write(root, "process/general-plans/active/task/catalog_PLAN_08-08-26.md", completePlan);
  write(root, "process/general-plans/active/task/catalog-umbrella_PLAN_08-08-26.md", "Verification\n");
  write(root, "process/features/catalog/active/legacy/PLAN.md", completePlan);
  write(root, "process/general-plans/completed/archive_PLAN_07-08-26.md", completePlan);
  for (const artifact of ["catalog_REPORT_08-08-26.md", "catalog_REF_08-08-26.md", "catalog_SPEC_08-08-26.md", "GUIDE.md"]) {
    write(root, `process/general-plans/active/task/${artifact}`, "Reference material\n");
  }

  const result = runJson(planValidator, root);
  assert.equal(result.activePlans, 3);
  assert.equal(result.completedPlans, 1);
  assert.deepEqual(result.samples.missingPhaseRules, []);
  assert.deepEqual(result.samples.missingVerification, []);
});
