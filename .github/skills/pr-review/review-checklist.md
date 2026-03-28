# Review Checklist by Language

Reference for language-specific patterns to check during PR review.
The skill loads this file when reviewing code in these languages.

## C# / .NET

### Correctness
- Async methods that don't await (fire-and-forget without explicit intent)
- `Task.Result` or `.Wait()` causing deadlocks in async context
- Missing null checks on API/database responses (check nullable reference type annotations)
- LINQ `.First()` without `.FirstOrDefault()` where empty collections are possible
- String comparison without `StringComparison.Ordinal` or culture-aware variant
- Off-by-one in array/span slicing

### Performance
- LINQ `.ToList()` called prematurely — materializing before filtering
- N+1 query patterns in Entity Framework (missing `.Include()`)
- Allocations in hot loops (string concatenation instead of StringBuilder, boxing value types)
- Missing `ConfigureAwait(false)` in library code (not needed in app code)
- Large object allocations (>85KB) that pressure LOH

### Cleanness / SOLID
- God classes — single class doing too much
- Interface segregation — overly broad interfaces
- Missing dependency injection (newing up services directly)
- Violating open/closed — switch statements that need modification for each new case

### Scalability
- `static` mutable state — breaks in multi-instance deployment
- `HttpClient` created per-request instead of using `IHttpClientFactory`
- Missing cancellation token propagation in async chains
- In-memory caching without distributed cache fallback
- Lock contention — `lock()` in high-throughput paths

### Security
- SQL string concatenation (use parameterized queries)
- Missing `[Authorize]` attributes on controllers/endpoints
- Secrets in `appsettings.json` instead of Key Vault / env vars
- Overly permissive CORS configuration

---

## TypeScript / React

### Correctness
- `any` type usage — bypasses type safety entirely
- Type assertions (`as X`) that could mask runtime errors
- Unhandled promise rejections (missing `.catch()` or try/catch in async)
- React useEffect missing dependencies in dependency array
- React useState with stale closure captures

### Performance
- Unnecessary re-renders (missing `React.memo`, `useMemo`, `useCallback`)
- Large bundle imports (`import _ from 'lodash'` instead of `import get from 'lodash/get'`)
- Synchronous operations blocking event loop (large JSON parse, file I/O)
- Missing pagination on API calls that return unbounded lists

### Cleanness / SOLID
- Components doing too much (>200 lines = likely needs splitting)
- Business logic in components instead of hooks/services
- Prop drilling more than 2 levels deep (use context or state management)
- Duplicated fetch/transform logic across components

### Scalability
- Client-side state that should be server-side (source of truth confusion)
- WebSocket connections without reconnection/backoff logic
- API calls without retry/timeout
- Unbounded client-side caching (memory leak)

### Security
- `dangerouslySetInnerHTML` without sanitization
- User input rendered without escaping
- API keys in client-side code
- Missing CSRF protection on state-changing requests

---

## Terraform / Infrastructure

### Correctness
- Resource dependencies that aren't explicit (`depends_on` missing for implicit ordering)
- Count/for_each based on values that aren't known at plan time
- Data sources that assume resources exist before they're created
- Module version pins missing (floating versions = non-reproducible plans)

### Performance
- Overly broad data source queries (fetching all resources when one is needed)
- Missing parallelism constraints for API-rate-limited providers

### Cleanness / SOLID
- Hardcoded values that should be variables
- Duplicated resource blocks that should be modules or for_each
- Inconsistent naming conventions across resources
- Missing descriptions on variables and outputs

### Scalability
- Single-region resources without multi-region consideration
- Fixed instance sizes without autoscaling configuration
- Missing lifecycle rules (`prevent_destroy`, `create_before_destroy`)
- No state locking configuration for team usage

### Security
- Overly permissive IAM policies (`"Action": "*"`, `"Resource": "*"`)
- Security groups with `0.0.0.0/0` ingress on non-public ports
- Missing encryption at rest / in transit
- Secrets in Terraform variables without `sensitive = true`
- Missing `checkov` or `tfsec` scan references

---

## General (All Languages)

### Red Flags (always flag these)
- TODO/FIXME/HACK comments in production code without tracking issue
- Empty catch/except blocks that swallow errors silently
- Commented-out code blocks (should be removed, not committed)
- Magic numbers without named constants
- Missing error handling on I/O operations (network, disk, database)

### Green Flags (note these positively)
- Good test coverage for the changed code
- Clear commit messages that explain *why*
- Documentation updated alongside code changes
- Feature flags for risky changes
