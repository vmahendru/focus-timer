# Groom the board

Look through the task files in `{{tasks_dir}}` and tidy them so the next
focus block is obvious. Read every `.md` file there first.

Do these things, and only these:

1. Any top-level task in `doing` or `next` with no subtasks and `blocks` above
   2: decompose it following `decompose.md`.
2. Any subtask with a vague title or no `Done when:` line: rewrite the title to
   start with a verb and name an output, and add the line.
3. Any task whose subtasks are all `done`: set the parent to `done` and update
   `updated`.
4. Any `links:` entries that are obviously the same page twice: keep one.

Do not change `status` otherwise, do not delete files, and do not touch
`jira`, `github` or `spent`. Report what you changed as a short list.
