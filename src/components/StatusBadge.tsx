import React from "react";
import { Box, Text } from "ink";
import type { CIStatus, ReviewSummary } from "../core/types.js";

export function ciIcon(ci: CIStatus): string {
  switch (ci.state) {
    case "pass": return "✓";
    case "fail": return "✗";
    case "running": return "⏳";
    case "pending": return "○";
    case "none": return "·";
  }
}

export function ciColor(ci: CIStatus): string {
  switch (ci.state) {
    case "pass": return "green";
    case "fail": return "red";
    case "running": return "yellow";
    case "pending": return "gray";
    case "none": return "gray";
  }
}

export function reviewText(reviews: ReviewSummary): string {
  const parts: string[] = [];
  if (reviews.approved > 0) parts.push(`${reviews.approved} approved`);
  if (reviews.changesRequested > 0) parts.push(`${reviews.changesRequested} changes`);
  if (reviews.pending > 0) parts.push(`${reviews.pending} pending`);
  return parts.join(", ") || "No reviews";
}

export function reviewColor(reviews: ReviewSummary): string {
  if (reviews.changesRequested > 0) return "red";
  if (reviews.approved > 0) return "green";
  if (reviews.pending > 0) return "yellow";
  return "gray";
}

interface StatusBadgeProps {
  ci: CIStatus;
  reviews: ReviewSummary;
  unresolvedThreads: number;
}

export function StatusBadge({ ci, reviews, unresolvedThreads }: StatusBadgeProps): React.ReactElement {
  return (
    <Box gap={1}>
      <Text color={ciColor(ci)}>{ciIcon(ci)} CI</Text>
      <Text color={reviewColor(reviews)}>{reviewText(reviews)}</Text>
      {unresolvedThreads > 0 && (
        <Text color="yellow">💬{unresolvedThreads}</Text>
      )}
    </Box>
  );
}
