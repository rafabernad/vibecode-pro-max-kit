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

const gitRoot = ensureGitRepo();
const config = readJson(configPath);
const contextConfig = config.context || {};

if (contextConfig.mode !== "external") {
  console.log("vc-sync-external-context: context.mode is not 'external'; nothing to do.");
  process.exit(0);
}

const external = contextConfig.external || {};
const repository = external.repository;
const ref = external.ref || "main";
const subpath = external.subpath || "process/context";
const syncInto = external.syncInto || "process/context";

if (!repository) {
  fail("context.external.repository is required when context.mode is 'external'");
}

const targetDir = path.join(cwd, syncInto);
const gitDir = path.join(gitRoot, ".git");
const cacheRoot = path.join(gitDir, "vc-external-context");
const cacheDir = path.join(cacheRoot, hashId(repository));
const checkoutDir = path.join(cacheDir, "checkout");
const statePath = path.join(cacheDir, "state.json");

fs.mkdirSync(cacheRoot, { recursive: true });

if (!fs.existsSync(checkoutDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
  run("git", ["clone", "--quiet", repository, checkoutDir]);
} else {
  run("git", ["-C", checkoutDir, "fetch", "--quiet", "--all", "--tags", "--prune"]);
}

run("git", ["-C", checkoutDir, "fetch", "--quiet", "origin", ref]);
run("git", ["-C", checkoutDir, "checkout", "--quiet", "FETCH_HEAD"]);

const sourceDir = path.join(checkoutDir, subpath);
if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
  fail(`external context path does not exist: ${subpath}`);
}

const sourceFiles = walkFiles(sourceDir);
const protectedTargets = new Set([
  "generated-skills-catalog.json",
]);

let previousState = { managedFiles: [] };
if (fs.existsSync(statePath)) {
  previousState = readJson(statePath);
}

for (const relativeFile of previousState.managedFiles || []) {
  if (protectedTargets.has(relativeFile)) {
    continue;
  }
  if (sourceFiles.includes(relativeFile)) {
    continue;
  }
  const targetFile = path.join(targetDir, relativeFile);
  if (fs.existsSync(targetFile)) {
    fs.rmSync(targetFile, { force: true });
    removeEmptyParents(path.dirname(targetFile), targetDir);
  }
}

fs.mkdirSync(targetDir, { recursive: true });

for (const relativeFile of sourceFiles) {
  if (protectedTargets.has(relativeFile)) {
    continue;
  }
  const sourceFile = path.join(sourceDir, relativeFile);
  const targetFile = path.join(targetDir, relativeFile);
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.copyFileSync(sourceFile, targetFile);
}

const head = run("git", ["-C", checkoutDir, "rev-parse", "HEAD"]).stdout.trim();
const nextState = {
  repository,
  ref,
  subpath,
  syncInto,
  commit: head,
  syncedAtUtc: new Date().toISOString(),
  managedFiles: sourceFiles.filter((file) => !protectedTargets.has(file)),
};

fs.writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`);

const normalizedSyncInto = syncInto.replace(/\\/g, "/");
upsertExclude(gitRoot, `${normalizedSyncInto}/**`);

console.log(`vc-sync-external-context: synced ${nextState.managedFiles.length} file(s) from ${repository} @ ${head}`);
console.log(`vc-sync-external-context: target ${path.relative(cwd, targetDir) || "."}`);
console.log(`vc-sync-external-context: cache ${path.relative(cwd, cacheDir) || cacheDir}`);
