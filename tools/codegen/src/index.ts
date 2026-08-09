/**
 * @gocell/codegen — 契约类型单向派生器（IO 编排）。
 *
 * 从后端 `gocell/contracts/{shared,http}/**\/*.schema.json` 派生 TS 类型到
 * `packages/contracts/src/`，镜像源目录结构 + 全局去重 barrel。纯逻辑见 ./derive.ts。
 *
 * AI-robust「Hard」约束执行体（ai-robust.md §载体决策 第 1 条）：单源 schema →
 * 派生执行体，CI 跑 `git diff --exit-code packages/contracts/src/` 校验业务包未手改。
 * 确定性由「排序遍历（derive.collectSchemas）+ 版本锁定的 json-schema-to-typescript」保证。
 */
import { rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileFromFile } from 'json-schema-to-typescript'
import {
  buildExports,
  collectSchemas,
  extractExportedNames,
  fileBanner,
  renderBarrel,
  toPosix,
  type GeneratedModule,
} from './derive'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../../..')
const CONTRACTS_DIR = resolve(
  process.env.GOCELL_CONTRACTS_DIR ?? join(REPO_ROOT, '../gocell/contracts'),
)
const OUT_DIR = join(REPO_ROOT, 'packages/contracts/src')

/**
 * 派生的命名空间，**顺序即去重优先级**：shared 在前 → 跨文件内联的共享类型
 * 归属其 shared 规范源文件，而非 http 侧的内联副本。
 */
const NAMESPACES = ['shared', 'http'] as const

async function main(): Promise<void> {
  if (!existsSync(CONTRACTS_DIR)) {
    throw new Error(
      `契约源目录不存在：${CONTRACTS_DIR}\n` +
        `请将后端仓库 ghbvf/gocell checkout 为本仓库同级目录，` +
        `或设置环境变量 GOCELL_CONTRACTS_DIR 指向 contracts 目录。`,
    )
  }
  // 安全护栏：全量 rm 前断言 OUT_DIR 落在预期路径，防 REPO_ROOT 解析异常误删。
  if (!OUT_DIR.endsWith(join('packages', 'contracts', 'src'))) {
    throw new Error(`安全检查失败：OUT_DIR 路径异常，拒绝删除 ${OUT_DIR}`)
  }

  // 全量重建：先清空 OUT_DIR，保证删除的 schema 在产物中同步消失（确定性 diff）。
  rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })

  const schemaFiles = NAMESPACES.flatMap((ns) => collectSchemas(join(CONTRACTS_DIR, ns)))
  const modules: GeneratedModule[] = []

  for (const absSchema of schemaFiles) {
    const relSchema = toPosix(relative(CONTRACTS_DIR, absSchema))
    const relModule = relSchema.replace(/\.schema\.json$/, '')
    const outPath = join(OUT_DIR, `${relModule}.ts`)

    const compiled = await compileFromFile(absSchema, {
      cwd: dirname(absSchema),
      bannerComment: fileBanner(relSchema),
      declareExternallyReferenced: true,
      additionalProperties: false,
      // 封堵 `const enum`（v15 默认 enableConstEnums:true）：const enum 是运行时值导出，
      // 破坏 @gocell/contracts 零运行时承诺，且与 tsconfig isolatedModules:true 冲突致 typecheck 红。
      enableConstEnums: false,
    })

    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, compiled)
    modules.push({ module: `./${relModule}`, names: extractExportedNames(compiled) })
  }

  const { moduleExports, shadowed } = buildExports(modules)
  writeFileSync(join(OUT_DIR, 'index.ts'), renderBarrel(moduleExports, fileBanner('(barrel)')))

  for (const { name, dropped, winner } of shadowed) {
    console.warn(`codegen: 去重共享类型 ${name}（归属 ${winner}，忽略 ${dropped} 内联副本）`)
  }
  console.log(
    `codegen: 从 ${schemaFiles.length} 个 schema 派生 ${moduleExports.size} 个模块 → ` +
      `${toPosix(relative(REPO_ROOT, OUT_DIR))}`,
  )
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
