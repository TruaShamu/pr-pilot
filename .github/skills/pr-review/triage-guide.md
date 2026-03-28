# Reviewer Comment Triage Guide

When triaging reviewer comments on a PR, classify each unresolved thread into one of
these categories. This helps the PR author (or Copilot acting on their behalf) respond
efficiently.

## Classification Categories

### Actionable
The reviewer identified a genuine issue that needs a code change.

**Indicators:**
- Points to a concrete bug, missing edge case, or logic error
- Suggests a better algorithm, pattern, or approach with clear reasoning
- Identifies a security vulnerability or performance regression
- References a team standard or convention that was violated

**Response:** Make the code fix. If the fix is non-trivial, describe the approach before implementing.

### Moot
The comment is no longer relevant or is based on a misunderstanding.

**Indicators:**
- The issue was already fixed in a subsequent commit
- The reviewer misread the code or missed context from another file
- The comment references code that was already refactored/removed
- The concern is about something outside the scope of this PR

**Response:** Reply politely explaining why it's moot. Be specific:
- "This was addressed in commit abc123 — I moved the null check to line 42."
- "This is actually handled by the base class — see `FooBase.cs:89`."

Do NOT be dismissive. Always link to the evidence.

### Clarification
The reviewer is asking a question, not requesting a change.

**Indicators:**
- Phrased as a question ("Why did you...?", "What happens if...?")
- Asking about intent, design decision, or context
- Not necessarily suggesting the code is wrong

**Response:** Answer the question clearly. If the answer reveals something non-obvious about the code, consider adding a code comment to prevent the same question in future reviews.

### Disagreement
The reviewer suggests a change, but the author may reasonably push back.

**Indicators:**
- Style/taste difference with no clear correctness impact
- Trade-off where the reviewer prefers a different point on the spectrum
- The reviewer's suggestion would fix one thing but break/complicate another
- Architectural disagreement that should be discussed, not unilaterally resolved

**Response:** Present both sides concisely:
1. What the reviewer suggests and why it has merit
2. Why the current approach was chosen
3. What trade-offs each option has

Let the author decide whether to accept, push back, or escalate to a team discussion.

## Triage Output Format

Present results as a table, then expand on each:

```
| # | File:Line | Category | Summary | Action |
|---|-----------|----------|---------|--------|
| 1 | auth.cs:42 | Actionable | Missing null check on token | Fix: add null guard |
| 2 | api.ts:15 | Moot | "No error handling" | Already added in abc123 |
| 3 | main.tf:88 | Clarification | "Why not use for_each?" | Explain: count is dynamic |
| 4 | service.cs:200 | Disagreement | Singleton vs Scoped | Present trade-offs |
```

Then for each item, provide the full response text ready to post as a reply.

## Priority for Addressing

1. Actionable items with 🔴 severity — fix these first
2. Actionable items with 🟡 severity — fix before requesting re-review
3. Clarifications — reply to unblock the reviewer
4. Moot items — reply to close the thread
5. Disagreements — present analysis, let author decide

## Anti-patterns to Avoid

- **Don't be defensive** — even if a comment is moot, respond graciously
- **Don't batch-dismiss** — address each thread individually
- **Don't ignore comments** — every thread deserves a response, even if it's "good catch, fixed"
- **Don't over-explain** — keep replies concise. Link to code/commits instead of paragraphs
