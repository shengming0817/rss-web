/**
 * useRovingTablist — ARIA APG roving tabindex for a horizontal tablist.
 *
 * Handles ArrowRight / ArrowLeft (with wrap) and Home / End.
 * Other keys are ignored (no preventDefault, no focus move).
 *
 * Blinding coverage: does not handle vertical arrow keys (ArrowUp/Down),
 * nor does it update tabindex attributes — that is the caller's responsibility.
 *
 * disabledIds: when provided, arrow navigation may land on a disabled id —
 * focus moves to its DOM element but onActivate is NOT called and Enter/Space
 * are NOT handled (the caller is responsible for blocking activation on the
 * disabled element itself). This matches APG "focusable but not activatable"
 * pattern for disabled tabs in a roving tablist.
 */
export interface RovingTablistOptions<T extends string = string> {
  /** Returns the ordered list of tab ids (called on every keydown for live lists). */
  tabIds: () => readonly T[]
  /** Maps a tab id to the DOM element id of its button. */
  idFor: (id: T) => string
  /**
   * Optional automatic-activation callback (APG pattern).
   * Called with the target tab id after focus moves on Arrow/Home/End,
   * UNLESS the target id is in disabledIds — then it is skipped.
   * Keeps roving "home" position in sync with the active tab.
   */
  onActivate?: ((id: T) => void) | undefined
  /**
   * Optional set of tab ids that should receive focus during arrow navigation
   * but must NOT trigger onActivate (disabled-but-focusable APG pattern).
   * When omitted, all tabs in tabIds are treated as activatable (existing behaviour).
   */
  disabledIds?: readonly T[] | undefined
}

export interface RovingTablistReturn<T extends string = string> {
  onKeydown(e: KeyboardEvent, currentId: T): void
}

export function useRovingTablist<T extends string = string>(
  opts: RovingTablistOptions<T>,
): RovingTablistReturn<T> {
  function onKeydown(e: KeyboardEvent, currentId: T): void {
    const ids = opts.tabIds()
    const current = ids.indexOf(currentId)
    if (current === -1) return

    let target = -1

    switch (e.key) {
      case 'ArrowRight':
        target = (current + 1) % ids.length
        break
      case 'ArrowLeft':
        target = (current - 1 + ids.length) % ids.length
        break
      case 'Home':
        target = 0
        break
      case 'End':
        target = ids.length - 1
        break
      default:
        return
    }

    const targetId = ids[target]
    if (targetId === undefined) return

    e.preventDefault()
    document.getElementById(opts.idFor(targetId))?.focus()

    // Only activate if the target is not in the disabled set
    const isDisabled = opts.disabledIds !== undefined && opts.disabledIds.includes(targetId)
    if (!isDisabled) {
      opts.onActivate?.(targetId)
    }
  }

  return { onKeydown }
}
