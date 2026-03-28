export interface PR {
  number: number;
  title: string;
  author: string;
  branch: string;
  baseBranch: string;
  url: string;
  updatedAt: string;
  isDraft: boolean;
  files: string[];
  ci: CIStatus;
  reviews: ReviewSummary;
  unresolvedThreads: number;
  mergeable: boolean;
  topics: string[];
}

export type CIState = "pass" | "fail" | "running" | "pending" | "none";

export interface CIStatus {
  state: CIState;
  total: number;
  passed: number;
  failed: number;
  running: number;
}

export interface ReviewSummary {
  approved: number;
  changesRequested: number;
  commented: number;
  pending: number;
}

export type PRFilter = "authored" | "review-requested";

export interface TopicConfig {
  [topic: string]: string[]; // topic name -> path prefixes
}

export interface Config {
  topics: TopicConfig;
  defaultTopic: string;
  refreshInterval: number; // seconds
  owner?: string;
  repo?: string;
}

export const DEFAULT_CONFIG: Config = {
  topics: {
    Infra: ["terraform/", "infra/", ".github/workflows/"],
    Services: ["services/", "src/api/", "src/server/"],
    UI: ["ui/", "src/components/", "src/pages/"],
    Docs: ["docs/"],
  },
  defaultTopic: "Other",
  refreshInterval: 30,
};
