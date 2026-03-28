import type { PR, TopicConfig } from "./types.js";

export function classifyPR(pr: PR, topics: TopicConfig, defaultTopic: string): string[] {
  const matched = new Set<string>();

  for (const file of pr.files) {
    for (const [topic, prefixes] of Object.entries(topics)) {
      for (const prefix of prefixes) {
        if (prefix.startsWith("*.")) {
          // Glob extension match
          if (file.endsWith(prefix.slice(1))) {
            matched.add(topic);
          }
        } else if (file.startsWith(prefix) || file.includes("/" + prefix)) {
          matched.add(topic);
        }
      }
    }
  }

  if (matched.size === 0) matched.add(defaultTopic);
  return [...matched];
}

export function classifyAll(prs: PR[], topics: TopicConfig, defaultTopic: string): PR[] {
  return prs.map((pr) => ({
    ...pr,
    topics: classifyPR(pr, topics, defaultTopic),
  }));
}

export interface TopicGroup {
  topic: string;
  prs: PR[];
}

export function groupByTopic(prs: PR[]): TopicGroup[] {
  const groups = new Map<string, PR[]>();

  for (const pr of prs) {
    for (const topic of pr.topics) {
      if (!groups.has(topic)) groups.set(topic, []);
      groups.get(topic)!.push(pr);
    }
  }

  // Sort: named topics first alphabetically, "Other" last
  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b);
    })
    .map(([topic, prs]) => ({ topic, prs }));
}
