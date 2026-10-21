---
description: Post the test report on a task or a bug and send it to QA. Every task or bug sent to QA needs one. Claude Code writes it with the person when they say the task is done; this command is the same steps on request.
argument-hint: <task or bug number in rsolar-india/roadmap>
---

Send task or bug rsolar-india/roadmap#$ARGUMENTS to QA with its test report. Run it in the code repo the work is in (the current folder). Every `gh` call about the issue names `-R rsolar-india/roadmap`. The code repo is the current one: `gh repo view --json nameWithOwner --jq .nameWithOwner`.

1. Read the issue and its Description field: `gh issue view $ARGUMENTS -R rsolar-india/roadmap --json title,body,labels` (for a bug: the Bug description and How to see it; the test is that the bug no longer happens). That is what the QA agent tests against.
2. Find the pull request for the task in this repo: `gh pr list --search "rsolar-india/roadmap#$ARGUMENTS" --state open --json number,url,isDraft,body`. Its description must contain `rsolar-india/roadmap#$ARGUMENTS`, first line `Refs rsolar-india/roadmap#$ARGUMENTS`, and never Closes, Fixes or Resolves. If there is none, stop: a task goes to QA only with a pull request. Offer to push the branch and open one.
3. Ask what was tested and how, and the result for each point of the Description. Ask for evidence: test command output, CI link, screenshots, URLs on the redesign site. Do not invent results. If a point was not tested, write that it was not tested and why. Check the work is committed and pushed.
4. Post this as a comment on the issue (the score looks for a comment by the assignee that starts with "Test report"): `gh issue comment $ARGUMENTS -R rsolar-india/roadmap --body-file <file>`.

```
## Test report

Pull request: <link>
Tested on: <where: local, CI, redesign site>
Date: <YYYY-MM-DD, India>

| Done-when point | How it was tested | Result | Evidence |
|---|---|---|---|
| <point> | <steps> | pass, fail or not tested | <link or output> |

Known gaps: <text, or none>
```

5. Mark the pull request ready for review if it is a draft: `gh pr ready <number>`. Do not move the card. The comment starts the QA agent, and the status workflow moves the task to In QA once the pull request is ready for review.
6. The QA agent answers on the task: fail sends it back to In Progress with what failed, "needs a person" asks Stephane, pass leaves a `QA pass` comment. Merge the code pull request only after that comment; the task closes once it is merged and deployed. Never merge before it.

Reply with the comment link. If any point failed, say so and ask whether to send it to QA anyway: the QA agent will fail it.
