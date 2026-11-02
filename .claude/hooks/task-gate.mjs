#!/usr/bin/env node
// Roadmap task gate for Claude Code (rsolar-india). No dependencies, Node 18+.
//
// Usage (set in .claude/settings.json):
//   node task-gate.mjs session-start   SessionStart hook
//   node task-gate.mjs pre-edit        PreToolUse hook for Edit, Write, MultiEdit, NotebookEdit
//   node task-gate.mjs pre-bash        PreToolUse hook for Bash
//
// The hook input is JSON on stdin (hook_event_name, tool_name, tool_input, cwd, ...).
// Output is JSON on stdout. The script always exits 0; a refusal is a "deny" decision.
//
// Cloud routine exception: a repo that runs scheduled Claude Code cloud routines (which work on
// a detached HEAD and push their reports to main) commits .claude/task-gate.json with
// {"cloud_routines": true, "reason": "..."}. In that repo, and only when the session runs in the
// cloud (CLAUDE_CODE_REMOTE=true), edits and pushes to main are allowed. Merges stay refused.
// Local sessions in that repo, and cloud sessions in every other repo, keep the full gate.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TASK_BRANCH = /^(\d+(?:\.\d+)+)-/;
const BUG_BRANCH = /^bug-(\d+)-/;
const PROTECTED = new Set(['main', 'master']);

const NOT_ON_BRANCH_REASON =
  'Not on a task or bug branch. Ask which rsolar-india/roadmap task or bug this work is for and start it ' +
  '(.claude/commands/start.md) before changing files.';
const MERGE_REASON =
  "Merge on GitHub after the QA agent passes the task (comment 'QA pass' on the task).";
const PUSH_MAIN_REASON =
  'Never push to main. Push your task or bug branch and open a pull request whose first line is ' +
  'Refs rsolar-india/roadmap#<n>.';

function readInput() {
  try {
    const text = readFileSync(0, 'utf8');
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function git(cwd, args) {
  const full = cwd ? ['-C', cwd, ...args] : args;
  return execFileSync('git', full, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  }).trim();
}

// Returns the branch name, or null when the folder is not a git repo or git fails.
function currentBranch(cwd) {
  try {
    const b = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (b) return b;
  } catch {
    // A repo with no commit yet fails rev-parse but still has a branch name.
  }
  try {
    const b = git(cwd, ['symbolic-ref', '--short', '-q', 'HEAD']);
    if (b) return b;
  } catch {
    // Not a repo, or git is missing.
  }
  return null;
}

// True when this is a cloud session and the repo opted in through .claude/task-gate.json.
function cloudRoutineExempt(cwd) {
  if (process.env.CLAUDE_CODE_REMOTE !== 'true') return false;
  let root;
  try {
    root = git(cwd, ['rev-parse', '--show-toplevel']);
  } catch {
    root = process.env.CLAUDE_PROJECT_DIR;
  }
  if (!root) return false;
  try {
    const cfg = JSON.parse(readFileSync(join(root, '.claude', 'task-gate.json'), 'utf8'));
    return cfg !== null && typeof cfg === 'object' && cfg.cloud_routines === true;
  } catch {
    return false;
  }
}

function classify(branch) {
  let m = BUG_BRANCH.exec(branch || '');
  if (m) return { kind: 'bug', id: m[1] };
  m = TASK_BRANCH.exec(branch || '');
  if (m) return { kind: 'task', id: m[1] };
  return null;
}

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function deny(reason) {
  emit({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  });
}

// ---------------------------------------------------------------- session-start

function sessionStart(input) {
  const branch = currentBranch(input.cwd);
  let text;
  if (cloudRoutineExempt(input.cwd)) {
    text =
      'Cloud routine run: this repo opts out of the roadmap task gate for cloud sessions (.claude/task-gate.json). ' +
      'Do not ask for a roadmap task. Follow the run steps in this repo\'s CLAUDE.md. Merging with gh pr merge is still refused.';
  } else if (branch === null) {
    text =
      'The roadmap task gate could not read the git branch here (this folder is not a git repo, or git failed). ' +
      'If this is a code repo, it follows the rsolar-india roadmap rules (.claude/roadmap-rules.md): ' +
      'before changing files, ask the person which roadmap task or bug the work is for.';
  } else {
    const info = classify(branch);
    if (!info) {
      text =
        'This repo follows the rsolar-india roadmap rules (.claude/roadmap-rules.md). ' +
        `The session is on branch "${branch}", which is not a task or bug branch. ` +
        'Before doing anything else, ask the person which roadmap task or bug (rsolar-india/roadmap issue number) ' +
        'the work is for, or offer to file a bug. Then follow .claude/commands/start.md step by step: check the ' +
        'issue (open, assigned to the person, not blocked), make and push the branch from the latest main, and post ' +
        'the Started comment on the issue. Until the session is on a task or bug branch, file edits are refused.';
    } else {
      const what =
        info.kind === 'task'
          ? `task with WBS code ${info.id}. Commit subjects start with "${info.id}: "`
          : `bug #${info.id}. Commit subjects start with "bug #${info.id}: "`;
      text =
        `This repo follows the rsolar-india roadmap rules (.claude/roadmap-rules.md). The session is on branch "${branch}", the ${what}. ` +
        'Push the branch at the end of the session, and whenever the person says they are stopping, commit and push first. ' +
        'When the person says the task is done, follow .claude/commands/test-report.md. ' +
        'Never push to main. Never merge before the QA agent passes the task.';
    }
  }
  emit({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } });
}

// ---------------------------------------------------------------- pre-edit

function preEdit(input) {
  const branch = currentBranch(input.cwd);
  if (branch === null) return; // not a git repo: the gate does not apply
  if (classify(branch)) return;
  if (cloudRoutineExempt(input.cwd)) return;
  deny(NOT_ON_BRANCH_REASON);
}

// ---------------------------------------------------------------- pre-bash

// Split a shell command line into simple commands, each a list of words.
// Quotes are honoured. Separators: ; & && | || newline and brackets.
// This is a guard against mistakes, not a security boundary.
function splitCommands(line) {
  const commands = [];
  let words = [];
  let word = '';
  let inWord = false;
  let quote = null;
  const endWord = () => {
    if (inWord) words.push(word);
    word = '';
    inWord = false;
  };
  const endCommand = () => {
    endWord();
    if (words.length) commands.push(words);
    words = [];
  };
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < line.length) word += line[++i];
      else word += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      inWord = true;
    } else if (c === '\\' && i + 1 < line.length) {
      word += line[++i];
      inWord = true;
    } else if (';&|\n(){}'.includes(c)) {
      endCommand();
    } else if (c === ' ' || c === '\t' || c === '\r') {
      endWord();
    } else {
      word += c;
      inWord = true;
    }
  }
  endCommand();
  return commands;
}

const WRAPPERS = new Set(['sudo', 'env', 'command', 'time', 'exec', 'nohup', 'nice']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash']);
const GIT_OPTS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path']);
const PUSH_OPTS_WITH_VALUE = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec']);

function stripWrappers(words) {
  let i = 0;
  let afterWrapper = false;
  while (i < words.length) {
    const w = words[i];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) {
      i++;
    } else if (WRAPPERS.has(w)) {
      afterWrapper = true;
      i++;
    } else if (afterWrapper && w.startsWith('-')) {
      i++;
    } else {
      break;
    }
  }
  return words.slice(i);
}

function baseName(w) {
  return w.replace(/\\/g, '/').split('/').pop().replace(/\.exe$/i, '');
}

// Returns findings: {type: 'push', refspecs, flags, cDirs} or {type: 'merge'}.
function findRisky(line, depth = 0) {
  const found = [];
  for (const raw of splitCommands(line)) {
    const words = stripWrappers(raw);
    if (!words.length) continue;
    const cmd = baseName(words[0]);

    if (SHELLS.has(cmd) && depth < 3) {
      const ci = words.findIndex((w, i) => i > 0 && /^-[a-z]*c$/.test(w));
      if (ci > 0 && words[ci + 1]) found.push(...findRisky(words[ci + 1], depth + 1));
      continue;
    }

    if (cmd === 'gh') {
      // gh [-R repo] pr merge ...: skip the value of -R / --repo, then look for "pr merge".
      const rest = [];
      for (let j = 1; j < words.length; j++) {
        if (words[j] === '-R' || words[j] === '--repo') j++;
        else if (!words[j].startsWith('-')) rest.push(words[j]);
      }
      if (rest[0] === 'pr' && rest[1] === 'merge') found.push({ type: 'merge' });
      continue;
    }

    if (cmd === 'git') {
      const cDirs = [];
      let i = 1;
      while (i < words.length && words[i].startsWith('-')) {
        if (words[i] === '-C' && words[i + 1] !== undefined) cDirs.push(words[i + 1]);
        i += GIT_OPTS_WITH_VALUE.has(words[i]) ? 2 : 1;
      }
      if (words[i] !== 'push') continue;
      const positional = [];
      const flags = [];
      for (let j = i + 1; j < words.length; j++) {
        const w = words[j];
        if (w.startsWith('-')) {
          flags.push(w);
          if (PUSH_OPTS_WITH_VALUE.has(w)) j++;
        } else {
          positional.push(w);
        }
      }
      // positional[0] is the remote, the rest are refspecs.
      found.push({ type: 'push', refspecs: positional.slice(1), flags, cDirs });
    }
  }
  return found;
}

// Destination branch of a push refspec, e.g. "+HEAD:refs/heads/main" -> "main".
function refspecDest(spec, branch) {
  let s = spec.replace(/^\+/, '');
  const colon = s.lastIndexOf(':');
  if (colon >= 0) s = s.slice(colon + 1);
  if (s === '') return null;
  if (s === 'HEAD') return branch;
  return s.replace(/^refs\/heads\//, '');
}

function joinDir(base, dir) {
  if (/^([A-Za-z]:)?[\\/]/.test(dir)) return dir;
  return base.replace(/[\\/]+$/, '') + '/' + dir;
}

function preBash(input) {
  const command = input.tool_input && typeof input.tool_input.command === 'string' ? input.tool_input.command : '';
  if (!command) return;
  for (const item of findRisky(command)) {
    if (item.type === 'merge') {
      deny(MERGE_REASON);
      return;
    }
    let cwd = input.cwd || undefined;
    if (item.cDirs.length) {
      const dir = item.cDirs[item.cDirs.length - 1];
      cwd = cwd ? joinDir(cwd, dir) : dir;
    }
    const branch = currentBranch(cwd);
    const toMain =
      item.refspecs.some((r) => PROTECTED.has(refspecDest(r, branch))) ||
      (item.refspecs.length === 0 && branch !== null && PROTECTED.has(branch)) ||
      item.flags.includes('--mirror');
    if (toMain && !cloudRoutineExempt(cwd)) {
      deny(PUSH_MAIN_REASON);
      return;
    }
  }
}

// ---------------------------------------------------------------- main

function main() {
  const mode = process.argv[2];
  const input = readInput();
  try {
    if (mode === 'session-start') sessionStart(input);
    else if (mode === 'pre-edit') preEdit(input);
    else if (mode === 'pre-bash') preBash(input);
  } catch {
    // A broken hook must never block the person's session.
  }
}

main();
