import { describe, it, expect } from 'vitest'
import { buildExports, extractExportedNames, renderBarrel, type GeneratedModule } from './derive'

describe('extractExportedNames', () => {
  it('抽取 interface / type / enum / class 顶层导出', () => {
    const src = [
      'export interface Foo { a: string }',
      'export type Bar = number',
      'export enum Baz { A, B }',
      'export class Qux {}',
    ].join('\n')
    expect(extractExportedNames(src)).toEqual(['Foo', 'Bar', 'Baz', 'Qux'])
  })

  // 反向自检（ai-robust §盲区自检）：合规生成物的注释 / 非导出 / re-export
  // 形态须 0 误命中。
  it('跳过注释行内出现的 "export interface" 文本', () => {
    const src = [
      '/* eslint-disable */',
      '/**',
      ' * This module would export interface Ghost if uncommented.',
      ' */',
      'export interface Real { x: number }',
    ].join('\n')
    expect(extractExportedNames(src)).toEqual(['Real'])
  })

  it('不匹配 re-export / 值导出 / 非导出声明（已知盲区，应保持 0 命中）', () => {
    const src = [
      "export type { Aliased } from './other'",
      'export const value = 1',
      'export default function () {}',
      'interface NotExported {}',
      'type AlsoNot = string',
    ].join('\n')
    expect(extractExportedNames(src)).toEqual([])
  })
})

describe('buildExports — 全局去重（首现胜出）', () => {
  it('shared 排在 http 前 → 共享类型归属 shared 规范源，http 内联副本被丢弃', () => {
    const files: GeneratedModule[] = [
      { module: './shared/cas/v1/expected_version', names: ['ExpectedVersion'] },
      {
        module: './http/config/rollback/v1/request',
        names: ['ExpectedVersion', 'RollbackRequest'],
      },
    ]
    const { moduleExports, shadowed } = buildExports(files)
    expect(moduleExports.get('./shared/cas/v1/expected_version')).toEqual(['ExpectedVersion'])
    // http 模块仍保留其唯一主类型，但共享类型不重复导出
    expect(moduleExports.get('./http/config/rollback/v1/request')).toEqual(['RollbackRequest'])
    expect(shadowed).toEqual([
      {
        name: 'ExpectedVersion',
        dropped: './http/config/rollback/v1/request',
        winner: './shared/cas/v1/expected_version',
      },
    ])
  })

  it('无重名时每个模块导出自身全部类型', () => {
    const files: GeneratedModule[] = [
      { module: './a', names: ['A1', 'A2'] },
      { module: './b', names: ['B1'] },
    ]
    const { moduleExports, shadowed } = buildExports(files)
    expect(moduleExports.get('./a')).toEqual(['A1', 'A2'])
    expect(moduleExports.get('./b')).toEqual(['B1'])
    expect(shadowed).toEqual([])
  })
})

describe('renderBarrel — 确定性输出', () => {
  it('模块路径与名字均排序，输出与输入顺序无关', () => {
    const a = buildExports([
      { module: './z', names: ['Zeta', 'Alpha'] },
      { module: './a', names: ['Beta'] },
    ]).moduleExports
    const b = buildExports([
      { module: './a', names: ['Beta'] },
      { module: './z', names: ['Alpha', 'Zeta'] },
    ]).moduleExports
    expect(renderBarrel(a, '//banner')).toEqual(renderBarrel(b, '//banner'))
    expect(renderBarrel(a, '//banner')).toContain("export type { Alpha, Zeta } from './z'")
  })
})
