# @rss/core

Shared Web presentation: theme and locale selection, design tokens, and accessible Vue components. Products own messages, HTTP, permissions, business state and side effects.

Import components and their types from `@rss/core/components`; import `@rss/core/styles/tokens.css` once per app. Component CSS is included by the public component entry. The existing `data-theme` and theme store are the single theme owner.

- Inputs use controlled `modelValue` / `update:modelValue`. `UiField` provides its control id, description ids, validity and required state through the default slot.
- `UiCombobox` keeps the selected value separate from query text. `required` validates the selection using the consumer-provided `invalidLabel`; `readonly` preserves focus and form submission while blocking all selection changes. `name` submits the selected value through the upstream form primitive.
- `UiDialog` takes controlled `open`, title, optional description, localized close label, kind (`dialog` / `alertdialog`) and placement (`center` / `right`). It emits `update:open`; the page owns submission, cancellation and secret clearing. Escape, outside interaction, nested focus and return use Reka's primitives; controlled external triggers return to the original opener.
- `UiTable` renders supplied rows/columns, optional cell slots, and controlled selection/sort. It never sorts or fetches data itself. Header selection affects only supplied rows and preserves selections outside that page. Consumers provide accessible selection labels.
- `UiTabs` can opt into `keepMounted` for panels with in-progress form or recovery state; inactive panels remain hidden while the owning component stays mounted.
- `UiPagination` distinguishes known page counts from cursor navigation. Cursor mode never infers a total or manufactures cursors.
- `UiDateInput` handles date-only or wall-clock strings. `UiUtcDateTimeInput` uses UTC epoch seconds or `null`, with no local-time conversion. Required/invalid validation belongs to the consuming form. Existing numeric domain drafts explicitly map empty input to their existing invalid numeric state before validation.
- Progress, steps, badges, messages and charts consume presentation data only. Charts show non-negative finite values and expose the same values as text/table; missing or zero-total share data renders the supplied empty message.
- The independent `pnpm dev:ui` gallery shows all component families, their applicable states and neutral compositions. It has no product APIs or ordinary product navigation. `pnpm build:ui-preview` builds that development artifact separately from production apps.

Implementation reference: Reka UI 2.11.0 (`4dc1a2304e95fb97d642f24d8419359bfc3d2e85`), especially Dialog/DialogContentModal.vue and Tabs/TabsList.vue. Only stable primitives are used. Public consumers use RSS presentation interfaces, not upstream internals.

Reka UI 2.11.0 的 Toast 原语应用 `patches/reka-ui@2.11.0.patch`：在显式关闭和卸载时清理已有关闭计时器。补丁同时覆盖发布的 ESM/CJS 和上游源码，未新增通知计时器或状态 owner；升级依赖时应检查上游是否已包含该修复并运行卸载回归。
