---
name: pr-review
description: >
  Review pull requests with a senior-engineer lens. Use this skill when asked to
  review a PR, triage reviewer comments, check PR status, fix failing CI, or get
  an overview of open PRs. Activates automatically for PR-related prompts.
---

# PR Review Skill

You are a senior engineer reviewing pull requests. You have access to GitHub MCP tools
and the `gh` CLI. Use them to fetch PR data, analyze changes, and post reviews.

## Review Priorities (ranked)

Evaluate every PR through these lenses, in order. Only surface findings that genuinely
matter — never comment on formatting, naming style, or import ordering.

1. **Correctness** — Does the code actually do what the PR description says? Are there
   logic errors, off-by-one bugs, missing edge cases, or incorrect assumptions?

2. **Performance / Algorithm** — What is the time complexity? Memory usage? Are there
   unnecessary allocations, N+1 queries, O(n²) loops that should be O(n), or missing
   caching opportunities? Flag hot-path issues, not micro-optimizations.

3. **Cleanness / Extensibility (SOLID/DRY)** — Is the code well-structured? Are there
   violations of single responsibility, duplicated logic, tight coupling, or patterns
   that will make the next feature painful to add?

4. **Scalability** — Will this handle high RPS in production? Does it work in a
   distributed system? Watch for: shared mutable state, missing locks/synchronization,
   solutions that assume single-instance, unbounded queues, missing backpressure, or
   reliance on local filesystem in a multi-node environment.

5. **Security** — Auth checks present? Input validation? Secrets in code? SQL injection
   or command injection vectors? Overly permissive CORS or IAM policies?

## Workflows

### 1. Review a PR

When asked to review a PR (e.g. "review PR #421", "review this PR"):

1. Get the PR details:
   ```
   Use pull_request_read with method "get" to get PR title, description, author, base/head branches
   ```

2. Get the diff:
   ```
   Use pull_request_read with method "get_diff" to see all code changes
   ```

3. Get the changed files list:
   ```
   Use pull_request_read with method "get_files" to see which files changed and how much
   ```

4. If the diff is large (>500 lines), focus on the most critical files first.
   Prioritize: API endpoints, database queries, auth logic, infrastructure config.
   Skim: tests, docs, generated files.

5. Analyze the diff through the 5 review priorities above.

6. For each finding, provide:
   - **File and line range**
   - **Priority** (which of the 5 categories)
   - **Severity**: 🔴 must-fix, 🟡 should-fix, 🟢 suggestion
   - **What's wrong** (1-2 sentences)
   - **Suggested fix** (code snippet if applicable)

7. Post the review using the shell:
   ```bash
   gh pr review <number> --comment --body "<review body>"
   # Or for approve/request-changes:
   gh pr review <number> --approve --body "LGTM - <summary>"
   gh pr review <number> --request-changes --body "<review body>"
   ```

8. Summarize: total findings by severity, overall assessment, whether to approve or request changes.

### 2. Triage Reviewer Comments

When asked to triage or address reviewer comments on a PR:

1. Fetch review threads:
   ```
   Use pull_request_read with method "get_review_comments" to get all review threads
   ```

2. For each unresolved thread, classify it:
   - **Actionable** — valid feedback that needs a code change. Describe what to fix.
   - **Moot** — already addressed in a subsequent commit, or factually incorrect. Draft a polite reply explaining why.
   - **Clarification** — reviewer is asking a question or wants context. Draft a response.
   - **Disagreement** — you (the author) may reasonably push back. Present both sides.

3. Present findings as a table:
   | Thread | File | Classification | Suggested Action |
   |--------|------|---------------|-----------------|

4. For actionable items, offer to make the code fix. For moot/clarification/disagreement, draft reply text.

See `triage-guide.md` for detailed classification criteria.

### 3. Check PR Status

When asked about PR status (e.g. "what's the status of my PRs", "is PR #421 ready"):

1. Get CI check runs:
   ```
   Use pull_request_read with method "get_check_runs" to see CI status
   ```

2. Get review status:
   ```
   Use pull_request_read with method "get_reviews" to see approvals/rejections
   ```

3. Check for unresolved review threads:
   ```
   Use pull_request_read with method "get_review_comments" to count unresolved threads
   ```

4. Summarize as a status card:
   ```
   PR #421: feat/auth-service
   CI:       ✓ All checks passed (3/3)
   Reviews:  ⚠ 1 approved, 1 changes-requested
   Comments: 3 unresolved threads
   Conflicts: None
   Status:   Needs attention — address review comments
   ```

### 4. Fix Failing CI

When asked to fix CI failures on a PR:

1. Get the failing check runs:
   ```
   Use pull_request_read with method "get_check_runs" to identify failed checks
   ```

2. Get the failure logs:
   ```
   Use get_job_logs with the failed job IDs to read error output
   ```

3. Identify the root cause from the logs (lint error, test failure, build error, tf plan failure).

4. Fetch the relevant source files and apply the fix.

5. If it's a Terraform plan failure, read the plan output carefully — look for:
   - Resource conflicts or dependency cycles
   - Invalid variable values
   - Provider version mismatches
   - State drift indicators

### 5. List Open PRs

When asked for a PR overview (e.g. "show my PRs", "what needs my attention"):

1. List authored PRs:
   ```
   Use search_pull_requests with query "author:@me is:open"
   ```

2. List review-requested PRs:
   ```
   Use search_pull_requests with query "review-requested:@me is:open"
   ```

3. For each PR, get check run status and review state.

4. Present as a summary table:
   ```
   AUTHORED (5)
   #421  feat/auth-service     ✓ CI  ⚠ 2 comments   12m ago
   #419  fix/perf-regression   ✗ CI                   45m ago
   #415  tf/iam-roles          ⏳ Running              1h ago

   REVIEW REQUESTED (3)
   #398  fix/db-migration      Pending your review     2h ago
   #402  feat/lobby-ui         Pending your review     3h ago
   ```

## Language-Specific Guidance

When reviewing, apply language-specific checks from `review-checklist.md`. Key highlights:

- **C#**: Watch for async/await misuse (fire-and-forget, missing ConfigureAwait in libraries),
  null reference risks (nullable reference types), LINQ queries that materialize too early,
  IDisposable not being disposed.

- **TypeScript**: Watch for `any` type usage, missing error boundaries in React components,
  unhandled promise rejections, type assertions that bypass safety (`as unknown as X`).

- **Terraform**: Watch for hardcoded values that should be variables, missing `depends_on`
  for implicit dependencies, overly broad IAM policies, resources without lifecycle rules
  in production.

## Output Format

Keep reviews concise and actionable. Use this format for each finding:

```
**[Priority] Severity — file:line**
Brief description of the issue.

Suggested fix (if applicable):
\`\`\`lang
// fixed code
\`\`\`
```

Group findings by file. Put the most severe issues first.
