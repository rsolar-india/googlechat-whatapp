# Roadmap rules for this repo

This repo follows the rsolar-india roadmap rules. The tasks and bugs live in the `rsolar-india/roadmap` repo. A hook in `.claude/hooks/task-gate.mjs` refuses file edits until the session is on a task or bug branch, and refuses pushes to `main` and `gh pr merge`.

## Rules

1. **No change without an open task or bug assigned to you.** If the work cannot wait for planning, file a bug or a task yourself in `rsolar-india/roadmap` and start it at once. It shows as self-filed for Stephane. Other needs go through a request to Akshay.
2. **Start through `.claude/commands/start.md`.** When a session opens off a task or bug branch, ask which task or bug the work is for, check it is open, assigned to you and not blocked, make the branch from the latest `main`, push it at once, and post the `Started` comment on the roadmap issue.
3. **Names.**
   - Task branch: `<WBS code>-<two or three words>`, for example `1.1.15-structured-logging`.
   - Bug branch: `bug-<bug number>-<two or three words>`, for example `bug-108-refer-analytics`.
   - Commit subjects start with the WBS code (`1.1.15: give each request a number`) or `bug #108: `.
4. **Push at the end of every session and every working day**, even unfinished work. When the person says they are stopping, commit with the WBS code and push. Pushing a branch never changes production. Work that exists only on a local machine does not count.
5. **One task per pull request**, about 800 changed lines at most (generated files and lock files not counted). A bigger change is split into several pull requests, each with its own test report.
6. **Pull request description.** The first line is `Refs rsolar-india/roadmap#<n>`. Never write Closes, Fixes or Resolves: a task closes only with a QA report.
7. **When the work is done**, follow `.claude/commands/test-report.md`: check it against the task's Done when line, post the test report on the task, and mark the pull request ready for review. Do not move the card by hand.
8. **Merge only after the QA agent passes the task** (a `QA pass` comment on the task). Never merge before it.
9. **Never push to `main`.**

The step-by-step version is `docs/guides/working-on-a-task.md` in the roadmap repo: https://github.com/rsolar-india/roadmap/blob/main/docs/guides/working-on-a-task.md
