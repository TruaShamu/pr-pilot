import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import Spinner from "ink-spinner";
import type { PR, PRFilter, Config, DEFAULT_CONFIG } from "../core/types.js";
import { listPRs, timeAgo } from "../core/github.js";
import { classifyAll } from "../core/classifier.js";
import { PRList } from "./PRList.js";

interface AppProps {
  config: Config;
}

type Tab = "authored" | "reviewing";

export function App({ config }: AppProps): React.ReactElement {
  const { exit } = useApp();
  const [activeTab, setActiveTab] = useState<Tab>("authored");
  const [authoredPRs, setAuthoredPRs] = useState<PR[]>([]);
  const [reviewingPRs, setReviewingPRs] = useState<PR[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPR, setSelectedPR] = useState<PR | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [authored, reviewing] = await Promise.all([
        listPRs("authored"),
        listPRs("review-requested"),
      ]);

      setAuthoredPRs(classifyAll(authored, config.topics, config.defaultTopic));
      setReviewingPRs(classifyAll(reviewing, config.topics, config.defaultTopic));
      setLastRefresh(new Date());
    } catch (err: any) {
      setError(err.message || "Failed to fetch PRs");
    } finally {
      setLoading(false);
    }
  }, [config]);

  // Initial load + auto-refresh
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, config.refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [refresh, config.refreshInterval]);

  useInput((input, key) => {
    if (input === "q") {
      exit();
      return;
    }
    if (key.tab) {
      setActiveTab((t) => (t === "authored" ? "reviewing" : "authored"));
    }
    if (input === "R") {
      refresh();
    }
  });

  const activePRs = activeTab === "authored" ? authoredPRs : reviewingPRs;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue" paddingX={1}>
      {/* Header */}
      <Box justifyContent="space-between">
        <Box gap={2}>
          <Text bold inverse={activeTab === "authored"} color={activeTab === "authored" ? "blue" : undefined}>
            {" "}Authored ({authoredPRs.length}){" "}
          </Text>
          <Text bold inverse={activeTab === "reviewing"} color={activeTab === "reviewing" ? "blue" : undefined}>
            {" "}Reviewing ({reviewingPRs.length}){" "}
          </Text>
        </Box>
        <Box gap={1}>
          {loading && (
            <Text color="yellow">
              <Spinner type="dots" />
            </Text>
          )}
          {lastRefresh && (
            <Text dimColor>
              {timeAgo(lastRefresh.toISOString())}
            </Text>
          )}
        </Box>
      </Box>

      {/* Error */}
      {error && (
        <Box paddingX={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {/* PR List */}
      <Box flexDirection="column" marginTop={1}>
        <PRList
          prs={activePRs}
          isActive={!selectedPR}
          onSelect={(pr) => setSelectedPR(pr)}
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
          <Box marginTop={1}>
            <Text dimColor>[Esc] Back  [r] Review  [f] Fix CI  [m] Merge  [o] Open in browser</Text>
          </Box>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1} justifyContent="center">
        <Text dimColor>
          [Tab] Switch view  [j/k] Navigate  [Enter] Select/Collapse  [R] Refresh  [q] Quit
        </Text>
      </Box>
    </Box>
  );
}
