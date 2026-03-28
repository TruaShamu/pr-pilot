import { execFile } from "node:child_process";
import type { PR, CIStatus, CIState, ReviewSummary, PRFilter } from "./types.js";

function gh(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("gh", args, { maxBuffer: 10 * 1024 * 1024 }, (err: Error | null, stdout: string, stderr: string) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
    });
  });
}

interface GHPullRequest {
  number: number;
  title: string;
  author: { login: string };
  headRefName: string;
  baseRefName: string;
  url: string;
  updatedAt: string;
  isDraft: boolean;
  files?: { path: string }[];
  statusCheckRollup?: { state: string }[];
  reviews?: { nodes: { state: string }[] };
  reviewThreads?: { nodes: { isResolved: boolean }[] };
  mergeable?: string;
}

const PR_FIELDS = [
  "number",
  "title",
  "author",
  "headRefName",
  "baseRefName",
  "url",
  "updatedAt",
  "isDraft",
].join(",");

export async function listPRs(filter: PRFilter): Promise<PR[]> {
  const searchQuery = filter === "authored"
    ? "author:@me state:open"
    : "review-requested:@me state:open";

  const raw = await gh([
    "pr", "list",
    "--search", searchQuery,
    "--json", PR_FIELDS,
    "--limit", "50",
  ]);

  if (!raw) return [];
  const items: GHPullRequest[] = JSON.parse(raw);

  const prs: PR[] = await Promise.all(
    items.map(async (item) => {
      const [ci, reviews, files, threads] = await Promise.all([
        getCIStatus(item.number),
        getReviewSummary(item.number),
        getFiles(item.number),
        getUnresolvedThreadCount(item.number),
      ]);

      return {
        number: item.number,
        title: item.title,
        author: item.author.login,
        branch: item.headRefName,
        baseBranch: item.baseRefName,
        url: item.url,
        updatedAt: item.updatedAt,
        isDraft: item.isDraft,
        files,
        ci,
        reviews,
        unresolvedThreads: threads,
        mergeable: true,
        topics: [],
      };
    })
  );

  return prs;
}

export async function getCIStatus(prNumber: number): Promise<CIStatus> {
  try {
    const raw = await gh([
      "pr", "checks", String(prNumber),
      "--json", "name,state,conclusion",
    ]);
    if (!raw) return { state: "none", total: 0, passed: 0, failed: 0, running: 0 };

    const checks: { state: string; conclusion: string }[] = JSON.parse(raw);
    const total = checks.length;
    const passed = checks.filter((c) => c.conclusion === "SUCCESS" || c.conclusion === "success").length;
    const failed = checks.filter((c) => c.conclusion === "FAILURE" || c.conclusion === "failure").length;
    const running = checks.filter((c) => c.state === "IN_PROGRESS" || c.state === "QUEUED" || c.state === "PENDING").length;

    let state: CIState = "none";
    if (total === 0) state = "none";
    else if (failed > 0) state = "fail";
    else if (running > 0) state = "running";
    else if (passed === total) state = "pass";
    else state = "pending";

    return { state, total, passed, failed, running };
  } catch {
    return { state: "none", total: 0, passed: 0, failed: 0, running: 0 };
  }
}

export async function getReviewSummary(prNumber: number): Promise<ReviewSummary> {
  try {
    const raw = await gh([
      "pr", "view", String(prNumber),
      "--json", "reviews",
    ]);
    if (!raw) return { approved: 0, changesRequested: 0, commented: 0, pending: 0 };

    const data: { reviews: { state: string; author: { login: string } }[] } = JSON.parse(raw);

    // Deduplicate: only keep latest review per author
    const latest = new Map<string, string>();
    for (const r of data.reviews) {
      latest.set(r.author.login, r.state);
    }

    let approved = 0, changesRequested = 0, commented = 0, pending = 0;
    for (const state of latest.values()) {
      if (state === "APPROVED") approved++;
      else if (state === "CHANGES_REQUESTED") changesRequested++;
      else if (state === "COMMENTED") commented++;
      else if (state === "PENDING") pending++;
    }

    return { approved, changesRequested, commented, pending };
  } catch {
    return { approved: 0, changesRequested: 0, commented: 0, pending: 0 };
  }
}

export async function getFiles(prNumber: number): Promise<string[]> {
  try {
    const raw = await gh([
      "pr", "view", String(prNumber),
      "--json", "files",
    ]);
    if (!raw) return [];
    const data: { files: { path: string }[] } = JSON.parse(raw);
    return data.files.map((f) => f.path);
  } catch {
    return [];
  }
}

export async function getUnresolvedThreadCount(prNumber: number): Promise<number> {
  try {
    const raw = await gh([
      "pr", "view", String(prNumber),
      "--json", "reviewThreads",
    ]);
    if (!raw) return 0;
    const data: { reviewThreads: { isResolved: boolean }[] } = JSON.parse(raw);
    return data.reviewThreads.filter((t) => !t.isResolved).length;
  } catch {
    return 0;
  }
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
