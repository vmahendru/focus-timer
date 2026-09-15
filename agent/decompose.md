# Decompose a task into focus-sized subtasks

You are helping break one piece of work into the smallest units that can each
be finished in one or two focus blocks of about 25 minutes. The result is a set
of Markdown files in a local folder. Nothing else needs to change.

## The task

File: `{{task_file}}`
Id: `{{task_id}}`
Title: {{task_title}}

Notes:

{{task_body}}

Existing subtasks:

{{existing_subtasks}}

## What to produce

Write one file per subtask into `{{tasks_dir}}`. Name files `T-NNNN.md`, starting
at `{{next_id}}` and counting up. Do not rewrite or renumber existing files.

Each file looks exactly like this:

```
---
id: T-0012
title: Read the profiler traces from last week and note the top three hotspots
status: backlog
parent: {{task_id}}
phase: research
blocks: 1
spent: 0
order: 10
jira:
github:
links:
created: 2026-09-15T10:00:00.000Z
updated: 2026-09-15T10:00:00.000Z
---
Part of: {{task_title}}

Done when: a list of the three hotspots with a number next to each is in the notes.
```

Rules:

- `phase` is one of `research`, `design`, `implement`, `verify`. Use only the
  phases this task actually needs. A small bug fix may be just `implement`
  and `verify`.
- `blocks` is 1 or 2. If a step needs more, split it further.
- Titles start with a verb and name a concrete output. "Investigate caching"
  is too vague. "Measure cache hit rate on the dashboard endpoint and write
  the number down" is right.
- Every body ends with a `Done when:` line that a reader could check without
  asking you.
- `order` goes 10, 20, 30... in the order the steps should be done.
- Keep `status: backlog`. The scheduler promotes subtasks by their parent.
- Use the current time in ISO format for `created` and `updated`.
- Do not create subtasks that duplicate the existing ones listed above.
- Aim for four to ten subtasks. If the task is already small enough to do in
  one block, say so and write nothing.

When you are done, list the files you wrote and a one-line rationale for the
phases you chose.
