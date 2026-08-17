import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vc-tracker-github-"));
  writeFile(path.join(root, ".vc-project.json"), JSON.stringify({
    planning: {
      mode: "tracker-native",
      repoExecutionContracts: "allowed",
      repoBacklog: "compatibility-only",
    },
    tracker: {
      mode: "external",
      provider: "github",
      owner: "acme",
      repository: "demo",
      projectNumber: "7",
      phaseField: "Block",
      riperField: "RIPER State",
    },
  }, null, 2));

  writeFile(path.join(root, "tracker-mock.json"), JSON.stringify({
    statusQuery: {
      repository: {
        issues: {
          nodes: [
            {
              id: "I_1",
              number: 101,
              title: "Harden review-situation tracker path",
              url: "https://github.com/acme/demo/issues/101",
              state: "OPEN",
              updatedAt: "2026-08-11T10:00:00Z",
              labels: { nodes: [{ name: "tracker-native" }] },
              assignees: { nodes: [{ login: "rafa" }] },
              projectItems: {
                nodes: [
                  {
                    id: "PVTI_1",
                    project: { id: "P_1", number: 7, title: "Main Board" },
                    fieldValues: {
                      nodes: [
                        { field: { name: "Block" }, name: "Execution Surface", optionId: "opt-block-1" },
                        { field: { name: "RIPER State" }, name: "Execute", optionId: "opt-riper-execute" },
                      ],
                    },
                  },
                ],
              },
            },
            {
              id: "I_2",
              number: 102,
              title: "Document tracker contract",
              url: "https://github.com/acme/demo/issues/102",
              state: "OPEN",
              updatedAt: "2026-08-10T10:00:00Z",
              labels: { nodes: [] },
              assignees: { nodes: [] },
              projectItems: {
                nodes: [
                  {
                    id: "PVTI_2",
                    project: { id: "P_1", number: 7, title: "Main Board" },
                    fieldValues: {
                      nodes: [
                        { field: { name: "Block" }, name: "Docs", optionId: "opt-block-2" },
                        { field: { name: "RIPER State" }, name: "Plan", optionId: "opt-riper-plan" },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    },
    projectQuery: {
      repository: {
        projectV2: {
          id: "P_1",
          number: 7,
          title: "Main Board",
          fields: {
            nodes: [
              {
                id: "F_1",
                name: "RIPER State",
                options: [
                  { id: "opt-riper-plan", name: "Plan" },
                  { id: "opt-riper-execute", name: "Execute" },
                  { id: "opt-riper-done", name: "Done" },
                ],
              },
              {
                id: "F_2",
                name: "Block",
                options: [
                  { id: "opt-block-1", name: "Execution Surface" },
                  { id: "opt-block-2", name: "Docs" },
                ],
              },
            ],
          },
        },
      },
    },
  }, null, 2));

  return root;
}

function run(root, args) {
  return spawnSync("node", [path.join(process.cwd(), "scripts", "vc-tracker-github.mjs"), ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

test("status returns tracker summary from mock data", () => {
  const root = createFixture();
  try {
    const result = run(root, ["status", "--json", "--mock", "tracker-mock.json"]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);

    assert.equal(payload.ok, true);
    assert.equal(payload.tracker.repo, "acme/demo");
    assert.equal(payload.items.length, 2);
    assert.equal(payload.next.number, 101);
    assert.equal(payload.next.riperState, "Execute");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("next returns the selected issue only", () => {
  const root = createFixture();
  try {
    const result = run(root, ["next", "--json", "--mock", "tracker-mock.json"]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);

    assert.equal(payload.selected.number, 101);
    assert.equal(payload.items.length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("set-riper dry-run resolves project field option without network", () => {
  const root = createFixture();
  try {
    const result = run(root, ["set-riper", "--json", "--dry-run", "--mock", "tracker-mock.json", "--issue", "101", "--state", "Done"]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);

    assert.equal(payload.action, "set-riper");
    assert.equal(payload.issue, 101);
    assert.equal(payload.from, "Execute");
    assert.equal(payload.to, "Done");
    assert.equal(payload.dryRun, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
