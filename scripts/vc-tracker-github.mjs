#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync, execSync } from "node:child_process";

function parseArgs(argv) {
  const options = {
    cwd: process.cwd(),
    json: false,
    limit: 25,
    issue: null,
    state: null,
    title: null,
    body: null,
    bodyFile: null,
    labels: [],
    dryRun: false,
    mock: process.env.VC_TRACKER_MOCK || null,
  };

  let command = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!command && !arg.startsWith("--")) {
      command = arg;
      continue;
    }
    if (arg === "--json") options.json = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--cwd") options.cwd = path.resolve(readValue(argv, ++i, "--cwd"));
    else if (arg === "--limit") options.limit = parsePositiveInt(readValue(argv, ++i, "--limit"), "--limit");
    else if (arg === "--issue") options.issue = parsePositiveInt(readValue(argv, ++i, "--issue"), "--issue");
    else if (arg === "--state") options.state = readValue(argv, ++i, "--state");
    else if (arg === "--title") options.title = readValue(argv, ++i, "--title");
    else if (arg === "--body") options.body = readValue(argv, ++i, "--body");
    else if (arg === "--body-file") options.bodyFile = path.resolve(options.cwd, readValue(argv, ++i, "--body-file"));
    else if (arg === "--labels") options.labels = readValue(argv, ++i, "--labels").split(",").map((value) => value.trim()).filter(Boolean);
    else if (arg === "--mock") options.mock = path.resolve(options.cwd, readValue(argv, ++i, "--mock"));
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  return { command, options };
}

function readValue(argv, index, name) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function parsePositiveInt(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function printHelp() {
  console.log(`vc-tracker-github

Usage:
  node scripts/vc-tracker-github.mjs <command> [options]

Commands:
  status                Show tracker summary for tracker-native projects
  list                  List open tracker issues/items
  next                  Suggest the next issue to work on
  set-riper             Update the configured RIPER field for an issue
  comment               Post a comment to an issue
  create-followup       Create a follow-up issue

Common options:
  --json
  --cwd <path>
  --limit <n>
  --mock <file>
  --dry-run

Mutation options:
  --issue <number>
  --state <value>       For set-riper
  --title <value>       For create-followup
  --body <value>
  --body-file <path>
  --labels a,b,c        For create-followup
`);
}

function gitRoot(cwd) {
  try {
    return execSync("git rev-parse --show-toplevel", { cwd, encoding: "utf8" }).trim();
  } catch {
    return cwd;
  }
}

function loadProjectConfig(root) {
  const configPath = path.join(root, ".vc-project.json");
  if (!fs.existsSync(configPath)) return { path: configPath, config: null };
  return { path: configPath, config: JSON.parse(fs.readFileSync(configPath, "utf8")) };
}

function repoConfigError(message, extra = {}) {
  return {
    ok: false,
    available: false,
    warnings: [message],
    ...extra,
  };
}

function normalizeTrackerConfig(root) {
  const loaded = loadProjectConfig(root);
  const config = loaded.config;
  if (!config) return repoConfigError(`Missing ${path.basename(loaded.path)}.`);

  const planningMode = config?.planning?.mode || "repo";
  const tracker = config?.tracker || {};
  const provider = tracker.provider || "";
  const mode = tracker.mode || "none";
  const owner = tracker.owner || "";
  const repository = tracker.repository || "";
  const projectNumber = tracker.projectNumber ? Number(tracker.projectNumber) : null;
  const phaseField = tracker.phaseField || "Block";
  const riperField = tracker.riperField || "RIPER State";

  if (planningMode !== "tracker-native") {
    return repoConfigError("planning.mode is not tracker-native.", {
      planningMode,
      tracker: { mode, provider, owner, repository, projectNumber, phaseField, riperField },
    });
  }

  if (mode !== "external") {
    return repoConfigError("tracker.mode is not external.", {
      planningMode,
      tracker: { mode, provider, owner, repository, projectNumber, phaseField, riperField },
    });
  }

  if (provider !== "github") {
    return repoConfigError("tracker.provider is not github.", {
      planningMode,
      tracker: { mode, provider, owner, repository, projectNumber, phaseField, riperField },
    });
  }

  if (!owner || !repository) {
    return repoConfigError("tracker.owner and tracker.repository must be configured for GitHub tracker mode.", {
      planningMode,
      tracker: { mode, provider, owner, repository, projectNumber, phaseField, riperField },
    });
  }

  return {
    ok: true,
    available: true,
    planningMode,
    tracker: { mode, provider, owner, repository, projectNumber, phaseField, riperField },
    warnings: [],
  };
}

function hasGh() {
  const result = spawnSync("gh", ["--version"], { encoding: "utf8" });
  return result.status === 0;
}

function ghJson(args, cwd) {
  const result = spawnSync("gh", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(detail || `gh ${args.join(" ")} failed`);
  }
  return JSON.parse(result.stdout || "{}");
}

function readMock(mockPath) {
  return JSON.parse(fs.readFileSync(mockPath, "utf8"));
}

function fieldValueToScalar(node) {
  if (!node || typeof node !== "object") return null;
  if (typeof node.name === "string" && node.field?.name) return node.name;
  if (typeof node.text === "string" && node.field?.name) return node.text;
  if (typeof node.number === "number" && node.field?.name) return String(node.number);
  if (typeof node.date === "string" && node.field?.name) return node.date;
  return null;
}

function extractProjectItem(issue, trackerConfig) {
  const items = issue.projectItems?.nodes || [];
  const targetProject = trackerConfig.projectNumber;

  if (targetProject !== null) {
    const matched = items.find((item) => Number(item?.project?.number) === targetProject);
    if (matched) return matched;
  }

  return items[0] || null;
}

function normalizeIssue(issue, trackerConfig) {
  const projectItem = extractProjectItem(issue, trackerConfig);
  const fieldValues = projectItem?.fieldValues?.nodes || [];
  const fields = {};

  for (const value of fieldValues) {
    const fieldName = value?.field?.name;
    const scalar = fieldValueToScalar(value);
    if (fieldName && scalar !== null) fields[fieldName] = scalar;
  }

  const block = fields[trackerConfig.phaseField] || null;
  const riperState = fields[trackerConfig.riperField] || null;

  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    url: issue.url,
    state: issue.state,
    updatedAt: issue.updatedAt,
    labels: (issue.labels?.nodes || []).map((label) => label.name),
    assignees: (issue.assignees?.nodes || []).map((assignee) => assignee.login),
    block,
    riperState,
    projectItemId: projectItem?.id || null,
    projectNumber: projectItem?.project?.number || null,
    projectTitle: projectItem?.project?.title || null,
    fieldValues: fields,
  };
}

function riperRank(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return 100;
  if (normalized.includes("EXECUTE")) return 0;
  if (normalized.includes("VALIDATE")) return 1;
  if (normalized.includes("PLAN")) return 2;
  if (normalized.includes("INNOVATE")) return 3;
  if (normalized.includes("SPEC")) return 4;
  if (normalized.includes("RESEARCH")) return 5;
  if (normalized.includes("DONE") || normalized.includes("COMPLETE")) return 90;
  if (normalized.includes("BLOCKED")) return 95;
  return 50;
}

function chooseNext(items) {
  return [...items]
    .filter((item) => item.state === "OPEN")
    .sort((a, b) => {
      const rankDiff = riperRank(a.riperState) - riperRank(b.riperState);
      if (rankDiff !== 0) return rankDiff;
      return Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0);
    })[0] || null;
}

function summarizeBlocks(items) {
  const summary = new Map();
  for (const item of items) {
    const key = item.block || "(unassigned)";
    summary.set(key, (summary.get(key) || 0) + 1);
  }
  return [...summary.entries()].map(([block, count]) => ({ block, count })).sort((a, b) => b.count - a.count || a.block.localeCompare(b.block));
}

function buildStatusPayload(raw, configInfo, root) {
  const issues = raw.repository?.issues?.nodes || [];
  const trackerConfig = configInfo.tracker;
  const items = issues.map((issue) => normalizeIssue(issue, trackerConfig));
  const next = chooseNext(items);
  const warnings = [...configInfo.warnings];
  if (items.length === 0) warnings.push("Tracker query returned no open issues.");

  return {
    ok: true,
    available: true,
    root,
    planningMode: configInfo.planningMode,
    tracker: {
      ...trackerConfig,
      repo: `${trackerConfig.owner}/${trackerConfig.repository}`,
    },
    items,
    counts: {
      open: items.filter((item) => item.state === "OPEN").length,
      withRiper: items.filter((item) => item.riperState).length,
      withBlock: items.filter((item) => item.block).length,
    },
    blocks: summarizeBlocks(items),
    next,
    warnings,
  };
}

function projectFieldsPayload(raw, trackerConfig) {
  const project = raw.repository?.projectV2;
  const fields = project?.fields?.nodes || [];
  const byName = new Map();

  for (const field of fields) {
    if (!field?.name) continue;
    byName.set(field.name, field);
  }

  return {
    projectId: project?.id || null,
    projectNumber: project?.number || trackerConfig.projectNumber || null,
    projectTitle: project?.title || null,
    fieldsByName: byName,
  };
}

function trackerStatus(root, options) {
  const configInfo = normalizeTrackerConfig(root);
  if (!configInfo.ok) return configInfo;

  if (options.mock) {
    const mock = readMock(options.mock);
    return buildStatusPayload(mock.statusQuery || mock, configInfo, root);
  }

  if (!hasGh()) return repoConfigError("GitHub CLI (gh) is not installed.", { tracker: configInfo.tracker, planningMode: configInfo.planningMode });

  const query = `
    query($owner:String!, $repo:String!, $limit:Int!) {
      repository(owner:$owner, name:$repo) {
        issues(first:$limit, states:OPEN, orderBy:{field:UPDATED_AT, direction:DESC}) {
          nodes {
            id
            number
            title
            url
            state
            updatedAt
            labels(first:20) { nodes { name } }
            assignees(first:10) { nodes { login } }
            projectItems(first:20) {
              nodes {
                id
                project { id number title }
                fieldValues(first:50) {
                  nodes {
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      field { ... on ProjectV2FieldCommon { name } }
                      name
                      optionId
                    }
                    ... on ProjectV2ItemFieldTextValue {
                      field { ... on ProjectV2FieldCommon { name } }
                      text
                    }
                    ... on ProjectV2ItemFieldNumberValue {
                      field { ... on ProjectV2FieldCommon { name } }
                      number
                    }
                    ... on ProjectV2ItemFieldDateValue {
                      field { ... on ProjectV2FieldCommon { name } }
                      date
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const raw = ghJson([
    "api",
    "graphql",
    "-f",
    `query=${query}`,
    "-F",
    `owner=${configInfo.tracker.owner}`,
    "-F",
    `repo=${configInfo.tracker.repository}`,
    "-F",
    `limit=${String(options.limit)}`,
  ], root);

  return buildStatusPayload(raw.data || raw, configInfo, root);
}

function loadProjectFields(root, configInfo, options) {
  if (options.mock) {
    const mock = readMock(options.mock);
    return projectFieldsPayload(mock.projectQuery || mock, configInfo.tracker);
  }

  const projectNumber = configInfo.tracker.projectNumber;
  if (!projectNumber) throw new Error("tracker.projectNumber must be configured for set-riper.");

  const query = `
    query($owner:String!, $repo:String!, $projectNumber:Int!) {
      repository(owner:$owner, name:$repo) {
        projectV2(number:$projectNumber) {
          id
          number
          title
          fields(first:50) {
            nodes {
              ... on ProjectV2FieldCommon {
                id
                name
              }
              ... on ProjectV2SingleSelectField {
                id
                name
                options {
                  id
                  name
                }
              }
            }
          }
        }
      }
    }
  `;

  const raw = ghJson([
    "api",
    "graphql",
    "-f",
    `query=${query}`,
    "-F",
    `owner=${configInfo.tracker.owner}`,
    "-F",
    `repo=${configInfo.tracker.repository}`,
    "-F",
    `projectNumber=${String(projectNumber)}`,
  ], root);

  return projectFieldsPayload(raw.data || raw, configInfo.tracker);
}

function issueFromStatus(statusPayload, issueNumber) {
  const issue = statusPayload.items.find((item) => item.number === issueNumber);
  if (!issue) throw new Error(`Issue #${issueNumber} not found in tracker query.`);
  return issue;
}

function mutationResult(payload) {
  if (payload.json) {
    console.log(JSON.stringify(payload.output, null, 2));
    return;
  }
  console.log(payload.text);
}

function setRiper(root, options) {
  if (!options.issue) throw new Error("--issue is required for set-riper");
  if (!options.state) throw new Error("--state is required for set-riper");

  const configInfo = normalizeTrackerConfig(root);
  if (!configInfo.ok) return configInfo;

  const statusPayload = trackerStatus(root, options);
  if (!statusPayload.ok) return statusPayload;

  const issue = issueFromStatus(statusPayload, options.issue);
  const project = loadProjectFields(root, configInfo, options);
  const riperField = project.fieldsByName.get(configInfo.tracker.riperField);
  if (!riperField?.options) {
    throw new Error(`Project field "${configInfo.tracker.riperField}" was not found as a single-select field.`);
  }

  const option = riperField.options.find((candidate) => candidate.name.toLowerCase() === options.state.toLowerCase());
  if (!option) {
    throw new Error(`State "${options.state}" is not a configured option for "${configInfo.tracker.riperField}".`);
  }
  if (!issue.projectItemId) {
    throw new Error(`Issue #${issue.number} has no project item in the configured project.`);
  }

  const output = {
    ok: true,
    action: "set-riper",
    issue: issue.number,
    title: issue.title,
    from: issue.riperState,
    to: option.name,
    project: project.projectTitle || project.projectNumber,
    dryRun: options.dryRun,
  };

  if (options.dryRun || options.mock) return output;

  const mutation = `
    mutation($projectId:ID!, $itemId:ID!, $fieldId:ID!, $optionId:String!) {
      updateProjectV2ItemFieldValue(
        input:{projectId:$projectId, itemId:$itemId, fieldId:$fieldId, value:{singleSelectOptionId:$optionId}}
      ) {
        projectV2Item { id }
      }
    }
  `;

  ghJson([
    "api",
    "graphql",
    "-f",
    `query=${mutation}`,
    "-F",
    `projectId=${project.projectId}`,
    "-F",
    `itemId=${issue.projectItemId}`,
    "-F",
    `fieldId=${riperField.id}`,
    "-F",
    `optionId=${option.id}`,
  ], root);

  return output;
}

function commentOnIssue(root, options) {
  if (!options.issue) throw new Error("--issue is required for comment");
  const configInfo = normalizeTrackerConfig(root);
  if (!configInfo.ok) return configInfo;

  const repo = `${configInfo.tracker.owner}/${configInfo.tracker.repository}`;
  const bodyFile = options.bodyFile;
  const body = options.body;
  if (!bodyFile && !body) throw new Error("comment requires --body or --body-file");

  const output = {
    ok: true,
    action: "comment",
    issue: options.issue,
    repo,
    dryRun: options.dryRun,
    bodyFile: bodyFile || null,
    bodyPreview: body ? body.slice(0, 120) : null,
  };

  if (options.dryRun || options.mock) return output;

  const args = ["issue", "comment", String(options.issue), "--repo", repo];
  if (bodyFile) args.push("--body-file", bodyFile);
  else args.push("--body", body);
  const result = spawnSync("gh", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "").trim() || "gh issue comment failed");
  return output;
}

function createFollowup(root, options) {
  if (!options.title) throw new Error("--title is required for create-followup");
  const configInfo = normalizeTrackerConfig(root);
  if (!configInfo.ok) return configInfo;

  const repo = `${configInfo.tracker.owner}/${configInfo.tracker.repository}`;
  const output = {
    ok: true,
    action: "create-followup",
    repo,
    title: options.title,
    labels: options.labels,
    dryRun: options.dryRun,
    bodyFile: options.bodyFile || null,
    bodyPreview: options.body ? options.body.slice(0, 120) : null,
  };

  if (options.dryRun || options.mock) return output;

  const args = ["issue", "create", "--repo", repo, "--title", options.title];
  if (options.bodyFile) args.push("--body-file", options.bodyFile);
  else if (options.body) args.push("--body", options.body);
  if (options.labels.length > 0) args.push("--label", options.labels.join(","));
  const result = spawnSync("gh", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "").trim() || "gh issue create failed");
  return { ...output, url: (result.stdout || "").trim() || null };
}

function renderTextStatus(payload) {
  const lines = [
    "Tracker Status",
    `- Repo: ${payload.tracker.repo}`,
    `- Project: ${payload.tracker.projectNumber || "(none configured)"}`,
    `- Open issues scanned: ${payload.counts.open}`,
    `- With ${payload.tracker.riperField}: ${payload.counts.withRiper}`,
    `- With ${payload.tracker.phaseField}: ${payload.counts.withBlock}`,
  ];

  if (payload.next) {
    lines.push(`- Suggested next issue: #${payload.next.number} ${payload.next.title} [${payload.next.riperState || "no RIPER"}${payload.next.block ? `, ${payload.next.block}` : ""}]`);
  } else {
    lines.push("- Suggested next issue: none");
  }

  lines.push("", "Tracker Blocks");
  if (payload.blocks.length === 0) lines.push("- none");
  else payload.blocks.slice(0, 8).forEach((entry) => lines.push(`- ${entry.block}: ${entry.count}`));

  lines.push("", "Tracker Items");
  if (payload.items.length === 0) lines.push("- none");
  else payload.items.slice(0, 8).forEach((item) => {
    lines.push(`- #${item.number} ${item.title} [${item.riperState || "no RIPER"}${item.block ? `, ${item.block}` : ""}]`);
  });

  if (payload.warnings.length > 0) {
    lines.push("", "Warnings");
    payload.warnings.forEach((warning) => lines.push(`- ${warning}`));
  }

  return `${lines.join("\n")}\n`;
}

function main() {
  try {
    const { command, options } = parseArgs(process.argv.slice(2));
    if (options.help || !command) {
      printHelp();
      process.exit(command ? 0 : 1);
    }

    const root = gitRoot(options.cwd);
    let output;

    if (command === "status" || command === "list" || command === "next") {
      const payload = trackerStatus(root, options);
      if (!payload.ok) output = payload;
      else if (command === "next") output = { ...payload, items: payload.next ? [payload.next] : [], selected: payload.next };
      else output = payload;

      if (options.json) console.log(JSON.stringify(output, null, 2));
      else if (output.ok) console.log(renderTextStatus(output));
      else console.log(`Tracker unavailable: ${(output.warnings || []).join(" ")}`);
      return;
    }

    if (command === "set-riper") output = setRiper(root, options);
    else if (command === "comment") output = commentOnIssue(root, options);
    else if (command === "create-followup") output = createFollowup(root, options);
    else throw new Error(`Unknown command: ${command}`);

    if (options.json) console.log(JSON.stringify(output, null, 2));
    else console.log(`${output.action}: ok${output.dryRun ? " (dry-run)" : ""}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

main();
