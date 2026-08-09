/**
 * useSetupWizard — first-run wizard state machine.
 *
 * Single-page transient state (not Pinia): step cursor, the two credential
 * forms, and the set of completed steps. Forward navigation is gated by form
 * validity; the submit → done transition is driven by a successful POST
 * (complete()), never by goNext(). All validation lives in ../lib/validation.
 */
import { computed, reactive, readonly, ref, type ComputedRef, type Ref } from 'vue'
import { isAdminValid, isOperatorValid, type AdminForm, type OperatorForm } from '../lib/validation'

export type SetupStep = 'preflight' | 'planes' | 'operator' | 'admin' | 'submit' | 'done'

export const SETUP_STEPS = [
  'preflight',
  'planes',
  'operator',
  'admin',
  'submit',
  'done',
] as const satisfies readonly SetupStep[]

export interface SetupWizard {
  readonly steps: readonly SetupStep[]
  readonly currentStep: Readonly<Ref<SetupStep>>
  readonly currentIndex: ComputedRef<number>
  readonly doneSteps: Readonly<Ref<ReadonlySet<SetupStep>>>
  /** Mutable operator (Plane A) form, bound via v-model. */
  readonly operator: OperatorForm
  /** Mutable admin (Plane B) form, bound via v-model. */
  readonly admin: AdminForm
  readonly canGoNext: ComputedRef<boolean>
  isStepAccessible(step: SetupStep): boolean
  isStepDone(step: SetupStep): boolean
  goNext(): void
  goBack(): void
  goTo(step: SetupStep): void
  /** Mark every step done and land on `done` — call after a successful POST. */
  complete(): void
  reset(): void
}

export function useSetupWizard(): SetupWizard {
  const currentStep = ref<SetupStep>('preflight')
  const done = ref<Set<SetupStep>>(new Set())
  const operator = reactive<OperatorForm>({ username: '', password: '' })
  const admin = reactive<AdminForm>({ username: '', email: '', password: '', confirm: '' })

  const currentIndex = computed(() => SETUP_STEPS.indexOf(currentStep.value))

  const canGoNext = computed<boolean>(() => {
    switch (currentStep.value) {
      case 'operator':
        return isOperatorValid(operator)
      case 'admin':
        return isAdminValid(admin)
      // submit completion is driven by the POST, not a Next button; done is terminal
      case 'submit':
      case 'done':
        return false
      default:
        return true
    }
  })

  function isStepDone(step: SetupStep): boolean {
    return done.value.has(step)
  }

  function isStepAccessible(step: SetupStep): boolean {
    // Backward / already-visited only; forward jumps go through goNext's gating.
    return SETUP_STEPS.indexOf(step) <= currentIndex.value || done.value.has(step)
  }

  function goNext(): void {
    if (!canGoNext.value) return
    const next = SETUP_STEPS[currentIndex.value + 1]
    if (!next) return
    done.value = new Set(done.value).add(currentStep.value)
    currentStep.value = next
  }

  function goBack(): void {
    const prev = SETUP_STEPS[currentIndex.value - 1]
    if (prev) currentStep.value = prev
  }

  function goTo(step: SetupStep): void {
    if (isStepAccessible(step)) currentStep.value = step
  }

  function complete(): void {
    done.value = new Set(SETUP_STEPS)
    currentStep.value = 'done'
  }

  function reset(): void {
    currentStep.value = 'preflight'
    done.value = new Set()
    Object.assign(operator, { username: '', password: '' })
    Object.assign(admin, { username: '', email: '', password: '', confirm: '' })
  }

  return {
    steps: SETUP_STEPS,
    currentStep: readonly(currentStep),
    currentIndex,
    doneSteps: readonly(done) as Readonly<Ref<ReadonlySet<SetupStep>>>,
    operator,
    admin,
    canGoNext,
    isStepAccessible,
    isStepDone,
    goNext,
    goBack,
    goTo,
    complete,
    reset,
  }
}
