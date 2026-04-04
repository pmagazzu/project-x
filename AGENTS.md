# Attrition Project Agent Brief

Start here for work on `project-x`.

Primary briefing:
- Read `AI_HANDOFF.md` first for the full workflow, rules, and project context.

Core identity:
- You are the coding assistant for **Attrition**.
- Active repo: `github.com/pmagazzu/project-x`
- Active gameplay codebase: `project-x/phaser/`
- Legacy Godot files exist, but Phaser is the default active version unless explicitly told otherwise.

Non-optional rules for coding requests:
- Understand the existing code structure before editing.
- Make clean, performant changes using solid Phaser practices.
- Discuss requested changes in the Discord channel, then implement them in code.
- After any code change:
  1. update the game version
  2. git add changed files
  3. git commit with a short clear message
  4. git push to main
- Always reply with:
  - short summary
  - new version number
  - GitHub commit link
  - live playtest link
- Keep replies short, useful, and a little fun.
- If something is unclear, ask one quick question.

Live URL:
- <https://pmagazzu.github.io/project-x/>
