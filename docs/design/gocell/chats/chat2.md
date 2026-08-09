# AI Shell 高度适应

_Started 2026-05-08 23:49 UTC_

---

## User

1、AI Shell把下面挡住了，导致AI Studio对话按钮被挡了，用户信息被挡了一部分，是否让页面自适应高度
2、Sangboxes选择之后如何开始会话呢

## Assistant

_[tool: list_files]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: grep]_

_[tool: grep]_

_[tool: grep]_

_[tool: read_file]_

_[tool: grep]_

_[tool: read_file]_

_[tool: grep]_

_[tool: snip]_

_[tool: grep]_

_[tool: str_replace_edit]_

I'll fix both issues. I won't recreate any branded UI — these are edits to your existing original prototype.

**Plan:**
1. **AI Shell overlap** — make the strip start after the sidebar (so it doesn't cover the user info card) and reserve 32px of bottom padding in the main column (so AI Studio's send button + page content isn't hidden under the min-state strip).
2. **Sandbox → session** — add a primary "Start session" / "Resume session" button on the sandbox detail page (and a "Continue" CTA in the Conversation tab) that opens the AI Shell pinned to that sandbox via a custom event.

_[tool: str_replace_edit]_

_[tool: snip]_

Now replace `context` with `ctx` in the two places it's rendered, and add the Sandbox-detail button.

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now add the Start/Resume session button on the Sandbox detail page, and a CTA in the Conversation tab.

_[tool: str_replace_edit]_

_[tool: grep]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: done]_

_[tool: snip]_

_[tool: fork_verifier_agent]_

Done. Two changes:

**1. AI Shell auto-adapt** — strip and docked shell now start after the sidebar (so the user card stays visible) and `.v1-main` reserves 32px of bottom padding (so AI Studio's composer + page actions sit above the min-state strip). Full-screen mode still covers everything intentionally.

**2. Sandbox → session** — added a primary "Start session" / "Resume session" button in the sandbox detail action row, plus a CTA banner at the top of the Conversation tab. Both dispatch a `gocell.ai.open` event that the AI Bottom Bar listens for: it pops to dock state, pins context to that sandbox (`sandbox:sbx-… · cell/slice · task`), and seeds a system message marking the resume.

