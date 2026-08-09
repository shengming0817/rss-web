# BR-007 · Feature Flag variant 定义与取值（`http.config.flags.*`）

| 字段 | 值 |
|---|---|
| 状态 | 待评审 |
| 优先级 | P2（bool flag 已可用；variant 为增强，页面已占位） |
| 阻塞前端 | 无（Batch 4 PR-14 bool flag 全功能交付，variant 占位「即将推出」） |
| 提出方 | gocell-web |
| 估算 | 2–3 人天（涉及 flag 数据模型、evaluate 引擎、3 个契约） |
| 涉及 | `configcore/featureflag` + `flagwrite`；`contracts/http/config/flags/{create,update,evaluate}/v1/` |

---

## 1. 背景

Issue #15（T404）与设计稿要求 flag 支持 **bool / variant** 两类。当前契约 flag 对象有 `type: string` 字段，但：

- `flags.create.v1.request` = `{ key, enabled?, rolloutPercentage?, description? }` — **无 `type`、无 variant 定义入参**
- `flags.update.v1.request` = `{ enabled, rolloutPercentage, description, expectedVersion }` — **无 variant 值**
- `flags.evaluate.v1.response` = `{ data: { key, enabled } }` — **只回 bool，无命中的 variant key / value**

即 `type` 是只读自由字符串，无法创建/配置/求值 variant flag。

> 前端处理（PR-14 已交付）：bool flag 全功能（list/create/update/toggle(kill switch)/rollout%/delete）。flag `type` 只读展示；FlagsView 卡片与 FlagFormModal 含「variant 配置即将推出」占位区（i18n 文案，**不向用户暴露 BR 编号**）。代码注释保留 `BR-007 pending`。

## 2. 接口规约

### 2.1 `type` 枚举化 + create 入参

`flags.create.v1.request` 与 flag 对象的 `type` 收敛为枚举：`boolean` / `variant`（建议先二元，未来可加 `multivariate`）。create 增 `type` 入参（默认 `boolean` 向后兼容）。

### 2.2 variant 定义（create / update）

当 `type=variant` 时，请求体携带 variant 配置：

```json
{
  "type": "variant",
  "variants": [
    { "key": "control", "weight": 50 },
    { "key": "treatment", "weight": 50 }
  ]
}
```

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `variants[].key` | string | 非空、组内唯一 | variant 标识 |
| `variants[].weight` | integer | 0–100，组内总和 = 100 | 流量权重 |

flag 对象（list/get response）相应增 `variants` 字段（`type=variant` 时存在）。

### 2.3 evaluate 回 variant 值

`flags.evaluate.v1.response` 增字段，使 `useFlag` 能取命中的 variant：

```json
{ "data": { "key": "checkout.experiment", "enabled": true, "variant": "treatment" } }
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `data.variant` | string | ❌（`type=variant` 时必返回） | 该 subject 命中的 variant key（基于权重 + subject 稳定哈希） |

## 3. 验收标准

- [ ] `type` 枚举（`boolean`/`variant`）落契约；create 可指定，缺省 `boolean`
- [ ] `type=variant` 时 create/update 校验 `variants` 权重总和 = 100，否则 400 ERR_VALIDATION
- [ ] evaluate 对 variant flag 返回稳定（同 subject 多次求值同一 variant）的 `variant` 字段
- [ ] bool flag 路径不受影响（向后兼容）
- [ ] 前端 `pnpm codegen` 产出 `variants` / `variant` 字段

## 4. 演进路径

- **本 BR**：bool + variant（加权）；前端解锁 variant 配置 UI（占位区替换为 variant 编辑器 + 权重滑块组）
- **Wave 2**：multivariate / 定向规则（按 attribute 命中而非纯随机权重）；`useFlag` 增 `variant` 返回值类型

## 5. 涉及代码区域

- `contracts/http/config/flags/{create,update,evaluate}/v1/`（+ flag 对象 schema 的 `type`/`variants`）
- `cells/configcore/slices/featureflag`（evaluate 引擎：权重 + subject 哈希）+ `flagwrite`（variant 持久化与校验）

## 6. 前端联调

PR-14 已建到 ready 态。后端交付后：
1. `pnpm codegen` → flag 对象增 `variants`、evaluate response 增 `variant`
2. `FlagFormModal.vue` 的 variant 占位区替换为 variant 编辑器（复用 `RolloutSlider` 做权重）
3. `useFlag` 增 `variant: ComputedRef<string | null>` 返回（消费 evaluate 或 list 的 variant）
4. `flags/registry.ts` 的 `FlagKey` 联合可按需扩展 variant flag key
