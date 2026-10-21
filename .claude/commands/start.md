---
description: Start a task or a bug. Makes and pushes its branch and posts "Started" on the roadmap issue, which moves the card to In Progress. Claude Code does this by itself when a session opens off a task or bug branch; this command is the same steps on request.
argument-hint: <task or bug number in rsolar-india/roadmap>
---

Start task or bug rsolar-india/roadmap#$ARGUMENTS. Run it in the clone of the code repo the work belongs to (the current folder). Every `gh` call about the issue names `-R rsolar-india/roadmap`, because this repo is not the roadmap repo. Spec 1.1 section 13.4.

1. No number given: ask which task or bug the work is for. If there is none, offer to file one in the roadmap repo:
   - Something broken: file a bug with `gh issue create -R rsolar-india/roadmap --label bug --assignee <your login> ...` (title, severity Critical, High, Medium or Low, what happens, how to see it), then start it at once.
   - Other work that cannot wait: file a task the same way with label `task`, assigned to the person (WBS code: the next free code under the spec the person names, priority, start today, target date, Done when written so someone else can test it). Ask for every value, invent none.
   Say that an item filed by the person who works it shows as self-filed for Stephane.
2. Read the issue: `gh issue view $ARGUMENTS -R rsolar-india/roadmap --json title,state,labels,assignees,body`. Stop, and say why, if it is closed, is not labelled `task` or `bug`, or is not assigned to the person (`gh api user --jq .login`).
3. Blocked: `gh api repos/rsolar-india/roadmap/issues/$ARGUMENTS/dependencies/blocked_by --jq '.[]|select(.state=="open")|.number'`. Any number printed: stop, a blocked task cannot be started.
4. Choosing rule: list the person's other open tasks in To do (`gh issue list -R rsolar-india/roadmap --assignee @me --label task --state open`). If one has a higher priority (Urgent before High before Medium before Low) and is not blocked, say so and ask whether to go on. Going on is allowed; it shows on the board.
5. Make the branch from the latest `main` of this repo and push it straight away, before any code is written. The default branch may be `master`; use the name this repo has.
   - task: `<WBS code>-<two or three words>`, for example `1.1.15-structured-logging`
   - bug: `bug-$ARGUMENTS-<two or three words>`
   ```
   git switch main && git pull
   git switch -c <branch>
   git push -u origin <branch>
   ```
   If the working tree has uncommitted changes, stop and ask the person what to do with them first.
6. Post the start comment on the issue, exactly in this form (the status workflow reads it). The owner and repo come from `gh repo view --json nameWithOwner --jq .nameWithOwner`:
   ```
   gh issue comment $ARGUMENTS -R rsolar-india/roadmap --body $'Started\n\nBranch: <owner>/<repo>:<branch>'
   ```
   The first line is `Started`, then a line `Branch: <owner>/<repo>:<branch>`. The status workflow checks the branch exists and moves the card to In Progress. Do not move the card yourself.
7. Reply with the branch name and the Done when line of the task, so the work starts from the finish line.
