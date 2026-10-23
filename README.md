# RSS Web

本仓维护独立部署的 MDM 控制台（`apps/mdm`）与 Identity 认证 UI（`apps/identity`）。`@rss/auth` 提供共享 cookie 会话与认证 UI，`@rss/core` 提供展示基础，`@rss/api` 拥有单一 HTTP 执行边界；每个应用独立装配唯一会话 owner，权限由后端决定。

接入、部署及会话行为见[宿主认证 UI](docs/architecture/20260917-2368-embedded-identity.md)。

MDM 无后端演示：`pnpm dev:mdm:demo`；生产构建：`pnpm build:mdm`；镜像：`pnpm image:mdm --tag rss-mdm-web:my-version`。接入、候选合同与部署见 [MDM 与 Identity 独立前端](docs/architecture/20260926-2544-mdm-web.md)。

## Web 组件开发

`pnpm dev:ui` 启动独立组件展示页（仅 loopback）；可切换亮暗主题、中英文及禁用/只读/错误/加载/空态。展示入口不加载认证或业务 API，不进入产品镜像。组件契约见 [@rss/core](packages/core/README.md)。

`make ci` 集中运行下列类型、lint、格式、测试、两产品构建扫描及组件展示构建，收集所有失败后返回非零；日志目录在命令结束时输出。修复后可按失败项定向复验。

## 开发与验证

使用 Node.js 22、pnpm 11.4.0：

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test:coverage
pnpm test:boundary
pnpm build
```

`pnpm dev` 持续构建 `apps/identity/dist`，不启动独立 HTTP 页面或 API。交互开发复用已配置的 HTTPS 开发宿主，把该目录只读挂载到网关；完成首次构建后，打开宿主的租户登录地址，修改后等待重建完成并手动刷新。完整接入、检查和退出步骤见[交互开发](docs/architecture/20260917-2368-embedded-identity.md#交互开发)。没有宿主时可运行上述组件测试与构建。

`pnpm build:identity` 是生产构建和产物安全扫描的唯一实现，`pnpm build` 分别调用 Identity 和 MDM 的生产构建。镜像构建使用当前工作树，允许未提交修改，不要求 Git revision：

```bash
pnpm image:identity --tag rss-identity-web:my-version
```

必要的真实 HTTP 联调使用本地 rss-identity 测试 fixture，要求 Docker 和后端工具链：

```bash
IDENTITY_BACKEND_FIXTURE=/absolute/path/to/rss-identity pnpm test:identity:joint
```

该入口构建当前 UI，通过 jsdom 的生产 XMLHttpRequest transport 访问真实 HTTPS 宿主，覆盖 cookie/CSRF、账户、Provider、step-up 和故障语义。它不是实际浏览器或生产部署验收。中断与超时仍等待 fixture 清理；清理失败返回非零并显示恢复目录，不输出凭据和原始响应。不要求提交、干净 checkout 或源码/产物摘要证明，可复用构建缓存。

历史来源记录保留在 [`docs/migration/20260809-001-gocell-web-source-baseline.md`](docs/migration/20260809-001-gocell-web-source-baseline.md)，不作为当前功能或操作入口。

正式 Policy 自助配置的实际浏览器验收使用 Chromium 和独立 HTTPS MDM 开发环境（不接入 demo）：

```bash
pnpm exec playwright install chromium
MDM_POLICY_BROWSER_FIXTURE=/absolute/path/to/private-fixture.json pnpm test:mdm:policy-browser
```

fixture 由隔离宿主准备，包含 `origin`（https://localhost:端口）、`tenant`、`instance`、`principal`、`login`、`passwordFile`，以及 `script`（迁移后 access=null/published=false、保留 false/1 的可编辑脚本 Policy）、`software`（已准入的 available_install Policy）和 `selectors`（同租户有效 IdP 群组、部门 exact/subtree、启用静态用户群组的正式 selector）。引用版本须已激活、设备 Scope 已发布；另含 `reader: {login,passwordFile}`（仅 policy_read/resource_read 的账户）；`departmentDirectory=true` 时在可信部门目录中选取，否则通过正式 API 预置固定部门引用并验证界面回读保留。生产 UI 由该宿主网关提供。入口更改这些可丢弃 Policy，覆盖脚本/软件三种访问模式及刷新、空范围、撤回保持后台配置、真实 400/401/403/409 与丢失已提交写响应后的锁定；退出关闭浏览器，不记录凭据、页面、网络响应或追踪。宿主资源由创建它的开发环境负责清理；此入口不证明 Windows/macOS 实际安装效果。

注册与管理员 PKI／Agent 恢复旅程可使用 `MDM_ENROLLMENT_BACKEND=/absolute/rss-mdm pnpm test:mdm:enrollment-browser` 自动搭建并清理隔离 HTTPS 环境；已有宿主入口为 `MDM_ENROLLMENT_BROWSER_FIXTURE=/absolute/private-fixture.json pnpm test:mdm:enrollment-browser`；fixture、原生／PKI前提和逐项覆盖边界见 [MDM 接入说明](docs/architecture/20260926-2544-mdm-web.md#原生注册组织接入与-agent-安装交付2633)。

指标与历史入口为设置 → 数据采集，采集方案在资源库中管理。设备详情使用 `/history/activity`、`/history/performance`、`/history/collection` 路由；管理页为 `/management`。遥测真实 HTTPS Chromium 验证：`MDM_DEVICE_BACKEND=/absolute/rss-mdm pnpm test:mdm:telemetry-browser`。浏览器发布精确方案版本，经真实 Agent mTLS 接收合成观测；这不替代 Windows/macOS 真机验收。

设备视图与关联的真实 HTTPS Chromium 验证：`MDM_DEVICE_BACKEND=/absolute/rss-mdm pnpm test:mdm:device-browser`。入口构建当前 UI，使用后端隔离开发环境与构建租约，退出清理 PG、产品进程与 TLS 网关；详见 [设备关联接入与验收](docs/architecture/20260926-2544-mdm-web.md#正式设备视图与关联2713)。

软件直接发布与设备分批部署消费当前正式 HTTP V1 合同。来源、目标与发布记录来自正式目录；Direct 无需发布目标，Native 选择确切版本的发布目标。部署默认全量，分批配置为可选。接口、更新与恢复行为见 [软件来源与发布](docs/architecture/20260926-2544-mdm-web.md#软件来源resource导入与发布)。

正式软件发布、版本更新与分批部署的 HTTPS Chromium 验证：

```bash
MDM_SOFTWARE_BACKEND=/absolute/rss-mdm pnpm test:mdm:software-browser
```

软件验收复用设备 HTTPS/存储/PKI 夹具，使用独立 software-browser 环境。受控 TLS WinGet REST 仅提供合成来源元数据；正式生产页面完成导入原操作重放、Resource 上传进度恢复/完成回执、软件版本准入及私有下载撤回核验。输入与注册为合成夹具，不证明真实设备安装。运行记录实际后端 revision，退出要求清理确认。

后端使用指定检出；入口构建当前 UI，并复用后端隔离环境与构建租约。覆盖真实来源/目标/发布目录、单目标发布、已提交响应丢失后的原操作查询与显式重放、默认全量、显式版本更新、Native 目标与多个 Scope、时间/成功率门槛配置、状态查询、暂停与撤回。退出独立清理 PG、产品进程和 TLS 网关；结果记录实际后端 revision。仅使用合成输入，不证明 Agent 真机安装或升级。


业务登录使用 `/login`，平台管理使用 `/platform`；业务配置管理员首次登录按后台进度进入引导，完成后进入工作台。统一设置与平台租户入口见 [MDM 接入说明](docs/architecture/20260926-2544-mdm-web.md#统一设置默认组织引导与平台租户2825)。当前宿主配置同时要求业务 tenant 与 managementTenant，须同步部署后端生成器和前端。正式 HTTPS 接缝验证使用 `MDM_SETTINGS_BACKEND=/absolute/rss-mdm pnpm test:mdm:settings-browser`；外部资格、宿主启用回执与真机效果分别保留验收边界。

标准采集包、固定周期、设备人员与资产范围的操作和真实 HTTPS 验证见 [设备资产与采集接入](docs/architecture/20260926-2544-mdm-web.md#标准采集包与资产质量2727)。页面刷新只读取已上报数据。

正式执行总览、设备控制、原操作恢复、审计/设备时间线与运行诊断的 HTTPS Chromium 验证：`MDM_OPERATIONS_BACKEND=/absolute/rss-mdm pnpm test:mdm:operations-browser`。复用设备入口的隔离环境与清理，使用明确授权的可丢弃测试账户及合成 Windows 注册能力，只验证 UI/API 接缝；不代表真实重启、锁定、擦除效果。

用户字段配置与资料显示的实际 HTTPS 验证：`MDM_PROFILE_BACKEND=/absolute/rss-mdm IDENTITY_BACKEND_FIXTURE=/absolute/rss-identity pnpm test:mdm:profiles-browser`。当前固定后端与验证边界见 [用户字段与登录资料](docs/architecture/20260926-2544-mdm-web.md#用户字段与登录资料2878)。

新增能力的正式控制台验证使用 `MDM_CONSOLE_BACKEND=/absolute/rss-mdm pnpm test:mdm:console-browser`，覆盖恢复凭据、Policy 退役、Webhook 订阅原请求恢复/投递观察及 Key/平台白名单。复用既有构建租约、隔离 HTTPS 宿主和独立清理；只使用可丢弃合成输入，设备实际效果另行验收。接口与恢复边界见 [控制台新增能力](docs/architecture/20260926-2544-mdm-web.md#控制台新增能力2799)。
