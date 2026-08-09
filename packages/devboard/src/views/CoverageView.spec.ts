import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import CoverageView from './CoverageView.vue'
import { COVERAGE_MATRIX, coverageCounts } from '../data/coverageMatrix'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (k: string, params?: Record<string, unknown>) => {
      if (params !== undefined) return `${k}(${JSON.stringify(params)})`
      return k
    },
  }),
}))

function mountView() {
  return mount(CoverageView, {
    global: {},
  })
}

// Compute expected totals from the data layer
const TOTAL_ROWS = COVERAGE_MATRIX.reduce((sum, s) => sum + s.rows.length, 0)
const SECTION_COUNT = COVERAGE_MATRIX.length
const COUNTS = coverageCounts()
const SHIPPED = COVERAGE_MATRIX.flatMap((s) => s.rows).filter((r) => r.web !== null).length
const DRAFTED = COVERAGE_MATRIX.flatMap((s) => s.rows).filter((r) => r.design !== null).length

describe('CoverageView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Structure ─────────────────────────────────────────────────────────────

  it('renders all section headings', () => {
    const wrapper = mountView()
    const text = wrapper.text()
    COVERAGE_MATRIX.forEach((section) => {
      expect(text).toContain(section.titleKey)
    })
  })

  it('renders total row count matching COVERAGE_MATRIX', () => {
    const wrapper = mountView()
    // All data rows: tbody tr elements (excluding section header rows)
    const dataRows = wrapper.findAll('tr[data-row]')
    expect(dataRows.length).toBe(TOTAL_ROWS)
  })

  it('renders header with eyebrow, h1, subtitle', () => {
    const wrapper = mountView()
    const text = wrapper.text()
    expect(text).toContain('coverage.eyebrow')
    expect(text).toContain('coverage.title')
    expect(text).toContain('coverage.subtitle')
  })

  // ── Table accessibility ───────────────────────────────────────────────────

  it('thead th elements have scope="col"', () => {
    const wrapper = mountView()
    const headers = wrapper.findAll('thead th[scope="col"]')
    expect(headers.length).toBeGreaterThanOrEqual(3)
  })

  it('table has a caption or aria-label', () => {
    const wrapper = mountView()
    const caption = wrapper.find('caption')
    const tableWithLabel = wrapper.find('table[aria-label]')
    // At least one of caption or aria-label must be present
    expect(caption.exists() || tableWithLabel.exists()).toBe(true)
  })

  it('thead contains col headers for capability, web, and design', () => {
    const wrapper = mountView()
    const text = wrapper.text()
    expect(text).toContain('coverage.col.capability')
    expect(text).toContain('coverage.col.web')
    expect(text).toContain('coverage.col.design')
  })

  // ── Status marks & sr-only ────────────────────────────────────────────────

  it('each status has at least one sr-only text element with coverage.status.* key', () => {
    const wrapper = mountView()
    const srOnly = wrapper.findAll('.sr-only')
    const srTexts = srOnly.map((el) => el.text())
    // We must have sr-only text for status labels — check that at least
    // one of the status key patterns appears
    const hasStatusText = srTexts.some((t) => t.startsWith('coverage.status.'))
    expect(hasStatusText).toBe(true)
  })

  it('matched status renders sr-only text with coverage.status.matched', () => {
    const wrapper = mountView()
    const srOnly = wrapper.findAll('.sr-only')
    const srTexts = srOnly.map((el) => el.text())
    expect(srTexts).toContain('coverage.status.matched')
  })

  it('designOnly status renders sr-only text with coverage.status.designOnly', () => {
    const wrapper = mountView()
    const srOnly = wrapper.findAll('.sr-only')
    const srTexts = srOnly.map((el) => el.text())
    expect(srTexts).toContain('coverage.status.designOnly')
  })

  // ── Legend ────────────────────────────────────────────────────────────────

  it('renders legend with all 5 status entries', () => {
    const wrapper = mountView()
    const text = wrapper.text()
    expect(text).toContain('coverage.legend.matched')
    expect(text).toContain('coverage.legend.partial')
    expect(text).toContain('coverage.legend.designOnly')
    expect(text).toContain('coverage.legend.backendOnly')
    expect(text).toContain('coverage.legend.outOfScope')
  })

  // ── KPI strip ─────────────────────────────────────────────────────────────

  it('renders KPI labels for shipped, drafted, gaps, outOfScope', () => {
    const wrapper = mountView()
    const text = wrapper.text()
    expect(text).toContain('coverage.kpi.shipped')
    expect(text).toContain('coverage.kpi.drafted')
    expect(text).toContain('coverage.kpi.gaps')
    expect(text).toContain('coverage.kpi.outOfScope')
  })

  it('KPI shipped number matches rows with non-null web', () => {
    const wrapper = mountView()
    const kpi = wrapper.find('[data-testid="kpi-shipped"]')
    expect(kpi.exists()).toBe(true)
    expect(kpi.text()).toContain(String(SHIPPED))
  })

  it('KPI drafted number matches rows with non-null design', () => {
    const wrapper = mountView()
    const kpi = wrapper.find('[data-testid="kpi-drafted"]')
    expect(kpi.exists()).toBe(true)
    expect(kpi.text()).toContain(String(DRAFTED))
  })

  it('KPI gaps = total - matched', () => {
    const wrapper = mountView()
    const kpi = wrapper.find('[data-testid="kpi-gaps"]')
    expect(kpi.exists()).toBe(true)
    const expectedGaps = COUNTS.total - COUNTS.matched
    expect(kpi.text()).toContain(String(expectedGaps))
  })

  it('KPI outOfScope matches counts', () => {
    const wrapper = mountView()
    const kpi = wrapper.find('[data-testid="kpi-out-of-scope"]')
    expect(kpi.exists()).toBe(true)
    expect(kpi.text()).toContain(String(COUNTS['out-of-scope']))
  })

  // ── Filter chips ──────────────────────────────────────────────────────────

  it('filter chips group has role="group" and aria-label', () => {
    const wrapper = mountView()
    const group = wrapper.find('[role="group"][aria-label]')
    expect(group.exists()).toBe(true)
  })

  it('renders 6 filter chips (all + 5 statuses)', () => {
    const wrapper = mountView()
    const group = wrapper.find('[role="group"]')
    expect(group.exists()).toBe(true)
    const chips = group.findAll('button')
    expect(chips.length).toBe(6)
  })

  it('filter chips have aria-pressed attributes', () => {
    const wrapper = mountView()
    const group = wrapper.find('[role="group"]')
    const chips = group.findAll('button')
    chips.forEach((chip) => {
      expect(chip.attributes('aria-pressed')).toMatch(/^true|false$/)
    })
  })

  it('"all" chip is aria-pressed=true initially', () => {
    const wrapper = mountView()
    const group = wrapper.find('[role="group"]')
    const allChip = group.findAll('button').find((b) => b.text().includes('coverage.filter.all'))
    expect(allChip).toBeDefined()
    expect(allChip!.attributes('aria-pressed')).toBe('true')
  })

  it('clicking a status filter chip filters rows to that status only', async () => {
    const wrapper = mountView()
    const group = wrapper.find('[role="group"]')
    // Click "matched" filter
    const matchedChip = group
      .findAll('button')
      .find((b) => b.text().includes('coverage.filter.matched'))
    expect(matchedChip).toBeDefined()
    await matchedChip!.trigger('click')

    expect(matchedChip!.attributes('aria-pressed')).toBe('true')
    const dataRows = wrapper.findAll('tr[data-row]')
    const expectedMatchedCount = COVERAGE_MATRIX.flatMap((s) => s.rows).filter(
      (r) => r.status === 'matched',
    ).length
    expect(dataRows.length).toBe(expectedMatchedCount)
  })

  it('clicking active filter again returns to "all"', async () => {
    const wrapper = mountView()
    const group = wrapper.find('[role="group"]')
    const matchedChip = group
      .findAll('button')
      .find((b) => b.text().includes('coverage.filter.matched'))!
    await matchedChip.trigger('click')
    // Now click "all" chip
    const allChip = group.findAll('button').find((b) => b.text().includes('coverage.filter.all'))!
    await allChip.trigger('click')
    const dataRows = wrapper.findAll('tr[data-row]')
    expect(dataRows.length).toBe(TOTAL_ROWS)
  })

  it('active chip has aria-pressed=true, others false', async () => {
    const wrapper = mountView()
    const group = wrapper.find('[role="group"]')
    const matchedChip = group
      .findAll('button')
      .find((b) => b.text().includes('coverage.filter.matched'))!
    await matchedChip.trigger('click')

    const chips = group.findAll('button')
    chips.forEach((chip) => {
      if (chip.text().includes('coverage.filter.matched')) {
        expect(chip.attributes('aria-pressed')).toBe('true')
      } else {
        expect(chip.attributes('aria-pressed')).toBe('false')
      }
    })
  })

  // ── Section hiding when filter active ────────────────────────────────────

  it('sections with no matching rows are hidden when filter active', async () => {
    const wrapper = mountView()
    const group = wrapper.find('[role="group"]')
    // Filter to out-of-scope — there are none in COVERAGE_MATRIX
    const oosFitler = COUNTS['out-of-scope']
    if (oosFitler === 0) {
      // With zero out-of-scope rows, all sections should be hidden
      const oosChip = group
        .findAll('button')
        .find((b) => b.text().includes('coverage.filter.outOfScope'))!
      await oosChip.trigger('click')
      const dataRows = wrapper.findAll('tr[data-row]')
      expect(dataRows.length).toBe(0)
      // No section headings should be visible
      const sectionHeadings = wrapper.findAll('[data-section]')
      expect(sectionHeadings.length).toBe(0)
    } else {
      // Just verify that filter reduces sections shown
      const oosChip = group
        .findAll('button')
        .find((b) => b.text().includes('coverage.filter.outOfScope'))!
      await oosChip.trigger('click')
      const dataRows = wrapper.findAll('tr[data-row]')
      expect(dataRows.length).toBe(oosFitler)
    }
  })

  // ── Row content ───────────────────────────────────────────────────────────

  it('null web ref renders coverage.none placeholder', () => {
    const wrapper = mountView()
    // coverage matrix has rows with web=null; find at least one null-web cell
    const hasNullWeb = COVERAGE_MATRIX.flatMap((s) => s.rows).some((r) => r.web === null)
    if (hasNullWeb) {
      expect(wrapper.text()).toContain('coverage.none')
    }
  })

  it('coverage.none span has :aria-label bound to t("coverage.none") (not static literal)', () => {
    const wrapper = mountView()
    const noneSpans = wrapper.findAll('.coverage__none')
    // At least one none-span must exist (matrix has null web/design refs)
    expect(noneSpans.length).toBeGreaterThan(0)
    noneSpans.forEach((span) => {
      // With identity mock, t('coverage.none') returns 'coverage.none'
      // Correct binding: :aria-label="t('coverage.none')" → attribute = 'coverage.none'
      // Bug form: aria-label="t('coverage.none')" → attribute = literal string "t('coverage.none')"
      expect(span.attributes('aria-label')).toBe('coverage.none')
    })
  })

  it('route references are rendered in data rows', () => {
    const wrapper = mountView()
    const text = wrapper.text()
    // Check a couple of known routes from the matrix
    expect(text).toContain('/login')
    expect(text).toContain('/coverage')
  })

  it('capability keys are translated via t()', () => {
    const wrapper = mountView()
    const text = wrapper.text()
    // With identity t(), key is passed through — should see cap keys
    expect(text).toContain('coverage.cap.login')
  })

  // ── Sections count ────────────────────────────────────────────────────────

  it(`renders exactly ${SECTION_COUNT} section groups when filter=all`, () => {
    const wrapper = mountView()
    const sections = wrapper.findAll('[data-section]')
    expect(sections.length).toBe(SECTION_COUNT)
  })
})
