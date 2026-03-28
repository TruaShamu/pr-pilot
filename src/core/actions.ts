import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { PR } from "./types.js";

// --- Actions: things you can do to a PR from the TUI ---

export function openInBrowser(pr: PR): void {
  const cmd = process.platform === "win32" ? "cmd" : "open";
  const args = process.platform === "win32" ? ["/c", "start", pr.url] : [pr.url];
  execFile(cmd, args, () => {});
}

export async function mergePR(pr: PR, repo?: string): Promise<string> {
  const args = ["pr", "merge", String(pr.number), "--squash", "--auto"];
  if (repo) args.push("--repo", repo);
  return ghExec(args);
}

export async function approvePR(pr: PR, repo?: string, body = "LGTM"): Promise<string> {
  const args = ["pr", "review", String(pr.number), "--approve", "--body", body];
  if (repo) args.push("--repo", repo);
  return ghExec(args);
}

// --- Checkout management ---
// For remote repos: clone via `gh repo clone` + checkout PR branch
// For local repos: use git worktrees

const CHECKOUT_ROOT = join(process.cwd(), ".pr-worktrees");

export function checkoutPath(pr: PR): string {
  return join(CHECKOUT_ROOT, `pr-${pr.number}`);
}

export function checkoutExists(pr: PR): boolean {
  return existsSync(checkoutPath(pr));
}

export async function ensureCheckout(pr: PR, repo?: string): Promise<string> {
  const coPath = checkoutPath(pr);

  if (existsSync(coPath)) {
    return coPath;
  }

  mkdirSync(CHECKOUT_ROOT, { recursive: true });

  if (repo) {
    // Remote repo: clone and checkout PR branch
    await ghExec(["repo", "clone", repo, coPath, "--", "--depth=1"]);
    await gitExec(["fetch", "origin", `pull/${pr.number}/head:pr-${pr.number}`], coPath);
    await gitExec(["checkout", `pr-${pr.number}`], coPath);
  } else {
    // Local repo: use worktree
    await gitExec(["fetch", "origin", `pull/${pr.number}/head:pr-${pr.number}`]);
    await gitExec(["worktree", "add", coPath, `pr-${pr.number}`]);
  }

  return coPath;
}

export async function removeCheckout(pr: PR, repo?: string): Promise<void> {
  const coPath = checkoutPath(pr);
  if (!existsSync(coPath)) return;
  if (repo) {
    // Clone: just remove the directory
    const rmCmd = process.platform === "win32" ? "cmd" : "rm";
    const rmArgs = process.platform === "win32"
      ? ["/c", "rmdir", "/s", "/q", coPath]
      : ["-rf", coPath];
    await new Promise<void>((resolve) => {
      execFile(rmCmd, rmArgs, () => resolve());
    });
  } else {
    await gitExec(["worktree", "remove", coPath, "--force"]);
  }
}

// --- Copilot CLI headless dispatch ---

export interface CopilotTask {
  pr: PR;
  prompt: string;
  repo?: string;
  onOutput: (data: string) => void;
  onDone: (exitCode: number) => void;
}

export function launchCopilot(task: CopilotTask): { kill: () => void } {
  const coPath = checkoutPath(task.pr);
  const cwd = existsSync(coPath) ? coPath : process.cwd();

  const child = spawn("copilot", ["-p", task.prompt], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });

  child.stdout?.on("data", (data: Buffer) => {
    task.onOutput(data.toString());
  });

  child.stderr?.on("data", (data: Buffer) => {
    task.onOutput(data.toString());
  });

  child.on("close", (code) => {
    task.onDone(code ?? 1);
  });

  return {
    kill: () => child.kill(),
  };
}

export function buildReviewPrompt(pr: PR): string {
  return `Use the /pr-review skill to review PR #${pr.number} (${pr.title}). Focus on correctness, performance, cleanness, scalability, and security.`;
}

export function buildFixCIPrompt(pr: PR): string {
  return `PR #${pr.number} has failing CI. Use the /pr-review skill to check the failing CI logs with get_job_logs, identify the root cause, and fix it. The PR branch is ${pr.branch}.`;
}

export function buildTriagePrompt(pr: PR): string {
  return `Use the /pr-review skill to triage the reviewer comments on PR #${pr.number}. Classify each as actionable, moot, clarification, or disagreement. Suggest responses and code fixes.`;
}

// --- Helpers ---

function ghExec(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("gh", args, { maxBuffer: 5 * 1024 * 1024 }, (err: Error | null, stdout: string, stderr: string) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
    });
  });
}

function gitExec(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { maxBuffer: 5 * 1024 * 1024, cwd }, (err: Error | null, stdout: string, stderr: string) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
    });
  });
}
