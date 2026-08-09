import { describe, it, expect } from 'vitest'
import { useSetupWizard, SETUP_STEPS } from './useSetupWizard'

const validOperator = { username: 'ops', password: 'rootpass1' }
const validAdmin = {
  username: 'admin',
  email: 'admin@corp.example',
  password: 'SecretPass!23',
  confirm: 'SecretPass!23',
}

describe('useSetupWizard', () => {
  it('starts at preflight with an empty done set', () => {
    const w = useSetupWizard()
    expect(w.currentStep.value).toBe('preflight')
    expect(w.currentIndex.value).toBe(0)
    expect(w.doneSteps.value.size).toBe(0)
  })

  it('advances through preflight → planes → operator without gating', () => {
    const w = useSetupWizard()
    w.goNext()
    expect(w.currentStep.value).toBe('planes')
    w.goNext()
    expect(w.currentStep.value).toBe('operator')
    expect(w.doneSteps.value.has('preflight')).toBe(true)
    expect(w.doneSteps.value.has('planes')).toBe(true)
  })

  it('gates the operator step on credential validity', () => {
    const w = useSetupWizard()
    w.goNext() // planes
    w.goNext() // operator
    expect(w.canGoNext.value).toBe(false)
    w.goNext() // blocked
    expect(w.currentStep.value).toBe('operator')

    Object.assign(w.operator, validOperator)
    expect(w.canGoNext.value).toBe(true)
    w.goNext()
    expect(w.currentStep.value).toBe('admin')
  })

  it('gates the admin step on form validity incl. password match', () => {
    const w = useSetupWizard()
    w.goTo('admin') // not accessible yet → no-op
    expect(w.currentStep.value).toBe('preflight')

    // walk to admin
    w.goNext()
    w.goNext()
    Object.assign(w.operator, validOperator)
    w.goNext()
    expect(w.currentStep.value).toBe('admin')

    Object.assign(w.admin, { ...validAdmin, confirm: 'mismatch' })
    expect(w.canGoNext.value).toBe(false)
    Object.assign(w.admin, validAdmin)
    expect(w.canGoNext.value).toBe(true)
    w.goNext()
    expect(w.currentStep.value).toBe('submit')
  })

  it('does not let goNext leave the submit step (POST drives completion)', () => {
    const w = useSetupWizard()
    w.goNext()
    w.goNext()
    Object.assign(w.operator, validOperator)
    w.goNext()
    Object.assign(w.admin, validAdmin)
    w.goNext()
    expect(w.currentStep.value).toBe('submit')
    expect(w.canGoNext.value).toBe(false)
    w.goNext()
    expect(w.currentStep.value).toBe('submit')
  })

  it('complete() marks every step done and lands on done', () => {
    const w = useSetupWizard()
    w.complete()
    expect(w.currentStep.value).toBe('done')
    expect(w.doneSteps.value.size).toBe(SETUP_STEPS.length)
  })

  it('goBack steps backward', () => {
    const w = useSetupWizard()
    w.goNext()
    w.goNext()
    expect(w.currentStep.value).toBe('operator')
    w.goBack()
    expect(w.currentStep.value).toBe('planes')
  })

  it('goTo allows backward navigation to already-visited steps', () => {
    const w = useSetupWizard()
    w.goNext()
    w.goNext()
    expect(w.currentStep.value).toBe('operator')
    w.goTo('preflight')
    expect(w.currentStep.value).toBe('preflight')
  })

  it('reset() returns to the initial state and clears forms', () => {
    const w = useSetupWizard()
    w.goNext()
    Object.assign(w.operator, validOperator)
    w.reset()
    expect(w.currentStep.value).toBe('preflight')
    expect(w.doneSteps.value.size).toBe(0)
    expect(w.operator.username).toBe('')
  })
})
