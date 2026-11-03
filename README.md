# RSS Web

独立 Device Access（`apps/device-access`）：`pnpm dev:device-access:demo` 启动明确标识的 mock HTTP 演示；`pnpm build:device-access` 构建生产包。真实接口范围、尚缺的接缝和 MDM 消费方式见 [DA 接入与开发](apps/device-access/README.md)。

本仓维护独立部署的 旧版生产 MDM 控制台（`apps/mdm-old`）与 Identity 认证 UI（`apps/identity`）。`@rss/auth` 提供共享 cookie 会话与认证 UI，`@rss/core` 提供展示基础，`@rss/api` 拥有单一 HTTP 执行边界；每个应用独立装配唯一会话 owner，权限由后端决定。

接入、部署及会话行为见[宿主认证 UI](docs/architecture/20260917-2368-embedded-identity.md)。

MDM 无后端演示：`pnpm dev:mdm:old:demo`；生产构建：`pnpm build:mdm:old`；镜像：`pnpm image:mdm --tag rss-mdm-web:my-version`。接入、候选合同与部署见 [MDM 与 Identity 独立前端](docs/architecture/20260926-2544-mdm-web.md)。

新 React + Ant Design MDM 位于 `apps/mdm`，使用 `pnpm dev:mdm` 和 `pnpm build:mdm`，独立依赖 `@rss/auth-core`、`@rss/auth-http`、`@rss/mdm-http`。认证与业务使用同一会话 owner 和既有 `@rss/api` HTTP executor。新入口须挂载到提供正式 Identity/MDM host 配置的同源 HTTPS 宿主；Vite loopback 开发入口本身不提供后端。`pnpm image:mdm` 与既有浏览器业务验证仍显式使用旧应用，生产切换另行完成。旧应用的独立开发入口为 `pnpm dev:mdm:old`。新认证和响应式界面的真实 HTTPS Chromium 验证使用 `MDM_REACT_BACKEND=/absolute/rss-mdm pnpm test:mdm:react-auth-browser`，复用后端隔离环境与构建租约，退出确认清理；该验证不证明设备实际效果。

新 React 管理入口包括 `/authorization`（规则、授权用户组及 API Key）、`/user-profiles`（字段映射及资料投影）、`/identity`（受控账户与 Provider）。管理租户使用 `/platform/authorization`、`/platform/tenants`、`/platform/identity`。编辑单独读取详情版本；提交未知时显式查询原操作或重提同一请求，Provider/普通账户写入没有幂等回执，须显式读取比较。Key 秘密只在正式初次响应中展示，关闭、隐藏或离开会清除。

新 React 授权、租户和资料的真实 HTTPS Chromium 验证：`MDM_REACT_ADMIN_BACKEND=/absolute/rss-mdm IDENTITY_BACKEND_FIXTURE=/absolute/rss-identity pnpm test:mdm:react-administration-browser`。复用现有资料 fixture 的隔离 PG、Keycloak、MDM 宿主、构建租约与清理，以新应用运行代表旅程；不代替业务租户宿主完整启用或设备实际效果验收。

新 React 的 `/devices` 保留终端与关联身份，`/devices/:kind/:id` 提供人员、注册、关系和退管事实；`/enroll` 管理原生注册、通道准入、配额、Apple 组织、Entra 和管理员 Agent 安装配置；`/connections` 分别管理存储、邮件、WNS、Apple 材料与 Agent 连接。匿名固定安装包入口为 `/downloads/agent`，Windows 系统条款入口为 `/enrollment/windows/entra/terms`，均不要求控制台登录。

管理员安装配置只交付一份 `rss-agent-enrollment.json`；隐藏、关闭或离开页面会清除秘密下载。签发结果未知时查询原操作元数据，不能恢复秘密文件；确认撤销后才能显式开始新的签发。刷新和重认证不会自动重放写入。配额和通道读取仅供展示，新注册是否准入由服务端决定；暂停不停止已有设备维护或公开下载。

新设备、注册与连接代表旅程：`MDM_REACT_DEVICES_BACKEND=/absolute/rss-mdm pnpm test:mdm:react-devices-enrollment-browser`。入口构建新应用，复用既有设备与注册 HTTPS 夹具、构建租约和隔离清理。浏览器覆盖目录、关联原请求恢复、后台准入拒绝、单 JSON 交付及连接版本观察；输出无秘密的桌面、移动和暗色页面截图目录。合成注册与测试 PKI 只证明 HTTP 接缝；真实 Windows/macOS 安装、ADE/Entra 组织资格及设备效果分别验收。

新 React `/inventory` 提供服务端资产查询、个人保存查询、不可变任务结果、字段与展示布局和采集映射；`/groups` 管理静态、动态与嵌套设备组；`/compliance` 管理规则、评估任务及设备当前/历史结论。设备详情的资产页区分关联视图、终端命名空间、来源和历史值，并提供集合续页、手工值和采集质量读取。设备组预览评估当前条件草稿，返回最多20个匹配样例并标明扫描是否完成，不保存定义或发布正式成员；旧成员集和此前合规评估保留历史标识。

采集映射从精确 Resource 固定版本保留物理计划、脚本原文及未编辑变体，创建新的冻结版本。版本声明与每份内容上传分别确认；显示原上传标识及固定坐标，按已读取位置显式续传并查询内容回执。隐藏会清除内容缓冲；若尚未开始上传，先以原标识和冻结元数据显式开始，再读取原上传并恢复固定内容，核验长度和 SHA 后继续。脚本恢复需要原内容所在的精确固定版本；该入口不激活或发布资源。

新资产、设备组与合规 HTTPS Chromium 验证：`MDM_REACT_ASSETS_BACKEND=/absolute/rss-mdm pnpm test:mdm:react-assets-browser`。复用既有设备隔离环境、构建租约及独立清理，运行新 React 代表旅程，输出无秘密的桌面、移动和暗色截图目录。覆盖原请求恢复、服务端分页、嵌套与预览、合规历史和跨租户/权限拒绝；合成设备与字段只证明 HTTP/界面接缝，不代替 Windows/macOS 实际设备效果验收。

新 React `/certificates` 分开提供证书档案与设备 PKI：档案以目录为起点，显式打开生成、导入、编辑、精确版本导出或设置任务，支持主密码和独立权限；PKI 分别显示进程当前材料、轮换受理、撤销发布及设备观察。独立 `/recovery-credentials` 入口可在没有 InventoryRead 时按精确设备和材料坐标披露；设备详情 → 设备安全提供恢复凭据目录、FileVault 收集与托管关联、原生凭据操作及精确材料披露。RSS Login 披露使用绑定设备、材料版本和原操作的 WebAuthn 用途验证，验证完成后须显式披露。秘密和下载只在当前面板短暂保留；隐藏、关闭或离开会清除。结果未知时显式恢复原操作，不自动重放。

证书与恢复凭据真实 HTTPS Chromium 验证：`MDM_REACT_CERTIFICATES_BACKEND=/absolute/rss-mdm pnpm test:mdm:react-certificates-browser`，可追加 `certificates` 或 `recovery` 单独运行旅程。复用既有隔离 PG、HTTPS、PKI、构建租约和独立清理；覆盖档案生成/导入/导出原请求、PKI ACK 边界、配置 CAS、披露权限、WebAuthn 正确/错误用途、过期/取消及披露原操作恢复。输出仅含公开页面的桌面、平板、移动和暗色截图。合成设备与预置合法材料只证明真实 HTTP 和界面接缝，不证明 Agent 创建绑定、Windows/macOS 真机轮换或登录效果。

新 React `/audit` 提供安全审计、设备时间线和管理活动，支持独立读取权限与精确设备定位；当前 Policy 工具名、别名或共享事件定位与历史事实分别显示。设备详情 → 历史沿同一用例读取。`/webhooks` 从紧凑订阅目录进入编辑、测试事件、投递、签名材料和租户健康任务。事件排队、外部 HTTP 接收、Outbox 结算与下游完成分别显示；只有正式死信状态才提供重放或原投递恢复。

Webhook 材料写入要求最近 300 秒认证，本地密码账户可在原材料任务内重新认证，随后显式读取或重提原请求。导入密钥提交后清除，未知结果仅保留无秘密原意图；恢复导入需要重新输入相同密钥。准备、持钥确认和激活分别确认；服务端生成的密钥没有浏览器导出端点，私密交付与接收端确认由宿主负责。材料原操作查询只显示公开记录，既不把未找到当作写入失败，也不凭部分字段确认本次请求；确认需显式重提同 UUID 与冻结原输入。

审计、管理活动与 Webhook 的真实 HTTPS Chromium 验证：`MDM_REACT_AUDIT_WEBHOOKS_BACKEND=/absolute/rss-mdm pnpm test:mdm:react-audit-webhooks-browser`；仅复验公开布局时追加 `design`。入口构建新 React 应用，复用设备夹具的隔离 PG、HTTPS、构建租约和独立清理，输出公开页面的桌面、平板、移动和暗色截图。覆盖已提交响应丢失后的原请求恢复、查询范围、CAS、独立权限和材料清理。410 接收端用于观察 pending/unknown；不修改 Outbox 状态或期限制造死信。宿主持钥确认及真实设备效果分别验收。

新 React `/scopes` 与 `/policies` 提供范围定义、服务端计算结果、精确 Resource/Scope 绑定、策略配置、自助发布、分配资格、独立设备事件及软件灰度。保存 Scope 会排队计算；Policy 资格预览不保存策略、不创建运行。配置修订、执行版本、成员受理、投递与设备效果分别展示。保存响应丢失时提示结果未知，保留原操作标识且不自动重放；管理员可刷新查看当前配置。事件继续只查询原批次。Scope 保存前的只读匹配样例预览由 #3130 跟进，当前通过保存触发计算后查看正式结果。

对应真实 HTTPS Chromium 入口为 `MDM_REACT_POLICY_BACKEND=/absolute/rss-mdm pnpm test:mdm:react-policy-browser`，复用设备隔离 fixture、构建租约和独立清理；覆盖范围定义、Policy 管理、原事件身份恢复与公开响应式页面。该入口只证明真实 HTTP/界面接缝，不能代替 Windows/macOS 设备效果验收。

## Web 组件开发

`pnpm dev:ui` 启动独立组件展示页（仅 loopback）；可切换亮暗主题、中英文及禁用/只读/错误/加载/空态。展示入口不加载认证或业务 API，不进入产品镜像。直接展示当前 Vuetify 组件；主题与语言基础见 [@rss/core](packages/core/README.md)。

`make ci` 集中运行下列类型、lint、格式、测试、三个产品构建扫描及组件展示构建，收集所有失败后返回非零；日志目录在命令结束时输出。修复后可按失败项定向复验。

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

指标入口为策略 → 数据指标，采集方案在资源库中管理。设备详情使用 `/history/activity`、`/history/performance`、`/history/collection` 路由；管理页为 `/management`。遥测真实 HTTPS Chromium 验证：`MDM_DEVICE_BACKEND=/absolute/rss-mdm pnpm test:mdm:telemetry-browser`。浏览器发布精确方案版本，经真实 Agent mTLS 接收合成观测；这不替代 Windows/macOS 真机验收。

设备视图与关联的真实 HTTPS Chromium 验证：`MDM_DEVICE_BACKEND=/absolute/rss-mdm pnpm test:mdm:device-browser`。入口构建当前 UI，使用后端隔离开发环境与构建租约，退出清理 PG、产品进程与 TLS 网关；详见 [设备关联接入与验收](docs/architecture/20260926-2544-mdm-web.md#正式设备视图与关联2713)。

企业软件目录展示可用资源，来源、目标与发布记录继续消费当前正式 HTTP V1 合同；设备分配与分批配置统一在策略编辑器维护。Direct 无需发布目标，Native 选择确切版本的发布目标。独立部署、引导策略与更新页面已退出。接口、更新与恢复行为见 [软件来源与发布](docs/architecture/20260926-2544-mdm-web.md#软件来源resource导入与发布)。

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

## 固定 MDM HTTP 契约

`contracts/mdm/http-v1.json` 是提交在仓内的固定契约输入，`source.json` 记录其后端 revision、生成入口和 SHA-256。普通安装、开发、测试和构建只读取这两个本地文件，不访问后端或执行后端 Python 工具。

`pnpm install --frozen-lockfile` 安装后自动生成静态端点、类型和 CSP 安全的校验器，供编辑器使用；根命令及依赖 API 的包级 `dev`、`demo`、`typecheck`、`test`、`test:coverage`、`build` 也会先确保生成完成。生成输入未变化时直接复用本地结果；删除生成目录后，下次命令会重建。安装时若使用 `--ignore-scripts`，可执行 `pnpm generate:contracts` 初始化编辑器类型。

`packages/api/src/generated/` 是忽略的本地产物，不提交 Git。`pnpm generate:contracts` 强制重新生成；`pnpm check:contracts` 确保生成目录存在后核对本地输入与生成结果，已进入 `make ci`。并发包命令共用生成锁，失败会阻止后续命令。

升级时在选定后端 commit 的固定源码检出中运行 `python3 hack/http_contract_artifact.py --output artifacts/http-contract/http-v1.json`，生成期间保持源码不变，再复制到本仓 `contracts/mdm/http-v1.json`，同时更新 pin 的 revision、generator、SHA-256。后端不再提交完整 JSON，因此 pin 不记录已退役的后端文件路径或 Git blob。随后运行 `pnpm generate:contracts` 并迁移实际消费者；PR 提交契约输入与 pin，不提交生成目录。不会追随远端 develop。生产 HTTP 调用使用 `@rss/api/mdm-operations`；作者模型和 canonical 编码复用 `@rss/api/mdm-types`、`@rss/api/mdm-validators`；其它领域投影和未知编辑输入使用 `@rss/api/mdm-schemas` 自动导出的 scoped 类型与静态校验器，不维护第二套 wire 定义。整数按 JavaScript 精确范围校验，浮点字段保留 producer 的数值语义。Identity 与宿主静态配置继续使用原有边界。

新 React `/resources` 统一管理软件、脚本、配置、Native/Agent 采集和遥测方案的精确版本、变体、Blueprint 与完整定义。元数据保留未编辑键；声明版本、每份内容提交和激活分别确认。文件按块校验与传输；尚未发起上传的本地准备可以放弃。开始请求结果未知时保留原上传标识，显式恢复；冲突或提交未知后，显式读取原上传位置或内容回执，再继续同一操作。下载支持浏览器流式保存，以及最大 16 MiB 的小文件模式；隐藏、权限变化或离开会释放内容与临时下载。

新 React `/software` 复用软件 Resource 目录，详情按需读取。来源支持注册不可变版本、发现及精确导入；软件准入、WinGet/Brew 源发布与撤回各自保留版本与原操作。发布目标由宿主配置并只读展示；Direct 材料不要求先配置或发布原生源。目录名称筛选仅作用于本页，服务端查询使用高级目录筛选。

新软件真实 HTTPS Chromium 入口：`MDM_REACT_SOFTWARE_BACKEND=/absolute/rss-mdm pnpm test:mdm:react-software-browser`。复用独立 PG、存储、测试 PKI、受控 TLS WinGet 来源、构建租约与退出清理；旅程包含精确导入、丢失写响应、材料续传与回执、准入、私有下载和源发布撤回，并输出桌面、移动和暗色截图。受控来源与合成材料证明 HTTP/界面接缝，不证明设备安装效果；该 WinGet 夹具不证明真实 Brew 来源接入。
