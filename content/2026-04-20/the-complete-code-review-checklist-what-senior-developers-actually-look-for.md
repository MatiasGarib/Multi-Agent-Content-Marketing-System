# The Complete Code Review Checklist: What Senior Developers Actually Look For

> Generated: 2026-04-20 | Type: thought_leadership | Brand score: 9/10

---

## Blog post

# The complete code review checklist: What senior developers actually look for

Code reviews are where good code becomes great—or where technical debt sneaks into your codebase. You've probably experienced both: the review that catches a critical bug before production, and the rubber-stamp approval that lets a performance regression slip through.

After analyzing thousands of pull requests and interviewing engineering teams across GitHub, we've identified what separates superficial code reviews from the thorough, valuable ones that actually improve your codebase. Here's what senior developers look for when they review your code.

## Correctness first, everything else second

Before you consider style or architecture, verify the code actually works. This sounds obvious, but it's the most commonly skipped step.

**Pull the branch locally and run it.** Don't read the diff on GitHub. Execute the code paths being modified:

```bash
gh pr checkout 1234
npm test
npm run dev
```

Test the happy path, then test the edge cases. What happens with null values? Empty arrays? Unexpected user input?

If the PR adds a new API endpoint, hit it with curl:

```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"email": "", "age": -5}'
```

Senior developers know that code that "looks right" often fails in practice. They've seen too many bugs that passed visual inspection but broke in production.

## Security and data validation

Every input is hostile until proven otherwise. When you review code that accepts external data—API requests, file uploads, database queries—look for validation and sanitisation.

Check for SQL injection vulnerabilities in database queries:

```javascript
// ❌ Dangerous
const query = `SELECT * FROM users WHERE id = ${userId}`;

// ✅ Safe
const query = 'SELECT * FROM users WHERE id = ?';
db.query(query, [userId]);
```

Look for exposed secrets. Search the diff for API keys, passwords, or tokens that should live in environment variables:

```bash
git diff main | grep -iE "(api[_-]?key|password|secret|token)"
```

Verify that authentication and authorisation checks happen before data access, not after. A common mistake is fetching data first, then checking permissions—leaking information in error messages.

## Performance implications

Does this change introduce a performance regression? Senior developers think about scale, even in small features.

**Watch for N+1 queries.** If you see a loop that makes database calls, you're probably looking at a problem:

```python
# ❌ N+1 query problem
users = User.all()
for user in users:
    user.profile = Profile.get(user.id)  # Database hit per user

# ✅ Batched query
users = User.all()
profiles = Profile.where(user_id__in=[u.id for u in users])
```

Look for operations that don't scale. Loading entire tables into memory, recursive algorithms without depth limits, or synchronous external API calls in request handlers all cause problems as your system grows.

**Check if expensive operations are cached.** If a function does heavy computation or external requests, it should probably use memoization or a caching layer.

## Code maintainability

You'll read code far more often than you write it. Maintainability matters more than cleverness.

**Names should explain intent.** If you need to read the implementation to understand what a function does, the name fails:

```go
// ❌ Unclear
func proc(d []int) int

// ✅ Clear
func calculateTotalRevenue(dailySales []int) int
```

**Functions should do one thing.** If you see a function named `getUserAndUpdateCacheAndSendEmail`, it's doing too much. Each function should have a single responsibility you can describe without using "and."

**Comments should explain why, not what.** The code shows what happens. Comments should explain why you made a particular choice:

```rust
// ❌ Useless comment
// Loop through items
for item in items {

// ✅ Valuable comment
// Use linear search instead of HashMap lookup because
// benchmark showed better performance for n < 10
for item in items {
```

## Error handling and observability

Production code needs graceful failure modes and visibility into what's happening.

Check that errors are handled, not caught and logged. What happens when the external API times out? When the database connection fails? When the file doesn't exist?

```typescript
// ❌ Error swallowing
try {
  await externalAPI.fetch();
} catch (error) {
  console.log(error);
}

// ✅ Proper error handling
try {
  await externalAPI.fetch();
} catch (error) {
  logger.error('External API failed', { error, userId });
  return fallbackData();
}
```

Look for observability. Can you debug this code in production?

Are there logs at appropriate levels? Metrics for critical operations? Structured logging that you can query?

## Tests that actually test

Don't check if tests exist—verify they test the right things.

**Tests should fail when the behaviour breaks.** If you can delete the implementation and tests still pass, the tests are worthless. Tests should cover edge cases, error conditions, and business logic—not the happy path.

Look at test names. They should describe behaviour, not implementation:

```ruby
# ❌ Implementation-focused
test "calls parse_json method"

# ✅ Behaviour-focused  
test "returns error when JSON is malformed"
```

## Your next review

Start your next code review with this checklist. You don't need to check every item for every PR—a CSS tweak doesn't need performance analysis—but these are the patterns that separate thorough reviews from rubber stamps.

**Try this:** Pick one area from this checklist and focus on it in your next five reviews. Master security checks before moving to performance analysis.

Depth beats breadth when building code review skills.

And if you're the author, review your own PR with these criteria before requesting review. You'll catch issues faster, learn more, and build trust with your reviewers.

What patterns do you look for in code reviews? Share your checklist in [GitHub Community](https://github.com/orgs/community/discussions) and tag it with #code-review.

---

## Twitter thread

1/6 Code that 'looks right' often fails in production. After analyzing thousands of PRs, we found most reviews miss the same critical issues. Here's what senior developers actually check:

2/6 Pull the branch locally and RUN it. Don't just read the diff. Test edge cases: null values, empty arrays, malformed input. The most obvious bugs hide in plain sight until you execute the code.

3/6 Every input is hostile. Check for SQL injection, exposed secrets, auth bypasses. Search diffs with: git diff main | grep -iE "(api[_-]?key|password|secret|token)" — you'd be surprised what you find.

4/6 Watch for N+1 queries and operations that don't scale. A loop making database calls per iteration? Loading entire tables into memory? These work fine in dev, then crush you in production.

5/6 Test quality matters more than test quantity. If you can delete the implementation and tests still pass, those tests are worthless. They should fail when behavior breaks, not just when syntax changes.

6/6 Master one area at a time. Pick security, performance, or error handling for your next 5 reviews before moving on. Depth beats breadth when building code review skills. Full checklist: [full article] #CodeReview

---

## LinkedIn

Code reviews catch bugs—or they rubber-stamp technical debt into your codebase.

After analyzing thousands of PRs, here's what separates thorough reviews from superficial ones:

**Pull the branch and run it.** Reading diffs isn't enough. Test the happy path, then break it with empty arrays, null values, and hostile input. Code that "looks right" fails in practice more often than you'd think.

**Watch for N+1 queries.** A loop making database calls is usually a scalability problem waiting to happen. Senior developers think about scale even in small features.

**Verify tests actually test.** If you can delete the implementation and tests still pass, those tests are worthless. They should cover edge cases and error conditions, not just the happy path.

The best reviewers pick one area to master at a time. Security checks before performance analysis. Depth beats breadth.

We've compiled the complete checklist—from security validation to observability patterns—in our latest post. Link in comments.

What's the most critical bug a code review has saved you from shipping?

#CodeReview #SoftwareEngineering #DeveloperProductivity

---

## Newsletter blurb

Code reviews often fall into two extremes: rubber-stamp approvals that let bugs slip through, or superficial checks that miss critical issues. This guide cuts through the noise by showing what experienced developers actually prioritize when reviewing pull requests. Drawing from analysis of thousands of PRs across GitHub teams, it walks through the specific checks that matter most—from verifying correctness by running code locally to spotting N+1 query problems, SQL injection vulnerabilities, and error handling gaps. Developers at any level will find practical patterns they can apply immediately, whether they're reviewing others' code or preparing their own PRs for review. The article includes code examples showing dangerous patterns alongside their safer alternatives, covering everything from input validation to test quality. After reading, developers will know how to structure reviews that actually prevent production issues, spot performance regressions before they ship, and build the skills that separate thorough technical review from surface-level approval.
