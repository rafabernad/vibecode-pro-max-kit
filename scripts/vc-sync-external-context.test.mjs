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

function runGit(cwd, args, env = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

function runGitAllowFile(cwd, args, env = {}) {
  return runGit(cwd, ["-c", "protocol.file.allow=always", ...args], env);
}

function createWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vc-sync-context-"));
  runGit(root, ["init"]);
  runGit(root, ["config", "user.name", "Test User"]);
  runGit(root, ["config", "user.email", "test@example.com"]);
  writeFile(path.join(root, ".vc-project.json"), JSON.stringify({
    planning: {
      mode: "tracker-native",
      repoExecutionContracts: "allowed",
      repoBacklog: "forbidden",
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
    context: {
      mode: "github-wiki",
      githubWiki: {
        remote: "",
        ref: "master",
        subpath: "process/context",
        syncInto: "process/context",
      },
    },
  }, null, 2));
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "init"]);
  return root;
}

function createBareWikiRemote() {
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), "vc-sync-context-remote-"));
  runGit(remote, ["init", "--bare", "--initial-branch=master"]);
  return remote;
}

function createBareRemoteWithSeed(files) {
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), "vc-sync-context-git-remote-"));
  runGit(remote, ["init", "--bare", "--initial-branch=main"]);
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), "vc-sync-context-git-seed-"));
  runGit(checkout, ["clone", remote, "."]);
  runGit(checkout, ["config", "user.name", "Seed User"]);
  runGit(checkout, ["config", "user.email", "seed@example.com"]);
  for (const [relativePath, content] of Object.entries(files)) {
    writeFile(path.join(checkout, relativePath), content);
  }
  runGit(checkout, ["add", "."]);
  runGit(checkout, ["commit", "-m", "seed remote"]);
  runGit(checkout, ["push", "origin", "HEAD:main"]);
  fs.rmSync(checkout, { recursive: true, force: true });
  return remote;
}

function seedWikiRemote(remote, files) {
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), "vc-sync-context-seed-"));
  runGit(checkout, ["clone", remote, "."]);
  runGit(checkout, ["config", "user.name", "Seed User"]);
  runGit(checkout, ["config", "user.email", "seed@example.com"]);
  for (const [relativePath, content] of Object.entries(files)) {
    writeFile(path.join(checkout, relativePath), content);
  }
  runGit(checkout, ["add", "."]);
  runGit(checkout, ["commit", "-m", "seed wiki"]);
  runGit(checkout, ["push", "origin", "HEAD:master"]);
  fs.rmSync(checkout, { recursive: true, force: true });
}

function updateProjectRemote(root, remote) {
  const configPath = path.join(root, ".vc-project.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.context.githubWiki.remote = remote;
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

function runSync(root, args) {
  return spawnSync("node", [path.join(process.cwd(), "scripts", "vc-sync-external-context.mjs"), ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

test("pull hydrates local process/context from github wiki mode", () => {
  const root = createWorkspace();
  const remote = createBareWikiRemote();
  try {
    updateProjectRemote(root, remote);
    seedWikiRemote(remote, {
      "process/context/all-context.md": "# Context\n",
      "process/context/tests/all-tests.md": "# Tests\n",
    });

    const result = runSync(root, ["pull"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /pulled 2 file\(s\)/);
    assert.equal(fs.readFileSync(path.join(root, "process/context/all-context.md"), "utf8"), "# Context\n");
    assert.equal(fs.readFileSync(path.join(root, "process/context/tests/all-tests.md"), "utf8"), "# Tests\n");

    const exclude = fs.readFileSync(path.join(root, ".git/info/exclude"), "utf8");
    assert.match(exclude, /process\/context\/\*\*/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(remote, { recursive: true, force: true });
  }
});

test("push publishes local context changes back to github wiki mode", () => {
  const root = createWorkspace();
  const remote = createBareWikiRemote();
  const verify = fs.mkdtempSync(path.join(os.tmpdir(), "vc-sync-context-verify-"));
  try {
    updateProjectRemote(root, remote);
    seedWikiRemote(remote, {
      "process/context/all-context.md": "# Old\n",
    });

    writeFile(path.join(root, "process/context/all-context.md"), "# New\n");
    writeFile(path.join(root, "process/context/backend/all-backend.md"), "# Backend\n");

    const result = runSync(root, ["push"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /pushed 2 file\(s\)/);

    runGit(verify, ["clone", remote, "."]);
    assert.equal(fs.readFileSync(path.join(verify, "process/context/all-context.md"), "utf8"), "# New\n");
    assert.equal(fs.readFileSync(path.join(verify, "process/context/backend/all-backend.md"), "utf8"), "# Backend\n");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(remote, { recursive: true, force: true });
    fs.rmSync(verify, { recursive: true, force: true });
  }
});

test("pull refreshes submodules to the latest remote revision", () => {
  const root = createWorkspace();
  const parentRemote = fs.mkdtempSync(path.join(os.tmpdir(), "vc-sync-context-parent-"));
  const submoduleRemote = createBareRemoteWithSeed({
    "docs/sub.md": "version-one\n",
  });
  const parentCheckout = fs.mkdtempSync(path.join(os.tmpdir(), "vc-sync-context-parent-checkout-"));
  const submoduleWork = fs.mkdtempSync(path.join(os.tmpdir(), "vc-sync-context-submodule-work-"));

  try {
    runGit(parentRemote, ["init", "--bare", "--initial-branch=main"]);
    runGit(parentCheckout, ["clone", parentRemote, "."]);
    runGit(parentCheckout, ["config", "user.name", "Seed User"]);
    runGit(parentCheckout, ["config", "user.email", "seed@example.com"]);
    runGitAllowFile(parentCheckout, ["submodule", "add", submoduleRemote, "process/context/shared"]);
    runGit(parentCheckout, ["add", "."]);
    runGit(parentCheckout, ["commit", "-m", "seed parent"]);
    runGit(parentCheckout, ["push", "origin", "HEAD:main"]);

    runGit(submoduleWork, ["clone", submoduleRemote, "."]);
    runGit(submoduleWork, ["config", "user.name", "Seed User"]);
    runGit(submoduleWork, ["config", "user.email", "seed@example.com"]);
    writeFile(path.join(submoduleWork, "docs/sub.md"), "version-two\n");
    runGit(submoduleWork, ["add", "."]);
    runGit(submoduleWork, ["commit", "-m", "update submodule"]);
    runGit(submoduleWork, ["push", "origin", "HEAD:main"]);

    const configPath = path.join(root, ".vc-project.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config.planning.mode = "repo";
    config.tracker = {
      mode: "none",
      provider: "",
      owner: "",
      repository: "",
      projectNumber: "",
      phaseField: "Block",
      riperField: "RIPER State",
    };
    config.context.mode = "external";
    config.context.external = {
      repository: parentRemote,
      ref: "main",
      subpath: "process/context",
      syncInto: "process/context",
    };
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    const result = runSync(root, ["pull"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /submodules refreshed with --remote/);
    assert.equal(
      fs.readFileSync(path.join(root, "process/context/shared/docs/sub.md"), "utf8"),
      "version-two\n",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(parentRemote, { recursive: true, force: true });
    fs.rmSync(parentCheckout, { recursive: true, force: true });
    fs.rmSync(submoduleRemote, { recursive: true, force: true });
    fs.rmSync(submoduleWork, { recursive: true, force: true });
  }
});
