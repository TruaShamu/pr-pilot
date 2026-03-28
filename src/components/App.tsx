import React, { useState, useCallback, useRef } from "react";
import { Box, Text, useInput, useApp } from "ink";
import Spinner from "ink-spinner";
import { ScrollView, type ScrollViewRef } from "ink-scroll-view";
import type { PR, Config } from "../core/types.js";
import { timeAgo } from "../core/github.js";
import {
  openInBrowser,
  mergePR,
  approvePR,
  ensureCheckout,
  checkoutExists,
  launchCopilot,
  buildReviewPrompt,
  buildFixCIPrompt,
  buildTriagePrompt,
} from "../core/actions.js";
import { usePRData } from "../hooks/usePRData.js";
import { PRList } from "./PRList.js";
import { bodyPreview } from "../core/sanitize.js";

interface AppProps {
  config: Config;
}

type Tab = "authored" | "reviewing";
type ActionStatus = { type: "idle" } | { type: "running"; label: string } | { type: "result"; message: string; color: string };
type TasksView = "hidden" | "list" | "detail";

interface CopilotJob {
  prNumber: number;
  prTitle: string;
  action: string;
  output: string[];
  status: "running" | "done" | "failed";
  outcome?: "approved" | "changes_requested" | "commented" | "fixed" | "triaged";
  exitCode?: number;
  startedAt: Date;
  finishedAt?: Date;
}

export function App({ config }: AppProps): React.ReactElement {
  const { exit } = useApp();
  const { authored, reviewing, loading, error, lastRefresh, changes, refresh } = usePRData(config);
  const [activeTab, setActiveTab] = useState<Tab>("authored");
  const [selectedPR, setSelectedPR] = useState<PR | null>(null);
  const [actionStatus, setActionStatus] = useState<ActionStatus>({ type: "idle" });
  const [jobs, setJobs] = useState<Map<number, CopilotJob>>(new Map());
  const [tasksView, setTasksView] = useState<TasksView>("hidden");
  const [tasksCursor, setTasksCursor] = useState(0);
  const [expandedJob, setExpandedJob] = useState<number | null>(null);
  const scrollRef = useRef<ScrollViewRef>(null);

  const runAction = useCallback(async (label: string, fn: () => Promise<string>) => {
    setActionStatus({ type: "running", label });
    try {
      const result = await fn();
      setActionStatus({ type: "result", message: result || `${label} complete`, color: "green" });
      setTimeout(() => setActionStatus({ type: "idle" }), 3000);
      refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Action failed";
      setActionStatus({ type: "result", message: msg, color: "red" });
      setTimeout(() => setActionStatus({ type: "idle" }), 5000);
    }
  }, [refresh]);

  const launchCopilotForPR = useCallback(async (pr: PR, promptBuilder: (pr: PR) => string, action: string) => {
    // Don't double-launch for the same PR
    const existing = jobs.get(pr.number);
    if (existing?.status === "running") return;

    const job: CopilotJob = {
      prNumber: pr.number,
      prTitle: pr.title,
      action,
      output: [],
      status: "running",
      startedAt: new Date(),
    };
    setJobs((prev) => new Map(prev).set(pr.number, job));
    setActionStatus({ type: "running", label: `${action} #${pr.number}...` });

    try {
      if (!checkoutExists(pr)) {
        await ensureCheckout(pr, config.repo);
      }

      launchCopilot({
        pr,
        prompt: promptBuilder(pr),
        repo: config.repo,
        onOutput: (data) => {
          setJobs((prev) => {
            const next = new Map(prev);
            const j = next.get(pr.number);
            if (j) next.set(pr.number, { ...j, output: [...j.output.slice(-30), data] });
            return next;
          });
        },
        onDone: (code) => {
          const ok = code === 0;
          setJobs((prev) => {
            const next = new Map(prev);
            const j = next.get(pr.number);
            if (j) {
              // Detect outcome from output
              const fullOutput = j.output.join(" ").toLowerCase();
              let outcome: CopilotJob["outcome"];
              if (ok) {
                if (fullOutput.includes("approve") || fullOutput.includes("lgtm")) outcome = "approved";
                else if (fullOutput.includes("changes requested") || fullOutput.includes("request changes")) outcome = "changes_requested";
                else if (action === "Fix CI") outcome = "fixed";
                else if (action === "Triage") outcome = "triaged";
                else outcome = "commented";
              }
              next.set(pr.number, { ...j, status: ok ? "done" : "failed", exitCode: code, finishedAt: new Date(), outcome });
            }
            return next;
          });
          setActionStatus({
            type: "result",
            message: ok ? `${action} #${pr.number} complete` : `${action} #${pr.number} failed (code ${code})`,
            color: ok ? "green" : "red",
          });
          setTimeout(() => setActionStatus({ type: "idle" }), 5000);
          refresh();
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to launch Copilot";
      setJobs((prev) => {
        const next = new Map(prev);
        next.set(pr.number, { ...job, status: "failed", output: [...job.output, msg] });
        return next;
      });
      setActionStatus({ type: "result", message: msg, color: "red" });
      setTimeout(() => setActionStatus({ type: "idle" }), 5000);
    }
  }, [refresh, config.repo, jobs]);

  useInput((input, key) => {
    if (input === "q") {
      exit();
      return;
    }
    if (key.tab) {
      setActiveTab((t) => (t === "authored" ? "reviewing" : "authored"));
      setSelectedPR(null);
    }
    if (input === "R") refresh();

    // Expanded job detail: scroll output with j/k, Esc goes back to task list
    if (expandedJob !== null) {
      if (key.escape) {
        setExpandedJob(null);
        setTasksView("list");
        return;
      }
      if (key.upArrow || input === "k") scrollRef.current?.scrollBy(-1);
      if (key.downArrow || input === "j") scrollRef.current?.scrollBy(1);
      if (key.pageUp) scrollRef.current?.scrollBy(-(scrollRef.current?.getViewportHeight?.() || 5));
      if (key.pageDown) scrollRef.current?.scrollBy(scrollRef.current?.getViewportHeight?.() || 5);
      return;
    }

    // Tasks list view: navigate with j/k, Enter to drill in, Esc to close
    if (tasksView === "list") {
      const jobList = [...jobs.values()];
      if (key.escape) {
        setTasksView("hidden");
        return;
      }
      if (key.upArrow || input === "k") {
        setTasksCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setTasksCursor((c) => Math.min(jobList.length - 1, c + 1));
        return;
      }
      if (key.return && jobList[tasksCursor]) {
        setExpandedJob(jobList[tasksCursor].prNumber);
        return;
      }
      return;
    }

    // [c] toggles tasks list
    if (input === "c" && jobs.size > 0) {
      setTasksView("list");
      setTasksCursor(0);
      return;
    }

    // Actions on selected PR
    if (selectedPR) {
      if (key.escape) {
        setSelectedPR(null);
        return;
      }
      // Navigate between PRs while detail panel is open
      if (key.upArrow || input === "k" || key.downArrow || input === "j") {
        const list = activeTab === "authored" ? authored : reviewing;
        const idx = list.findIndex((p) => p.number === selectedPR.number);
        if (idx !== -1) {
          const next = (key.upArrow || input === "k") ? idx - 1 : idx + 1;
          if (next >= 0 && next < list.length) setSelectedPR(list[next]);
        }
        return;
      }
      if (input === "o") openInBrowser(selectedPR);
      if (input === "r") launchCopilotForPR(selectedPR, (pr) => buildReviewPrompt(pr, config.repo), "Review");
      if (input === "f") launchCopilotForPR(selectedPR, (pr) => buildFixCIPrompt(pr, config.repo), "Fix CI");
      if (input === "t") launchCopilotForPR(selectedPR, (pr) => buildTriagePrompt(pr, config.repo), "Triage");
      if (input === "a") runAction("Approving", () => approvePR(selectedPR, config.repo));
      if (input === "m") runAction("Merging", () => mergePR(selectedPR, config.repo));
    }
  });

  const activePRs = activeTab === "authored" ? authored : reviewing;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue" paddingX={1}>
      {/* Header */}
      <Box justifyContent="space-between">
        <Box gap={2}>
          <Text bold inverse={activeTab === "authored"} color={activeTab === "authored" ? "blue" : undefined}>
            {" "}Authored ({authored.length}){" "}
          </Text>
          <Text bold inverse={activeTab === "reviewing"} color={activeTab === "reviewing" ? "blue" : undefined}>
            {" "}Reviewing ({reviewing.length}){" "}
          </Text>
        </Box>
        <Box gap={1}>
          {loading && (
            <Text color="yellow">
              <Spinner type="dots" />
            </Text>
          )}
          {lastRefresh && <Text dimColor>{timeAgo(lastRefresh.toISOString())}</Text>}
        </Box>
      </Box>

      {/* Error */}
      {error && (
        <Box paddingX={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {/* Action Status */}
      {actionStatus.type === "running" && (
        <Box paddingX={1} gap={1}>
          <Text color="yellow"><Spinner type="dots" /></Text>
          <Text color="yellow">{actionStatus.label}</Text>
        </Box>
      )}
      {actionStatus.type === "result" && (
        <Box paddingX={1}>
          <Text color={actionStatus.color as any}>{actionStatus.message}</Text>
        </Box>
      )}

      {/* PR List */}
      <Box flexDirection="column" marginTop={1}>
        <PRList
          prs={activePRs}
          isActive={!selectedPR}
          onSelect={(pr) => setSelectedPR(pr)}
          changes={changes}
        />
      </Box>

      {/* Selected PR Detail */}
      {selectedPR && (
        <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
          <Box justifyContent="space-between">
            <Text bold color="cyan">#{selectedPR.number} {selectedPR.title}</Text>
            <Text dimColor>by {selectedPR.author}</Text>
          </Box>
          <Text>{selectedPR.branch} → {selectedPR.baseBranch}</Text>
          <Text dimColor>{selectedPR.url}</Text>
          {selectedPR.body && (
            <Box marginTop={1} flexDirection="column">
              <Text bold>Description:</Text>
              <Text>{bodyPreview(selectedPR.body)}</Text>
            </Box>
          )}
          {selectedPR.topics.length > 0 && (
            <Text>Topics: {selectedPR.topics.join(", ")}</Text>
          )}
          <Box marginTop={1} gap={1}>
            <Text color="white">[Esc] Back</Text>
            <Text color="white">[r] Review</Text>
            <Text color={selectedPR.ci.state === "fail" ? "red" : "gray"} bold={selectedPR.ci.state === "fail"}>
              [f] Fix CI
            </Text>
            <Text color={selectedPR.unresolvedThreads > 0 ? "yellow" : "gray"} bold={selectedPR.unresolvedThreads > 0}>
              [t] Triage
            </Text>
            <Text color={activeTab === "reviewing" ? "green" : "gray"} bold={activeTab === "reviewing"}>
              [a] Approve
            </Text>
            <Text color={activeTab === "authored" && selectedPR.ci.state === "pass" && selectedPR.reviews.approved > 0 ? "green" : "gray"}
              bold={activeTab === "authored" && selectedPR.ci.state === "pass" && selectedPR.reviews.approved > 0}>
              [m] Merge
            </Text>
            <Text color="white">[o] Open</Text>
          </Box>
        </Box>
      )}

      {/* Copilot Tasks: compact summary (always visible when tasks exist and not in task view) */}
      {jobs.size > 0 && tasksView === "hidden" && expandedJob === null && (() => {
        const running = [...jobs.values()].filter((j) => j.status === "running").length;
        const done = [...jobs.values()].filter((j) => j.status === "done").length;
        const failed = [...jobs.values()].filter((j) => j.status === "failed").length;
        return (
          <Box marginTop={1} gap={1} paddingX={1}>
            <Text bold color="yellow">Tasks:</Text>
            {running > 0 && <Text color="yellow">⏳{running} running</Text>}
            {done > 0 && <Text color="green">✓{done} done</Text>}
            {failed > 0 && <Text color="red">✗{failed} failed</Text>}
            <Text dimColor>[c] view</Text>
          </Box>
        );
      })()}

      {/* Copilot Tasks: navigable list */}
      {tasksView === "list" && expandedJob === null && (
        <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="yellow" paddingX={1}>
          <Box justifyContent="space-between">
            <Text bold color="yellow">Copilot Tasks ({jobs.size})</Text>
            <Text dimColor>[j/k] navigate  [Enter] view output  [Esc] close</Text>
          </Box>
          {[...jobs.values()].map((job, idx) => {
            const selected = idx === tasksCursor;
            const elapsed = job.finishedAt
              ? `${Math.round((job.finishedAt.getTime() - job.startedAt.getTime()) / 1000)}s`
              : `${Math.round((Date.now() - job.startedAt.getTime()) / 1000)}s`;
            const outcomeText = job.outcome
              ? { approved: "Approved", changes_requested: "Changes requested", commented: "Commented", fixed: "Fixed", triaged: "Triaged" }[job.outcome]
              : job.status === "failed" ? "Failed" : job.status === "running" ? "Running..." : "Done";
            const outcomeColor = job.outcome === "approved" ? "green"
              : job.outcome === "changes_requested" ? "red"
              : job.status === "failed" ? "red"
              : job.status === "running" ? "yellow"
              : "cyan";
            return (
              <Box key={job.prNumber} gap={1} paddingX={1}>
                <Text inverse={selected} bold={selected}>
                  {selected ? "›" : " "}
                </Text>
                <Text color={job.status === "running" ? "yellow" : job.status === "done" ? "green" : "red"}>
                  {job.status === "running" ? "⏳" : job.status === "done" ? "✓" : "✗"}
                </Text>
                <Text bold inverse={selected}>#{job.prNumber}</Text>
                <Text inverse={selected}>{job.action}</Text>
                <Text color={outcomeColor} bold>{outcomeText}</Text>
                <Text dimColor>({elapsed})</Text>
                <Text dimColor>{job.prTitle.length > 30 ? job.prTitle.slice(0, 27) + "…" : job.prTitle}</Text>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Expanded Job Output (scrollable) */}
      {expandedJob !== null && jobs.has(expandedJob) && (() => {
        const job = jobs.get(expandedJob)!;
        return (
          <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="yellow" paddingX={1} height={15}>
            <Box justifyContent="space-between">
              <Text bold color="yellow">
                {job.status === "running" ? "⏳" : job.status === "done" ? "✓" : "✗"}{" "}
                #{job.prNumber} {job.action} — {job.prTitle}
              </Text>
              <Text dimColor>[j/k] scroll  [Esc] back</Text>
            </Box>
            <ScrollView ref={scrollRef} flexGrow={1}>
              {job.output.map((line, i) => (
                <Text key={i}>{line.trimEnd()}</Text>
              ))}
              {job.output.length === 0 && <Text dimColor>No output yet...</Text>}
            </ScrollView>
          </Box>
        );
      })()}

      {/* Footer */}
      <Box marginTop={1} justifyContent="center">
        <Text dimColor>
          [Tab] Switch  [j/k] Navigate  [Enter] Select  [c] Copilot output  [R] Refresh  [q] Quit
        </Text>
      </Box>
    </Box>
  );
}
