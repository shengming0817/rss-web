# 设计系统复用

_Started 2026-05-12 15:20 UTC_

---

## User

整理设计风格给我，我想复用

## Assistant

_[tool: list_files]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: write_file]_

明白了。我看了一下 `tokens.css` + `v1-linear.css` + `v1-deep.css`，这套是 devboard 真正在用的视觉系统（Linear-style 极简）。我帮你把它整理成一份**单页 Style Guide**，可以直接引用 `tokens.css` + `v1-linear.css` 复用。

_[tool: done]_

_[tool: fork_verifier_agent]_

已整理成一份单页 **`gocell style guide.html`**，直接复用项目里的 `tokens.css` + `v1-linear.css` + `v1-deep.css`，所以下次新页面只要 `link` 这三个文件就能拿到一致的视觉。

内容分 14 节：
- **01 DNA** — 6 条核心原则（线条优先 / 单 accent / serif H1 / 高密度 / mono 元数据 / 极轻阴影）
- **02 Color** — surface、foreground、accent + semantic 三组色板，标注 oklch 数值
- **03 Type** — Instrument Serif / Geist / Geist Mono 各自的字号 + 用途
- **04 Primitives** — 圆角 4/6/10/14、三档阴影
- **05 Layout** — sidebar 232 + top 44 + content 24–28 骨架图
- **06–13 Components** — 按钮、segmented、switch、input、chip、状态点、page head、table、cell card、flag row、command palette、toast
- **14 How to reuse** — 三个 CSS 文件分工 + Do/Don't + 数字基线

右上角有 **LIGHT / DARK** 切换，dark 主题已经在 `tokens.css` 里定义好，直接生效。

## User

文字给我

## Assistant

# GoCell · Style Guide v1

极简、信息密度高、面向开发者后台。基于 **Geist + Geist Mono + Instrument Serif**，单一蓝紫色 accent，几乎纯白/纯黑底，1px 细线与极轻阴影建立层级。

**文件：** `tokens.css` · `v1-linear.css` · `v1-deep.css`

---

## 01 · 设计 DNA

六条规则用来决定任何新页面或新组件是否"长得像 GoCell"。

1. **线条而非块面** — 用 1px `--line` 细线分隔结构，几乎不用大色块或描边阴影来分区。
2. **单一 Accent** — 蓝紫 `oklch(0.58 0.19 268)`。只在主按钮、链接、focus ring、进度条出现。
3. **Serif 标题 + Sans 正文** — 页面 H1 用 Instrument Serif 增加调性；其余全部 Geist。数字与 ID 用 Geist Mono。
4. **紧凑信息密度** — 表格行 40–44px、字号 13–13.5px。按钮高 28–30px。永远优先一行装下。
5. **Mono 用于元数据** — ID、计数、时间戳、键盘快捷键、分组标签全部用 Mono + 小字号 + tracking。
6. **阴影几乎不存在** — 只在 raised 元素、激活态、模态出现，且非常浅。结构靠线，不靠 elevation。

---

## 02 · 色彩

使用 **oklch** 定义；冷调中性灰为骨架，单一蓝紫为 accent。

### Surface
| Token | Value | 用途 |
|---|---|---|
| `--bg` | `oklch(0.995 0.002 270)` | 页面底色 |
| `--bg-sunken` | `oklch(0.975 0.003 270)` | 凹陷区（sidebar、table header） |
| `--bg-raised` | `#ffffff` | 浮起卡片、按钮 |
| `--line` | `oklch(0.92 0.004 270)` | 主分隔线 |
| `--line-soft` | `oklch(0.95 0.003 270)` | 次级分隔线、hover 底 |

### Foreground
| Token | Value | 用途 |
|---|---|---|
| `--fg` | `oklch(0.18 0.008 270)` | 正文 |
| `--fg-muted` | `oklch(0.45 0.008 270)` | 次级文本 |
| `--fg-faint` | `oklch(0.62 0.006 270)` | 提示、标签、占位 |

### Accent & Semantic
| Token | Value | 用途 |
|---|---|---|
| `--accent` | `oklch(0.58 0.19 268)` | 主按钮、链接、焦点 |
| `--accent-soft` | `oklch(0.95 0.04 268)` | 焦点 ring |
| `--ok` | `oklch(0.62 0.16 150)` | healthy |
| `--warn` | `oklch(0.72 0.16 75)` | degraded |
| `--err` | `oklch(0.58 0.22 25)` | down |

> Dark 主题已在 `tokens.css` 中通过 `[data-theme="dark"]` 完整覆盖。

---

## 03 · 字体

三种字体，各司其职。

| 字体 | Token | 字号 / 字重 | 用途 |
|---|---|---|---|
| **Instrument Serif** | `--font-serif` | 28–40 / 400 | 仅页面 H1，提供调性 |
| **Geist** 600 | `--font-sans` | 16 / semibold | H2、卡片标题 |
| **Geist** 500 | `--font-sans` | 13.5 / medium | UI 正文、nav、button |
| **Geist** 400 | `--font-sans` | 13 / regular muted | 描述文字 |
| **Geist Mono** | `--font-mono` | 11–12.5 / 500 | ID、kbd、数据 |
| **Geist Mono · caps** | `--font-mono` | 10.5 / uppercase / 0.08em tracking | 分组小标签 |

---

## 04 · 圆角 / 阴影

### Radius
| Token | 值 | 用途 |
|---|---|---|
| `--r-sm` | 4px | chip、kbd |
| `--r` | 6px | button、input |
| `--r-lg` | 10px | card、table |
| `--r-xl` | 14px | modal、command palette |

### Shadow
| Token | 用途 |
|---|---|
| `--shadow-sm` | active nav、button |
| `--shadow` | toast、dropdown |
| `--shadow-lg` | modal、command palette |

---

## 05 · 页面骨架

三件套：
- 左侧 **232px** sidebar — 品牌 → command bar → nav → user card（贴底）
- 顶部 **44px** breadcrumb / top bar
- 主内容区 **24–28px** padding

---

## 06 · 按钮 & 控件

- 高度统一 **30px**
- 主按钮：`fg` 背景 + `bg` 文字（反白）
- 次按钮：白底 1px line outline
- icon-only：ghost（28×28，hover 灰底）
- 段控件（Seg）：mono 大写、激活态有 raised + shadow-sm
- 开关：36×20，启用态 accent 填充

---

## 07 · 输入

- 高度 **30–34px**，1px line，圆角 6px
- focus：`border-color: var(--accent)` + 3px accent-soft ring
- 搜索框右侧带 `⌘K` kbd hint

---

## 08 · 标签 & 状态

- **Chip**：mono 11.5px、sunken 底、1px line、4px radius — 用于版本号、region、ID 片段
- **Mono inline**：数字 / ID 直接以 mono 显示，不加底
- **状态点**：7px 圆点 + 2px 同色发光晕（18% 透明度）

---

## 09 · 页面头

```
H1 (serif 28px) + count (mono 13px)
     ↓
sub description (13px, muted)
     ↓
[ Seg ] [ Filter ] [ Primary CTA ]   ← 右对齐
```

---

## 10 · 表格

- CSS Grid 实现，列宽固定
- 表头：sunken 底，11.5px **uppercase tracking 0.06em**，500
- 数据行高 **44px**，13px
- hover：`--line-soft` 底
- 末列预留 30–40px 给 chevron / overflow
- 行内可放：状态点、名字 + 副 ID 双行、chip、mono 数字

---

## 11 · 卡片（Cell）

```
┌────────────────────────────┐
│ ID + sub-mono     status●  │
│                            │
│ ╲╱╲╱ sparkline (accent)    │
│ ──────────────────────────  │ ← line-soft
│ ops/s   p99    err         │  3-col stats
│  42     84ms   0.02%       │
└────────────────────────────┘
```

- padding 16、radius 10
- stats 上方一条 `--line-soft` 分隔
- stats label：10.5px uppercase faint；value：15px 600

---

## 12 · Flag 行

三列 grid：`key + desc` | `progress bar 4px` | `switch`
- bar 填充用 `--accent`
- 行 padding 14×18、radius 10

---

## 13 · 浮层

- **Command palette**：14vh top、580px 宽、radius 14、shadow-lg；分组标题 mono uppercase
- **Modal**：460px、radius 14、底部 sunken footer bar
- **Toast**：右下、10×14 padding、radius 10、左侧带状态点

---

## 14 · 如何复用

### 三个 CSS 文件分工
- **`tokens.css`** — 色彩、字体、圆角、阴影变量。**永远第一个引入**，包含完整 light/dark
- **`v1-linear.css`** — 所有 `.v1-*` 组件（sidebar / top / btn / input / seg / table / cell / flag / drawer）
- **`v1-deep.css`** — 所有 `.v1d-*` 浮层（command palette / modal / toast）

### Do
- Serif H1 + Mono 计数 / chip / kbd 的对比
- 1px line 为主，shadow 极少
- ID 永远 mono

### Don't
- 多 accent 色
- 彩色 chip 满天飞
- 大圆角（>14px）
- emoji、渐变背景、阴影分块

### 数字基线
`btn 30px · row 44px · sidebar 232px · top 44px · pad 24–28px · 字号 13–13.5px`

