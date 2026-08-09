/**
 * @gocell/codegen — 纯派生逻辑（与文件 IO 解耦，便于单测）。
 *
 * 盲区清单（ai-robust §工具选定后强制盲区自检）——本模块的 barrel 抽取逻辑
 * **不覆盖**以下 TS 导出形态（json-schema-to-typescript 当前产物均不产生它们）：
 *   - re-export：`export { X } from '...'` / `export type { X } from '...'`
 *   - 值导出：`export const X = ...` / `export default ...`
 *   - 命名空间：`export namespace X`
 * 覆盖：`export interface|type|enum|class X`。新增形态须同步扩 extractExportedNames
 * 并补 derive.spec.ts 反向自检。
 */
import { readdirSync, existsSync } from 'node:fs'
import { join, sep } from 'node:path'

export const toPosix = (p: string): string => p.split(sep).join('/')

export function fileBanner(relSchemaPath: string): string {
  return [
    '/* eslint-disable */',
    '/**',
    ' * AUTO-GENERATED — DO NOT EDIT BY HAND.',
    ` * Source: gocell/contracts/${relSchemaPath}`,
    ' * 由 `pnpm codegen` 派生；CI 经 `git diff --exit-code` 守门只读。',
    ' */',
  ].join('\n')
}

/** 递归收集目录下全部 *.schema.json，返回绝对路径，遍历与结果均按字典序（确定性）。 */
export function collectSchemas(nsRoot: string): string[] {
  const out: string[] = []
  const walk = (abs: string): void => {
    const entries = readdirSync(abs, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    )
    for (const entry of entries) {
      const child = join(abs, entry.name)
      if (entry.isDirectory()) walk(child)
      else if (entry.name.endsWith('.schema.json')) out.push(child)
    }
  }
  if (existsSync(nsRoot)) walk(nsRoot)
  return out.sort()
}

/** 抽取生成文件中的顶层导出类型名；逐行匹配并跳过注释行，避免误匹配文档文本。 */
export function extractExportedNames(source: string): string[] {
  const names: string[] = []
  for (const rawLine of source.split('\n')) {
    const line = rawLine.trimStart()
    if (line.startsWith('*') || line.startsWith('//') || line.startsWith('/*')) continue
    const m = /^export (?:interface|type|enum|class) (\w+)/.exec(line)
    const name = m?.[1]
    if (name !== undefined) names.push(name)
  }
  return names
}

export interface GeneratedModule {
  /** barrel 相对导入路径，如 './http/auth/login/v1/request'。 */
  readonly module: string
  /** 该文件按出现顺序的导出类型名。 */
  readonly names: readonly string[]
}

export interface BarrelBuild {
  /** module → 由该 module 权威导出的名字（已全局去重）。 */
  readonly moduleExports: Map<string, string[]>
  /** 被去重丢弃的 (name, 丢弃方 module, 胜出方 module)，用于可见性告警。 */
  readonly shadowed: ReadonlyArray<{ name: string; dropped: string; winner: string }>
}

/**
 * 全局首现胜出去重：同名类型（跨文件内联的共享类型）只保留首个出现的 module。
 * 调用方应让权威命名空间（shared）排在 http 之前，使共享类型归属其规范源文件。
 */
export function buildExports(files: readonly GeneratedModule[]): BarrelBuild {
  const winnerOf = new Map<string, string>()
  const moduleExports = new Map<string, string[]>()
  const shadowed: Array<{ name: string; dropped: string; winner: string }> = []
  for (const { module, names } of files) {
    for (const name of names) {
      const winner = winnerOf.get(name)
      if (winner !== undefined) {
        shadowed.push({ name, dropped: module, winner })
        continue
      }
      winnerOf.set(name, module)
      moduleExports.set(module, [...(moduleExports.get(module) ?? []), name])
    }
  }
  return { moduleExports, shadowed }
}

/** 渲染 barrel：module 路径排序、名字排序 → 完全确定性输出。 */
export function renderBarrel(moduleExports: Map<string, string[]>, banner: string): string {
  const lines = [banner, '']
  for (const mod of [...moduleExports.keys()].sort()) {
    const names = [...moduleExports.get(mod)!].sort()
    lines.push(`export type { ${names.join(', ')} } from '${mod}'`)
  }
  return lines.join('\n') + '\n'
}
