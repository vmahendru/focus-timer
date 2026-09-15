# Agents and the Focus workspace

The board is a folder of Markdown files. That is the whole integration
surface for an agent: read the files, write the files, and the board updates.
No API keys, no plugins, and the agent you use is your choice. Anything that
can edit files works, including Claude Code, Cursor, Codex, Aider, or a person.

Workspace layout:

```
~/Focus/
  config.json      integration settings and tokens, owner-only permissions
  tasks/
    T-0001.md      one task per file, see lib/tasks.js for the fields
    T-0002.md
```

## Prompts

- `decompose.md` breaks one task into subtasks. The board's "Copy agent
  prompt" button fills in the task for you. Paste it into any agent.
- `groom.md` tidies the whole board so the next block is obvious.

The board also renders `decompose.md` for a task at
`GET /api/tasks/<id>/prompt` if you want to script it.

## Claude Code

Copy `claude-code/focus-decompose` into `~/.claude/skills/` and Claude Code
will pick it up. Then, in any project:

```
/focus-decompose T-0007
```

The skill only writes files under the workspace. It does not call any
network service.

## Writing your own

Any prompt that produces files in the format shown in `decompose.md` will
work. Keep these invariants: ids are `T-NNNN` and never reused, `status` is
one of backlog, next, doing, done, and `parent` points at an existing id.
