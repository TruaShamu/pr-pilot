import React, { useState, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import Spinner from "ink-spinner";
import type { PR, Config } from "../core/types.js";
import { timeAgo } from "../core/github.js";
import {
  openInBrowser,
  mergePR,
  approvePR,
  createWorktree,
  worktreeExists,
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

export function App({ config }: AppProps): React.ReactElement {
  const { exit } = useApp();
  const { authored, reviewing, loading, error, lastRefresh, changes, refresh } = usePRData(config);
  const [activeTab, setActiveTab] = useState<Tab>("authored");
  const [selectedPR, setSelectedPR] = useState<PR | null>(null);
  const [actionStatus, setActionStatus] = useState<ActionStatus>({ type: "idle" });
  const [copilotOutput, setCopilotOutput] = useState<string[]>([]);

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

  const launchCopilotForPR = useCallback(async (pr: PR, promptBuilder: (pr: PR) => string) => {
    setCopilotOutput([]);
    setActionStatus({ type: "running", label: "Setting up worktree..." });

    try {
      if (!worktreeExists(pr)) {
        await createWorktree(pr);
      }
      setActionStatus({ type: "running", label: "Copilot working..." });

      launchCopilot({
        pr,
        prompt: promptBuilder(pr),
        onOutput: (data) => {
          setCopilotOutput((prev) => [...prev.slice(-20), data]);
        },
        onDone: (code) => {
          const ok = code === 0;
          setActionStatus({
            type: "result",
            message: ok ? "Copilot finished successfully" : `Copilot exited with code ${code}`,
            color: ok ? "green" : "red",
          });
          setTimeout(() => setActionStatus({ type: "idle" }), 5000);
          refresh();
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to launch Copilot";
      setActionStatus({ type: "result", message: msg, color: "red" });
      setTimeout(() => setActionStatus({ type: "idle" }), 5000);
    }
  }, [refresh]);

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
      if (input === "r") launchCopilotForPR(selectedPR, buildReviewPrompt);
      if (input === "f") launchCopilotForPR(selectedPR, buildFixCIPrompt);
      if (input === "t") launchCopilotForPR(selectedPR, buildTriagePrompt);
      if (input === "a") runAction("Approving", () => approvePR(selectedPR));
      if (input === "m") runAction("Merging", () => mergePR(selectedPR));
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

      {/* Copilot Output */}
      {copilotOutput.length > 0 && (
        <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="yellow" paddingX={1}>
          <Text bold color="yellow">Copilot Output</Text>
          {copilotOutput.slice(-5).map((line, i) => (
            <Text key={i} dimColor>{line.trim()}</Text>
          ))}
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1} justifyContent="center">
        <Text dimColor>
          [Tab] Switch  [j/k] Navigate  [Enter] Select  [R] Refresh  [q] Quit
        </Text>
      </Box>
    </Box>
  );
}
