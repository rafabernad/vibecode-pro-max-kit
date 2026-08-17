#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const cwd = process.cwd();
const configPath = path.join(cwd, ".vc-project.json");

function fail(message) {
  console.error(`vc-sync-external-context: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const command = argv[0] || "pull";
  if (!["pull", "push"].includes(command)) {
    fail(`unknown command '${command}'. Use 'pull' or 'push'.`);
  }
  return { command };
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
    ...options,
  });

  if (result.status !== 0) {
    const stderr = (result.stderr || "").trim();
    const stdout = (result.stdout || "").trim();
    fail(
      [
        `${cmd} ${args.join(" ")} failed`,
        stderr && `stderr: ${stderr}`,
        stdout && `stdout: ${stdout}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return result;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`missing ${path.relative(cwd, filePath)}`);
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`invalid JSON in ${path.relative(cwd, filePath)}: ${error.message}`);
  }
}

function ensureGitRepo() {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    fail("must be run inside a git repository");
  }

  return result.stdout.trim();
}

function hashId(input) {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 12);
}

function walkFiles(rootDir) {
  const entries = [];

  function visit(currentDir) {
    const children = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const child of children) {
      const childPath = path.join(currentDir, child.name);
      if (child.isDirectory()) {
        visit(childPath);
        continue;
      }
      if (!child.isFile()) {
        continue;
      }
      entries.push(path.relative(rootDir, childPath));
    }
  }

  if (fs.existsSync(rootDir)) {
    visit(rootDir);
  }

  return entries.sort();
}

function removeEmptyParents(startDir, stopDir) {
  let current = startDir;
  while (current.startsWith(stopDir) && current !== stopDir) {
    if (!fs.existsSync(current)) {
      current = path.dirname(current);
      continue;
    }
    if (fs.readdirSync(current).length > 0) {
      return;
    }
    fs.rmdirSync(current);
    current = path.dirname(current);
  }
}

function upsertExclude(gitRoot, pattern) {
  const excludePath = path.join(gitRoot, ".git", "info", "exclude");
  const existing = fs.existsSync(excludePath)
    ? fs.readFileSync(excludePath, "utf8")
    : "";
  const lines = existing.split(/\r?\n/).filter(Boolean);

  if (lines.includes(pattern)) {
    return;
  }

  const next = existing.endsWith("\n") || existing.length === 0
    ? existing
    : `${existing}\n`;
  fs.writeFileSync(excludePath, `${next}${pattern}\n`);
}

function ensureTrailingNewline(value) {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function readOptionalJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return readJson(filePath);
}

function updateSubmodules(repoDir) {
  const gitmodulesPath = path.join(repoDir, ".gitmodules");
  if (!fs.existsSync(gitmodulesPath)) {
    return false;
  }

  run("git", ["-C", repoDir, "submodule", "sync", "--recursive"]);
  run(
    "git",
    ["-C", repoDir, "-c", "protocol.file.allow=always", "submodule", "update", "--init", "--recursive", "--remote"],
  );
  return true;
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function copyTree(sourceDir, targetDir, files, { skip = new Set() } = {}) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const relativeFile of files) {
    if (skip.has(relativeFile)) {
      continue;
    }
    const sourceFile = path.join(sourceDir, relativeFile);
    const targetFile = path.join(targetDir, relativeFile);
    ensureParentDir(targetFile);
    fs.copyFileSync(sourceFile, targetFile);
  }
}

function removeManagedFiles(targetDir, previousFiles, nextFiles, { skip = new Set() } = {}) {
  for (const relativeFile of previousFiles) {
    if (skip.has(relativeFile) || nextFiles.includes(relativeFile)) {
      continue;
    }
    const targetFile = path.join(targetDir, relativeFile);
    if (fs.existsSync(targetFile)) {
      fs.rmSync(targetFile, { force: true });
      removeEmptyParents(path.dirname(targetFile), targetDir);
    }
  }
}

function repoHasChanges(repoDir) {
  const result = spawnSync("git", ["-C", repoDir, "status", "--short"], {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    fail(`unable to inspect git status for ${repoDir}`);
  }

  return (result.stdout || "").trim().length > 0;
}

function resolveContextSource(config) {
  const contextConfig = config.context || {};
  const trackerConfig = config.tracker || {};
  const planningMode = config?.planning?.mode || "repo";

  if (contextConfig.mode === "external") {
    const external = contextConfig.external || {};
    const repository = external.repository;
    if (!repository) {
      fail("context.external.repository is required when context.mode is 'external'");
    }

    return {
      mode: "external",
      repository,
      ref: external.ref || "main",
      subpath: external.subpath || "process/context",
      syncInto: external.syncInto || "process/context",
      commitPrefix: "external-context",
    };
  }

  if (contextConfig.mode === "github-wiki") {
    if (planningMode !== "tracker-native") {
      fail("context.mode 'github-wiki' requires planning.mode 'tracker-native'");
    }

    const wiki = contextConfig.githubWiki || {};
    const owner = wiki.owner || trackerConfig.owner || "";
    const repositoryName = wiki.repository || trackerConfig.repository || "";
    const remote = wiki.remote || (owner && repositoryName
      ? `https://github.com/${owner}/${repositoryName}.wiki.git`
      : "");

    if (!remote) {
      fail("context.githubWiki.remote or tracker.owner/tracker.repository must be configured for context.mode 'github-wiki'");
    }

    return {
      mode: "github-wiki",
      repository: remote,
      ref: wiki.ref || "master",
      subpath: wiki.subpath || "process/context",
      syncInto: wiki.syncInto || "process/context",
      commitPrefix: "github-wiki-context",
      owner,
      repositoryName,
    };
  }

  return null;
}

const { command } = parseArgs(process.argv.slice(2));
const gitRoot = ensureGitRepo();
const config = readJson(configPath);
const source = resolveContextSource(config);

if (!source) {
  console.log("vc-sync-external-context: context.mode is not 'external' or 'github-wiki'; nothing to do.");
  process.exit(0);
}

const targetDir = path.join(cwd, source.syncInto);
const gitDir = path.join(gitRoot, ".git");
const cacheRoot = path.join(gitDir, "vc-external-context");
const cacheDir = path.join(cacheRoot, hashId(`${source.mode}:${source.repository}`));
const checkoutDir = path.join(cacheDir, "checkout");
const statePath = path.join(cacheDir, "state.json");

const protectedTargets = new Set([
  "generated-skills-catalog.json",
]);

fs.mkdirSync(cacheRoot, { recursive: true });

if (!fs.existsSync(checkoutDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
  run("git", ["clone", "--quiet", source.repository, checkoutDir]);
} else {
  run("git", ["-C", checkoutDir, "fetch", "--quiet", "--all", "--tags", "--prune"]);
}

run("git", ["-C", checkoutDir, "fetch", "--quiet", "origin", source.ref]);
run("git", ["-C", checkoutDir, "checkout", "--quiet", "FETCH_HEAD"]);
const submodulesUpdated = updateSubmodules(checkoutDir);

const sourceDir = path.join(checkoutDir, source.subpath);
const previousState = readOptionalJson(statePath, { managedFiles: [] });

if (command === "pull") {
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    fail(`external context path does not exist: ${source.subpath}`);
  }

  const sourceFiles = walkFiles(sourceDir);
  removeManagedFiles(targetDir, previousState.managedFiles || [], sourceFiles, {
    skip: protectedTargets,
  });
  copyTree(sourceDir, targetDir, sourceFiles, { skip: protectedTargets });

  const head = run("git", ["-C", checkoutDir, "rev-parse", "HEAD"]).stdout.trim();
  const nextState = {
    mode: source.mode,
    repository: source.repository,
    ref: source.ref,
    subpath: source.subpath,
    syncInto: source.syncInto,
    commit: head,
    syncedAtUtc: new Date().toISOString(),
    managedFiles: sourceFiles.filter((file) => !protectedTargets.has(file)),
  };

  fs.writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`);

  const normalizedSyncInto = source.syncInto.replace(/\\/g, "/");
  upsertExclude(gitRoot, `${normalizedSyncInto}/**`);

  console.log(`vc-sync-external-context: pulled ${nextState.managedFiles.length} file(s) from ${source.repository} @ ${head}`);
  console.log(`vc-sync-external-context: target ${path.relative(cwd, targetDir) || "."}`);
  console.log(`vc-sync-external-context: cache ${path.relative(cwd, cacheDir) || cacheDir}`);
  if (submodulesUpdated) {
    console.log("vc-sync-external-context: submodules refreshed with --remote");
  }
  process.exit(0);
}

if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
  fail(`local context path does not exist: ${source.syncInto}`);
}

const localFiles = walkFiles(targetDir).filter((file) => !protectedTargets.has(file));
fs.mkdirSync(sourceDir, { recursive: true });

const previousRemoteFiles = previousState.managedFiles || walkFiles(sourceDir);
removeManagedFiles(sourceDir, previousRemoteFiles, localFiles);
copyTree(targetDir, sourceDir, localFiles);

run("git", ["-C", checkoutDir, "add", source.subpath]);

if (!repoHasChanges(checkoutDir)) {
  const head = run("git", ["-C", checkoutDir, "rev-parse", "HEAD"]).stdout.trim();
  const nextState = {
    mode: source.mode,
    repository: source.repository,
    ref: source.ref,
    subpath: source.subpath,
    syncInto: source.syncInto,
    commit: head,
    syncedAtUtc: new Date().toISOString(),
    managedFiles: localFiles,
  };
  fs.writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`);
  upsertExclude(gitRoot, `${source.syncInto.replace(/\\/g, "/")}/**`);
  console.log("vc-sync-external-context: no wiki changes to push.");
  process.exit(0);
}

run("git", ["-C", checkoutDir, "commit", "--quiet", "-m", `${source.commitPrefix}: sync from working tree`], {
  env: {
    ...process.env,
    GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || "vibecode-context-bot",
    GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL || "context-bot@example.invalid",
    GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME || "vibecode-context-bot",
    GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL || "context-bot@example.invalid",
  },
});
run("git", ["-C", checkoutDir, "push", "--quiet", "origin", `HEAD:${source.ref}`]);

const head = run("git", ["-C", checkoutDir, "rev-parse", "HEAD"]).stdout.trim();
const nextState = {
  mode: source.mode,
  repository: source.repository,
  ref: source.ref,
  subpath: source.subpath,
  syncInto: source.syncInto,
  commit: head,
  syncedAtUtc: new Date().toISOString(),
  managedFiles: localFiles,
};
fs.writeFileSync(statePath, ensureTrailingNewline(JSON.stringify(nextState, null, 2)));
upsertExclude(gitRoot, `${source.syncInto.replace(/\\/g, "/")}/**`);

console.log(`vc-sync-external-context: pushed ${localFiles.length} file(s) to ${source.repository} @ ${head}`);
console.log(`vc-sync-external-context: source ${path.relative(cwd, targetDir) || "."}`);
console.log(`vc-sync-external-context: cache ${path.relative(cwd, cacheDir) || cacheDir}`);
