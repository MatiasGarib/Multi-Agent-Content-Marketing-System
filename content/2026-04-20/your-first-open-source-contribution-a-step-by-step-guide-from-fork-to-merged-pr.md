# Your First Open Source Contribution: A Step-by-Step Guide from Fork to Merged PR

> Generated: 2026-04-20 | Type: tutorial | Brand score: 7/10

---

## Blog post

# Your first open source contribution: a step-by-step guide from fork to merged PR

Making your first open source contribution feels intimidating. You're about to propose changes to someone else's code, in public, where everyone can see. But thousands of developers make their first contribution every day, and the process is more straightforward than you think.

This guide walks you through the complete workflow—from finding a project to seeing your pull request merged. You'll learn the technical mechanics and the unwritten rules that help your contribution get accepted.

## Find a project that matches your skill level

Your first contribution doesn't need to be a major feature. Start with something manageable that lets you learn the workflow without getting overwhelmed.

Look for repositories tagged with `good-first-issue` or `beginner-friendly`. These labels signal that maintainers have identified tasks suitable for newcomers. You can search across GitHub using queries like:

```
label:"good first issue" language:JavaScript is:open
```

Replace `JavaScript` with whatever language you're comfortable in. Sort by "recently updated" to find active projects where maintainers are likely to respond quickly.

When evaluating a repository, check these signals:

- **Recent commits**: Projects with activity in the last month are more likely to review your PR
- **Response time on issues**: Read through recent issues to see how maintainers communicate
- **Contributing guidelines**: A `CONTRIBUTING.md` file shows the project welcomes contributions and has a process in place
- **Code of conduct**: Indicates a community that values constructive interactions

Don't pick a project because it's popular. A smaller, active project with responsive maintainers will give you a better first experience than a massive repository where your PR might sit unreviewed for months.

## Set up your local development environment

Once you've found a project, you need to fork it and clone your fork locally. Forking creates your own copy of the repository where you can make changes without affecting the original.

Click the "Fork" button in the top-right corner of the repository page. GitHub creates a copy under your account.

Now clone your fork to your local machine:

```bash
git clone https://github.com/YOUR-USERNAME/project-name.git
cd project-name
```

Add the original repository as an upstream remote. This lets you pull in changes from the original project to keep your fork up to date:

```bash
git remote add upstream https://github.com/ORIGINAL-OWNER/project-name.git
```

Verify your remotes are configured correctly:

```bash
git remote -v
```

You should see `origin` pointing to your fork and `upstream` pointing to the original repository.

Before making changes, check if the project has specific setup instructions. Most projects include these in `README.md` or `CONTRIBUTING.md`. You might need to:

- Install dependencies (`npm install`, `pip install -r requirements.txt`, etc.)
- Set up a development database
- Configure environment variables
- Run tests to verify everything works

Run the test suite now, before changing anything:

```bash
npm test
# or
python -m pytest
# or whatever command the project uses
```

If tests pass on a fresh clone, you have a working baseline. If they fail, you've likely discovered an issue with the project's documentation—which could be your first contribution.

## Make your changes on a feature branch

Never commit directly to your fork's main branch. Create a feature branch for your changes. This keeps your main branch clean and makes it easy to work on multiple contributions simultaneously.

First, make sure your main branch is up to date:

```bash
git checkout main
git pull upstream main
```

Create and switch to a new branch with a descriptive name:

```bash
git checkout -b fix-typo-in-readme
```

Or if you're adding a feature:

```bash
git checkout -b add-dark-mode-toggle
```

Branch names should be lowercase with hyphens, describing what you're changing. Avoid generic names like `patch-1` or `updates`.

Now make your changes. Keep your contribution focused—fix one bug or add one feature per pull request.

If you notice other issues while working, resist the urge to fix everything at once. Create separate branches and PRs for each issue.

As you work, commit your changes in logical units:

```bash
git add path/to/changed/file.js
git commit -m "Fix off-by-one error in pagination"
```

Write clear commit messages that explain what changed and why. The first line should be 50 characters or less, written in the imperative mood ("Fix bug" not "Fixed bug" or "Fixes bug").

If you need to explain more context, add a blank line after the first line, then add more detail:

```bash
git commit -m "Fix off-by-one error in pagination

The pagination component was showing page numbers starting at 0
instead of 1. This updates the display logic to add 1 to the
internal zero-based index before showing it to users."
```

Before you push, run the test suite again to make sure your changes don't break anything:

```bash
npm test
```

If the project has a linter or formatter, run those too:

```bash
npm run lint
npm run format
```

Many projects run these checks automatically when you commit (using git hooks) or when you open a PR (using continuous integration). Catching issues locally saves time.

## Create a pull request that gets reviewed

Push your branch to your fork:

```bash
git push origin fix-typo-in-readme
```

GitHub will show a banner on your fork's page with a "Compare & pull request" button. Click it.

You'll see a form where you write your PR title and description. This is where you convince maintainers to review and merge your contribution.

**Write a clear title**: Describe what your PR does, not what the problem was. "Add error handling for network failures" is better than "Fix bug #123".

**Fill out the description template**: Many projects provide a template with questions like "What does this PR do?" and "How can reviewers test this?". Answer every question.

If there's no template, include:

- What problem this solves or what feature this adds
- How you implemented the solution
- How to test the changes
- Screenshots (for UI changes)
- Related issues (use "Fixes #123" to automatically close an issue when your PR merges)

Here's an example:

```markdown
## What this PR does

Adds error handling to the API client to show user-friendly messages
when network requests fail.

## Implementation

- Wraps all fetch() calls in try/catch blocks
- Shows a toast notification with the error message
- Logs full error details to console for debugging

## Testing

1. Start the dev server: `npm run dev`
2. Open browser DevTools and set network to "Offline"
3. Try to load data
4. You should see: "Unable to connect. Check your internet connection."

## Fixes #456
```

Be specific about how to test your changes. Reviewers are more likely to approve a PR if you make it easy for them to verify it works.

**Request review from maintainers**: Some projects assign reviewers automatically. If not, look for active maintainers in recent commits or issues and request their review.

**Respond to feedback professionally**: Maintainers will likely request changes. This is normal—even experienced contributors rarely get PRs merged without revision.

When you receive feedback:

- Thank the reviewer for their time
- Ask questions if you don't understand a suggestion
- Make the requested changes in new commits (don't force-push and rewrite history until asked)
- Reply to each comment when you've addressed it

If you disagree with feedback, explain your reasoning respectfully. Maintainers know their codebase better than you do, but they're not always right. A well-reasoned explanation might change their mind.

## What to do after your first PR

Your first contribution is a milestone, whether it gets merged or not. You've learned the workflow, you've contributed to a real project, and you've joined the open source community.

After your first PR:

- **Keep contributing**: The second PR is easier than the first. Look for more issues in the same project or explore other repositories.
- **Help other first-timers**: Answer questions in issues, review PRs, or improve documentation based on what confused you.
- **Share what you learned**: Write about your experience, give a talk at a local meetup, or mentor someone making their first contribution.

Contributing to open source isn't about code alone. Documentation, translations, issue triage, and community support are all valuable contributions. Pick what matches your skills and interests.

## Start your contribution today

You have everything you need to make your first open source contribution. Pick a project with good first issues, fork it, make your changes, and open a pull request. The hardest part is starting.

Head to the [GitHub explore page](https://github.com/explore) and filter by the `good-first-issue` topic in your preferred language. Find one issue that looks interesting, read the contributing guidelines, and claim it by commenting "I'd like to work on this." Your first merged PR starts with that comment.

---

## Twitter thread

1/6 Your first open source PR feels like public code review by strangers. Thousands of devs do it daily. Here's the exact workflow from fork to merge—technical steps and unwritten rules that get contributions accepted.

2/6 Don't pick popular repos for your first PR. A smaller, active project with responsive maintainers beats a massive repo where your PR sits unreviewed for months. Search: label:"good first issue" language:JavaScript is:open

3/6 Never commit to your fork's main branch. Always create a feature branch (git checkout -b fix-pagination-bug). Keeps main clean, lets you work on multiple PRs simultaneously, and matches what maintainers expect.

4/6 Your PR description convinces maintainers to review it. Include: what problem this solves, how you implemented it, exact steps to test your changes, and link related issues with "Fixes #123" to auto-close them on merge.

5/6 Maintainers will request changes—this is normal, not rejection. Thank reviewers, ask questions on unclear feedback, make changes in new commits. Well-reasoned disagreement is fine; they know the codebase but aren't always right.

6/6 The second PR is easier than the first. You've learned the workflow and joined the community. Start today: claim a good-first-issue, read CONTRIBUTING.md, and comment "I'd like to work on this." [full article] #OpenSource #GitHub

---

## LinkedIn

Your first open source PR doesn't need to be brilliant. It just needs to be submitted.

I've watched thousands of developers hesitate for months before making their first contribution. They wait for the "perfect" issue, the "right" project, or until they feel "ready enough."

Here's what actually works:

→ Start with projects tagged `good-first-issue` that have commits from the last month. Active maintainers = faster feedback.

→ Never commit to your fork's main branch. Always create a feature branch. This one habit will save you from merge headaches later.

→ Your PR description matters more than you think. Include exactly how to test your changes. Reviewers merge PRs they can easily verify.

The gap between "I want to contribute" and "I've contributed" is just one comment on an issue: "I'd like to work on this."

I wrote a complete walkthrough—from forking to merged PR—in our latest blog post. Link in comments.

What stopped you from making your first open source contribution? Or if you've already done it, what surprised you most about the process?

#OpenSource #GitHubTips #SoftwareDevelopment

---

## Newsletter blurb

Making your first open source contribution feels daunting when you're proposing changes to someone else's code in public. This guide walks developers through the complete workflow from finding a suitable project to getting a pull request merged. It covers how to search for repositories tagged with beginner-friendly issues, evaluate whether a project has responsive maintainers, and set up your local development environment with proper fork and upstream configurations. The article explains the mechanics of creating feature branches, writing clear commit messages, and pushing changes—but also addresses the unwritten social rules that help contributions get accepted. Developers learn how to write pull request descriptions that make reviewers' jobs easier, respond professionally to feedback, and handle the inevitable revision requests. By the end, readers will understand both the technical git commands and the communication strategies needed to claim a good-first-issue, submit a PR, and see it through to merge.
