import { expect, it } from 'vitest'
import { rolloutStageState, type Rollout } from './rollout'
const stage = {
  ready: true,
  asOf: 100,
  scope: '11111111-1111-4111-8111-111111111111',
  opensAt: 0,
  minimumVerifiedPercent: null,
  open: true,
  totalTargets: 10,
  reported: 10,
  unknown: 0,
  waitingUser: 0,
  waitingReboot: 0,
  failed: 0,
  verifiedSuccess: 8,
  unsupportedCapability: 0,
}
it('distinguishes opening time, statistics, verified success threshold and pause', () => {
  const value: Rollout = {
    policyId: stage.scope,
    versionId: stage.scope,
    paused: false,
    asOf: 100,
    stages: [{ ...stage }, { ...stage, open: false, opensAt: 200, minimumVerifiedPercent: 80 }],
  }
  expect(rolloutStageState(value, 1)).toBe('waitingTime')
  value.stages[1]!.opensAt = 0
  value.stages[0]!.ready = false
  expect(rolloutStageState(value, 1)).toBe('waitingStatistics')
  value.stages[0]!.ready = true
  value.stages[0]!.totalTargets = 0
  expect(rolloutStageState(value, 1)).toBe('waitingStatistics')
  value.stages[0]!.totalTargets = 10
  value.stages[0]!.verifiedSuccess = 7
  value.stages[0]!.waitingReboot = 3
  expect(rolloutStageState(value, 1)).toBe('thresholdNotMet')
  value.stages[1]!.open = true
  expect(rolloutStageState(value, 1)).toBe('stageOpen')
  value.paused = true
  expect(rolloutStageState(value, 1)).toBe('paused')
})
