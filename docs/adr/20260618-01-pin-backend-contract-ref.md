# ADR 20260618-01 · Pin 后端契约 ref，停止追后端 develop HEAD

| 字段 | 值 |
|---|---|
| 状态 | 已接受 |
| 日期 | 2026-06-18 |
| 关联 | gocell-web #66/#70（contracts 漂移）、#71/#72（cells→corecells）、#73（本 ADR 实施） |

## 背景

`tools/codegen`（→ `packages/contracts/src/`）与 `tools/cell-manifest`（→ `packages/devboard/src/manifest/`）都从后端 `ghbvf/gocell` 派生产物。两个 CI 守门 `codegen-diff` / `cell-manifest-diff` 是 AI-robust **Hard** 门：每次 CI 把后端**当场重新生成**并断言"已提交产物 == 重生成结果"。

问题在于**绑定的粒度**:CI checkout 的是后端**默认分支 `develop` 的 HEAD（未 pin）**。于是已提交产物必须时刻等于"后端 HEAD 的派生结果"。后果——后端任意推进,前端**零改动也红**:

- 后端把 `cells/` 重命名为 `corecells/` → `cell-manifest-readonly` 在所有前端 PR 上红（#71）。
- 后端 schema 漂移（多租户 tenantId、device-identity 等）→ `codegen-readonly` 红（#66）。
- 最隐蔽:#70/#72 实施期间后端 HEAD 在两次生成之间前移,导致 develop 上**两个产物分别对应不同后端 SHA**(contracts@6a6221fa 无 `auth/decide`;manifest 已含更晚的 `sessionverifyrpc`),两个门**无法同时**对任一单一后端 HEAD 转绿。

绑"契约"本身是对的(类型安全单源,免手写 DTO);错在绑"**后端的活动分支**"而非"**一个被前端 pin 的版本**"。

## 决策

**Pin 后端 ref。** 前端在 `tools/.gocell-ref` 记录一个 `ghbvf/gocell` 的 commit SHA;两个 workflow checkout **该 SHA**(而非 `develop` HEAD)再重生成校验。

- 后端如何推进都**不再**影响前端 CI。
- 吸收后端契约/cell 变更 = 一次**显式、可 review 的 "bump-ref" PR**:改 `tools/.gocell-ref` 的 SHA → 重跑 `pnpm codegen` + `pnpm cell-manifest` → 提交两个产物。两个产物因此**永远对应同一后端 SHA**,不再错位。
- 本 ADR 首次 pin 到 `0a3e1c548`,并把 develop 上错位的产物重生成对齐到该 SHA(顺带落地 `http.auth.decide.v1` 类型,仅类型不接 UI)。

## 后果

- (+) 后端推进不再无故打红前端 CI;前端**自主决定**何时吸收上游变更。
- (+) 两个派生产物保证同源同 SHA,消除本次的错位类故障。
- (+) `codegen-diff` / `cell-manifest-diff` 仍是 **Hard** 门(codegen + `git diff --exit-code`),只是把输入从"移动的 HEAD"换成"确定的 SHA"——确定性更强。
- (−) 前端不再自动获得后端最新契约,需显式 bump(这正是期望的解耦行为)。
- 本地开发:工具默认仍读同级 `../gocell`(开发者本地 checkout 任意 ref);pin 主要约束 **CI** 的确定性。本地若要复现 CI,checkout `tools/.gocell-ref` 的 SHA 或设 `GOCELL_CONTRACTS_DIR`/`GOCELL_CELLS_DIR`。

## 备选方案

- **vendor / git submodule pin SHA**:把后端 schema/cells 复制或 submodule 进前端 → 守门完全离线。比 pin-ref 重,暂不取。
- **消费版本化契约包 / Buf BSR**:后端已有 `buf.gen.yaml`;若后端发版 `@gocell/contracts@x.y.z` 或推 BSR,前端 pin 版本即可,目录改名都无感。**推荐的长期方向**,需后端协同发版,另起讨论。

pin-ref 是其中**成本最低、立即可落**的一档,先行采用;不排斥后续演进到版本化契约包。
