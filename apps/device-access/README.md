# RSS Device Access

独立 Vue / Vuetify 中文管理应用，服务于 #2874 / #2925。计算机拥有完整页面与快速查看；资产归属、账号绑定、企业 Passkey 记录、恢复材料和轮换均在当前计算机详情内。没有独立 Passkey、轮换或人工离职/换机工作台。

## 开发与演示

```sh
pnpm install --frozen-lockfile
pnpm dev:device-access:demo
# http://127.0.0.1:4328
# demo / demo；只读账号 reader / demo
```

此入口明确使用 loopback HTTP mock 服务，含合成登录、Cookie / CSRF、拒权、冲突、响应未知、过期和离线场景。页面不直接读写 fixtures；现有共享 session owner 仍持有认证状态。演示不调用真实设备或产生有效恢复材料。切换故障后手动重新读取；未知写只能查询原操作，不自动重发。

演示凭据只用于这个本地 HTTP 服务，不能用于任何正式宿主。demo 模式只允许 serve，禁止构建发布；生产入口不能导入 demo。

## 生产组合

```sh
pnpm build:device-access
```

产物为 `apps/device-access/dist`。静态文件与 `/api/v1/identity`、`/api/v1/identity-host`、MDM 当前公开管理 HTTP V1 位于同一个 HTTPS origin。复用已有 `/api/v1/identity-host/config.json` 和 `/api/v1/mdm-host/config.json`，严格核对 canonicalOrigin、tenant 和 serviceId；网关需将 `/computers/...` 等前端路径回落到 index.html。配置失败不启动模拟会话或切到 mock。

独立 DA creates one `@rss/auth` session；MDM 是另一个独立应用实例，继续持有自己的唯一 owner。共享 `bindSession` 只将业务请求交给既有 owner，不复制 Cookie/CSRF，不另造刷新或重试控制器。新增可注入登录视图后，Identity/MDM 默认视图保持原行为。

## 实际接口范围

| 能力 | 当前入口 |
| --- | --- |
| 计算机目录/详情 | 正式 device-views；将 association 中的真实 endpoint 分别保留，写入不使用 association ID |
| Device Access 绑定、因子重置、原操作查询 | 正式设备级 device-access；读权限仍由后端 AccountWrite 等规则判断 |
| 企业 RP 配置 | 正式 enterprise/configuration；只能配置宿主已登记的 RP，不创建任意 IdP client |
| 账户 WebAuthn | 正式 Identity begin/finish/cancel、凭据列表/移除；浏览器需支持 Level 3 JSON conversion |
| 恢复元数据、RSS 材料查阅 | 正式 recovery-credentials 目录与 DA 专用 POST disclosure；必要时使用用途绑定 step-up |
| 审计、设备时间线 | 正式公开目录，展示安全事实，不输出秘密 |
| 资产使用人 + 资产所有人统一编辑 | 本轮 candidate mock；不得将 registration-user 静默当成这两个字段 |
| 逐计算机企业 Passkey 记录 | 本轮 candidate mock；现有账户 WebAuthn 列表不能证明凭据位于哪台设备 |
| DA 配置编排 / 范围核对 | 本轮 candidate mock；正式 Policy device_access 动作已存在，但此编辑模型的完整投影与 Scope/排除映射尚待接线 |
| RSS 本机恢复轮换直接操作 | 本轮 candidate mock；已有 Windows credential 领域动作不能直接发给只接 Apple Action 的 recovery-credentials/operations HTTP 入口 |
| 跨计算机 DA 汇总 | 未接入，不从当前页计算“全组织成功率” |

生产对这些未就绪能力显示不可用，不请求猜测端点或回退到样例成功。真实 SSO 应用入口、Desktop Broker 证明交接、Windows/macOS 实际效果、独立 HTTPS 浏览器与宿主 CSP 验收仍须对应固定候选验证；本轮 mock 接缝不证明这些结果。不能据本 PR 自动完成原工作项全部真实验收。

## MDM 消费

`@rss/device-access/client` 提供注入 transport 的客户端，`/model` 提供类型，`/components` 提供可选 Vuetify 摘要。DA 直接编辑资产，MDM 按需消费同一后端事实；这不是嵌入整套 DA 控制台。摘要不创建会话、不写业务、不接收私钥或恢复明文。个人 Vault 目录不向资产管理员开放。

已确认设计来源为本会话 2026-10-26 的独立 DA 原型。实现保留名称选择、核对、原操作恢复、完整详情和浅色主题，不将 prototype 内存赋值当作生产业务。

## 验证

`make ci` 汇总所有检查并包含 DA 类型、测试、生产构建与 demo 泄漏扫描。新测试覆盖公开 DTO、跨对象拒绝、唯一会话、请求代次、未知写锁定、浏览器认证取消和实际 loopback HTTP Cookie/CSRF 接缝。真实设备验收独立记录。

上游参考：Vuetify v4.3.0 `packages/vuetify/src/components/VDialog/VDialog.tsx`；W3C WebAuthn Level 3（2026-08-25）§5.1.8–§5.1.10。不复制认证器密码学。
