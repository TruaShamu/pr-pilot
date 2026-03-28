import { execFile } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { CopilotClient, approveAll } from "@github/copilot-sdk";
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

// Singleton client — shared across all tasks
let _client: CopilotClient | null = null;

async function getClient(): Promise<CopilotClient> {
  if (!_client) {
    _client = new CopilotClient();
    await _client.start();
  }
  return _client;
}

export function launchCopilot(task: CopilotTask): { kill: () => void } {
  let aborted = false;
  let abortSession: (() => Promise<void>) | null = null;

  (async () => {
    try {
      const client = await getClient();
      const coPath = checkoutPath(task.pr);
      const cwd = existsSync(coPath) ? coPath : process.cwd();

      const session = await client.createSession({
        workingDirectory: cwd,
        onPermissionRequest: approveAll,
        onEvent: (event) => {
          switch (event.type) {
            case "assistant.message_delta":
              task.onOutput((event.data as any).content ?? "");
              break;
            case "assistant.message":
              task.onOutput((event.data as any).content ?? "");
              break;
            case "tool.execution_start":
              task.onOutput(`[tool] ${(event.data as any).toolName ?? "unknown"}...`);
              break;
            case "session.error":
              task.onOutput(`[error] ${(event.data as any).message ?? "unknown error"}`);
              break;
            case "assistant.intent":
              task.onOutput(`[intent] ${(event.data as any).intent ?? ""}`);
              break;
          }
        },
      });

      abortSession = () => session.abort();

      if (aborted) {
        await session.disconnect();
        return;
      }

      await session.sendAndWait(
        { prompt: task.prompt },
        300000 // 5 minute timeout
      );

      await session.disconnect();
      task.onDone(0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Copilot SDK error";
      task.onOutput(`[error] ${msg}`);
      task.onDone(1);
    }
  })();

  return {
    kill: () => {
      aborted = true;
      abortSession?.();
    },
  };
}

export function buildReviewPrompt(pr: PR, repo?: string): string {
  const repoFlag = repo ? ` --repo ${repo}` : "";
  return [
    `Review PR #${pr.number} (${pr.title}).`,
    `Focus on: 1) Correctness 2) Performance/Algorithm 3) Cleanness/SOLID 4) Scalability 5) Security.`,
    `Steps:`,
    `1. Get the diff: gh pr diff ${pr.number}${repoFlag}`,
    `2. Analyze the changes against the 5 priorities above.`,
    `3. Write a concise review summary with findings.`,
    `4. Post the review as a PR comment: gh pr review ${pr.number}${repoFlag} --comment --body "<your review>"`,
    `You MUST post the review comment. Do not just print it to stdout.`,
  ].join(" ");
}

export function buildFixCIPrompt(pr: PR, repo?: string): string {
  const repoFlag = repo ? ` --repo ${repo}` : "";
  return [
    `PR #${pr.number} has failing CI.`,
    `1. Check logs: gh pr checks ${pr.number}${repoFlag} then gh run view <run-id>${repoFlag} --log-failed`,
    `2. Identify the root cause from the logs.`,
    `3. Fix the issue in the code.`,
    `4. Commit and push to branch ${pr.branch}.`,
  ].join(" ");
}

export function buildTriagePrompt(pr: PR, repo?: string): string {
  const repoFlag = repo ? ` --repo ${repo}` : "";
  return [
    `Triage reviewer comments on PR #${pr.number}.`,
    `1. Get comments: gh pr view ${pr.number}${repoFlag} --json comments,reviews`,
    `2. Classify each as: actionable, moot, clarification-needed, or disagreement.`,
    `3. For actionable items, make the code fixes.`,
    `4. Reply to each comment with your classification and response: gh pr comment ${pr.number}${repoFlag} --body "<response>"`,
  ].join(" ");
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
