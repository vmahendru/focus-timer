---
name: focus-decompose
description: Break a Focus board task into focus-sized subtask files. Use when the user asks to decompose, break down, or plan a task from their Focus workspace (~/Focus/tasks), or names a task id like T-0007.
---

# Focus: decompose a task

The user keeps their work as Markdown files, one per task, in a Focus
workspace. Default location: `~/Focus/tasks`. If `FOCUS_WORKSPACE` is set,
use `$FOCUS_WORKSPACE/tasks` instead.

1. Find the task. If the user gave an id, read `<tasks>/<id>.md`. If they gave
   words, grep titles in the folder and confirm the match.
2. Read the sibling files to learn the format and to avoid duplicating
   existing subtasks (files whose `parent:` is this id).
3. Follow the instructions in `agent/decompose.md` from the Focus repository
   exactly: one file per subtask, ids continuing from the highest existing
   `T-NNNN`, phases only where needed, `blocks` of 1 or 2, a verb-first title,
   and a `Done when:` line.
4. Do not run any server or call any network service. Writing files is the
   whole job. The board picks up changes on its own.
5. Finish by listing the files written.
