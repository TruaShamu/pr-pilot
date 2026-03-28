import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { PR } from "../core/types.js";
import type { TopicGroup } from "../core/classifier.js";
import { groupByTopic } from "../core/classifier.js";
import { ciIcon, ciColor, reviewText, reviewColor } from "./StatusBadge.js";
import { timeAgo } from "../core/github.js";

interface PRListProps {
  prs: PR[];
  isActive: boolean;
  onSelect: (pr: PR) => void;
}

export function PRList({ prs, isActive, onSelect }: PRListProps): React.ReactElement {
  const groups = groupByTopic(prs);
  const flatItems = buildFlatList(groups);
  const [cursor, setCursor] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const visibleItems = flatItems.filter(
    (item) => item.type === "header" || !collapsed.has(item.topic)
  );

  useInput(
    (input, key) => {
      if (!isActive) return;

      if (key.upArrow || input === "k") {
        setCursor((c) => Math.max(0, c - 1));
      } else if (key.downArrow || input === "j") {
        setCursor((c) => Math.min(visibleItems.length - 1, c + 1));
      } else if (key.return) {
        const item = visibleItems[cursor];
        if (item?.type === "header") {
          setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(item.topic)) next.delete(item.topic);
            else next.add(item.topic);
            return next;
          });
        } else if (item?.type === "pr" && item.pr) {
          onSelect(item.pr);
        }
      }
    },
    { isActive }
  );

  if (prs.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor>No PRs</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {visibleItems.map((item, idx) => {
        const selected = isActive && idx === cursor;

        if (item.type === "header") {
          const icon = collapsed.has(item.topic) ? "▸" : "▾";
          return (
            <Box key={`h-${item.topic}`} paddingX={1}>
              <Text bold inverse={selected}>
                {icon} {item.topic} ({item.count})
              </Text>
            </Box>
          );
        }

        const pr = item.pr!;
        return (
          <Box key={`pr-${pr.number}`} paddingX={2} gap={1}>
            <Text inverse={selected} bold={selected}>
              {selected ? "›" : " "}
            </Text>
            <Text color="cyan" inverse={selected}>#{pr.number}</Text>
            <Text inverse={selected}>
              {pr.branch.length > 25 ? pr.branch.slice(0, 22) + "…" : pr.branch}
            </Text>
            <Text color={ciColor(pr.ci)} inverse={selected}>{ciIcon(pr.ci)}</Text>
            <Text color={reviewColor(pr.reviews)} inverse={selected}>
              {reviewText(pr.reviews)}
            </Text>
            {pr.unresolvedThreads > 0 && (
              <Text color="yellow" inverse={selected}>💬{pr.unresolvedThreads}</Text>
            )}
            <Text dimColor inverse={selected}>{timeAgo(pr.updatedAt)}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

interface FlatItem {
  type: "header" | "pr";
  topic: string;
  count?: number;
  pr?: PR;
}

function buildFlatList(groups: TopicGroup[]): FlatItem[] {
  const items: FlatItem[] = [];
  for (const group of groups) {
    items.push({ type: "header", topic: group.topic, count: group.prs.length });
    for (const pr of group.prs) {
      items.push({ type: "pr", topic: group.topic, pr });
    }
  }
  return items;
}
