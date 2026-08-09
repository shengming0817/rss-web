/**
 * @gocell/cell-manifest — IO orchestration layer.
 *
 * Reads cell.yaml + slices/[x]/slice.yaml from GOCELL_CELLS_DIR (defaults to
 * ../gocell/corecells relative to repo root), derives CellManifest via pure
 * derive.ts functions, and writes the generated TS module to
 * packages/devboard/src/manifest/cells.generated.ts.
 *
 * AI-robust Hard guard: CI runs `pnpm cell-manifest` then asserts
 * `git status --porcelain packages/devboard/src/manifest/` is empty.
 * Determinism guaranteed by sorted directory traversal + stable JSON.stringify.
 */
import { readdirSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { buildManifest, renderManifestModule } from './derive'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../../..')
const CELLS_DIR = resolve(process.env['GOCELL_CELLS_DIR'] ?? join(REPO_ROOT, '../gocell/corecells'))
const OUT = join(REPO_ROOT, 'packages/devboard/src/manifest/cells.generated.ts')

function main(): void {
  if (!existsSync(CELLS_DIR)) {
    throw new Error(
      `Cell source directory not found: ${CELLS_DIR}\n` +
        `Check out the backend repo ghbvf/gocell as a sibling of this repo, ` +
        `or set GOCELL_CELLS_DIR to point to the corecells directory.`,
    )
  }

  // Safety guard: assert OUT path ends with the expected suffix before writing.
  const expectedSuffix = join('packages', 'devboard', 'src', 'manifest', 'cells.generated.ts')
  if (!OUT.endsWith(expectedSuffix)) {
    throw new Error(`Safety check failed: OUT path looks wrong, refusing to write: ${OUT}`)
  }

  // Read all cell directories (sorted for determinism)
  const cellDirs = readdirSync(CELLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()

  const rawCells: { cell: unknown; slices: unknown[] }[] = []

  for (const cellName of cellDirs) {
    const cellYamlPath = join(CELLS_DIR, cellName, 'cell.yaml')
    if (!existsSync(cellYamlPath)) continue

    const cellRaw: unknown = parse(readFileSync(cellYamlPath, 'utf-8'))

    // Read slices (sorted for determinism)
    const slicesDir = join(CELLS_DIR, cellName, 'slices')
    const slicesRaw: unknown[] = []
    if (existsSync(slicesDir)) {
      const sliceNames = readdirSync(slicesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
      for (const sliceName of sliceNames) {
        const sliceYamlPath = join(slicesDir, sliceName, 'slice.yaml')
        if (existsSync(sliceYamlPath)) {
          slicesRaw.push(parse(readFileSync(sliceYamlPath, 'utf-8')))
        }
      }
    }

    rawCells.push({ cell: cellRaw, slices: slicesRaw })
  }

  const manifest = buildManifest(rawCells)
  const output = renderManifestModule(manifest)

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, output, 'utf-8')

  console.log(
    `cell-manifest: derived ${manifest.cells.length} cells → ${OUT.replace(REPO_ROOT + '/', '')}`,
  )
  for (const cell of manifest.cells) {
    console.log(
      `  ${cell.id}: produces=${cell.produces.length} consumes=${cell.consumes.length} dependsOn=[${cell.dependsOnCells.join(',')}]`,
    )
  }
}

try {
  main()
} catch (err: unknown) {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
}
