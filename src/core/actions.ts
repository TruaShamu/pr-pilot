import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import type { PR } from "./types.js";

// --- Actions: things you can do to a PR from the TUI ---

export function openInBrowser(pr: PR): void {
  const cmd = process.platform === "win32" ? "cmd" : "open";
  const args = process.platform === "win32" ? ["/c", "start", pr.url] : [pr.url];
  execFile(cmd, args, () => {});
}

export async function mergePR(pr: PR): Promise<string> {
  return ghExec(["pr", "merge", String(pr.number), "--squash", "--auto"]);
}

export async function approvePR(pr: PR, body = "LGTM"): Promise<string> {
  return ghExec(["pr", "review", String(pr.number), "--approve", "--body", body]);
}

// --- Worktree management ---

const WORKTREE_ROOT = join(process.cwd(), ".pr-worktrees");

export function worktreePath(pr: PR): string {
  return join(WORKTREE_ROOT, `pr-${pr.number}`);
}

export function worktreeExists(pr: PR): boolean {
  return existsSync(worktreePath(pr));
}

export async function createWorktree(pr: PR): Promise<string> {
  const wtPath = worktreePath(pr);

  if (existsSync(wtPath)) {
    return wtPath;
  }

  mkdirSync(WORKTREE_ROOT, { recursive: true });

  // Fetch the PR branch first
  await gitExec(["fetch", "origin", `pull/${pr.number}/head:pr-${pr.number}`]);
  await gitExec(["worktree", "add", wtPath, `pr-${pr.number}`]);

  return wtPath;
}

export async function removeWorktree(pr: PR): Promise<void> {
  const wtPath = worktreePath(pr);
  if (!existsSync(wtPath)) return;
  await gitExec(["worktree", "remove", wtPath, "--force"]);
}

export async function listWorktrees(): Promise<string[]> {
  const raw = await gitExec(["worktree", "list", "--porcelain"]);
  return raw
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length))
    .filter((p) => p.includes(".pr-worktrees"));
}

// --- Copilot CLI headless dispatch ---

export interface CopilotTask {
  pr: PR;
  prompt: string;
  onOutput: (data: string) => void;
  onDone: (exitCode: number) => void;
}

export function launchCopilot(task: CopilotTask): { kill: () => void } {
  const wtPath = worktreePath(task.pr);
  const cwd = existsSync(wtPath) ? wtPath : process.cwd();

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

function gitExec(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { maxBuffer: 5 * 1024 * 1024 }, (err: Error | null, stdout: string, stderr: string) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
    });
  });
}
