import { useState, useEffect, useCallback, useRef } from "react";
import type { PR, PRFilter, Config } from "../core/types.js";
import { listPRs } from "../core/github.js";
import { classifyAll } from "../core/classifier.js";

export interface PRData {
  authored: PR[];
  reviewing: PR[];
  loading: boolean;
  error: string | null;
  lastRefresh: Date | null;
  changes: ChangeSet;
  refresh: () => Promise<void>;
}

export interface ChangeSet {
  newPRs: Set<number>;
  ciChanged: Set<number>;
  newComments: Set<number>;
}

const EMPTY_CHANGES: ChangeSet = {
  newPRs: new Set(),
  ciChanged: new Set(),
  newComments: new Set(),
};

export function usePRData(config: Config): PRData {
  const [authored, setAuthored] = useState<PR[]>([]);
  const [reviewing, setReviewing] = useState<PR[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [changes, setChanges] = useState<ChangeSet>(EMPTY_CHANGES);
  const prevState = useRef<Map<number, { ci: string; threads: number }>>(new Map());

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rawAuthored, rawReviewing] = await Promise.all([
        listPRs("authored", config.repo),
        listPRs("review-requested", config.repo),
      ]);

      const allAuthored = classifyAll(rawAuthored, config.topics, config.defaultTopic);
      const allReviewing = classifyAll(rawReviewing, config.topics, config.defaultTopic);

      // Diff against previous state
      const allPRs = [...allAuthored, ...allReviewing];
      const prev = prevState.current;
      const newChanges: ChangeSet = {
        newPRs: new Set(),
        ciChanged: new Set(),
        newComments: new Set(),
      };

      for (const pr of allPRs) {
        const old = prev.get(pr.number);
        if (!old) {
          newChanges.newPRs.add(pr.number);
        } else {
          if (old.ci !== pr.ci.state) newChanges.ciChanged.add(pr.number);
          if (old.threads !== pr.unresolvedThreads) newChanges.newComments.add(pr.number);
        }
      }

      // Update prev state
      const next = new Map<number, { ci: string; threads: number }>();
      for (const pr of allPRs) {
        next.set(pr.number, { ci: pr.ci.state, threads: pr.unresolvedThreads });
      }
      prevState.current = next;

      setChanges(newChanges);
      setAuthored(allAuthored);
      setReviewing(allReviewing);
      setLastRefresh(new Date());

      // Clear change highlights after 5 seconds
      setTimeout(() => setChanges(EMPTY_CHANGES), 5000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch PRs");
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, config.refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [refresh, config.refreshInterval]);

  return { authored, reviewing, loading, error, lastRefresh, changes, refresh };
}
