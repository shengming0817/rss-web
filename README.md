# RSS Web

本仓拥有三个独立应用：React + Ant Design MDM（`apps/mdm`）、React + Ant Design Identity（`apps/identity`）和独立 Device Access（`apps/device-access`）。各应用独立装配会话；`@rss/api` 是唯一 HTTP executor。

MDM 的宿主、部署、回退和验收入口见 [MDM 与 Identity 独立前端](docs/architecture/20260926-2544-mdm-web.md)。Identity 接入见[宿主认证 UI](docs/architecture/20260917-2368-embedded-identity.md)；独立 DA 见 [DA 接入与开发](apps/device-access/README.md)。

生产 MDM 使用 React + Ant Design，位于 `apps/mdm`，使用 `pnpm dev:mdm` 和 `pnpm build:mdm`，独立依赖 `@rss/auth-core`、`@rss/auth-http`、`@rss/mdm-http`。认证与业务使用同一会话 owner 和既有 `@rss/api` HTTP executor。新入口须挂载到提供正式 Identity/MDM host 配置的同源 HTTPS 宿主；Vite loopback 开发入口本身不提供后端。镜像使用 `pnpm image:mdm --tag rss-mdm-web:my-version`。新认证和响应式界面的真实 HTTPS Chromium 验证使用 `MDM_REACT_BACKEND=/absolute/rss-mdm pnpm test:mdm:react-auth-browser`，复用后端隔离环境与构建租约，退出确认清理；该验证不证明设备实际效果。

新 React 管理入口包括 `/authorization`（规则、授权用户组及 API Key）、`/user-profiles`（字段映射及资料投影）、`/identity`（受控账户与 Provider）。管理租户使用 `/platform/authorization`、`/platform/tenants`、`/platform/identity`。编辑单独读取详情版本；提交未知时显式查询原操作或重提同一请求，Provider/普通账户写入没有幂等回执，须显式读取比较。Key 秘密只在正式初次响应中展示，关闭、隐藏或离开会清除。

新 React 授权、租户和资料的真实 HTTPS Chromium 验证：`MDM_REACT_ADMIN_BACKEND=/absolute/rss-mdm IDENTITY_BACKEND_FIXTURE=/absolute/rss-identity pnpm test:mdm:react-administration-browser`。复用现有资料 fixture 的隔离 PG、Keycloak、MDM 宿主、构建租约与清理，以新应用运行代表旅程；不代替业务租户宿主完整启用或设备实际效果验收。

新 React 的 `/devices` 保留终端与关联身份，`/devices/:kind/:id` 提供人员、注册、关系和退管事实；`/enroll` 管理原生注册、通道准入、配额、Apple 组织、Entra 和管理员 Agent 安装配置；`/connections` 分别管理存储、邮件、WNS、Apple 材料与 Agent 连接。匿名固定安装包入口为 `/downloads/agent`，Windows 系统条款入口为 `/enrollment/windows/entra/terms`，均不要求控制台登录。

管理员安装配置只交付一份 `rss-agent-enrollment.json`；隐藏、关闭或离开页面会清除秘密下载。签发结果未知时查询原操作元数据，不能恢复秘密文件；确认撤销后才能显式开始新的签发。刷新和重认证不会自动重放写入。配额和通道读取仅供展示，新注册是否准入由服务端决定；暂停不停止已有设备维护或公开下载。

签名 Agent 安装 JSON 的真实交付需要受控宿主部署观察；当前源码隔离 fixture 在连接发布处被正式前提拒绝，由 #3144 跟踪。保留现有安装配置 HTTP mock/组件覆盖，不能用已删除的私有 integration seed 代替正式部署回执。

新设备、注册与连接代表旅程：`MDM_REACT_DEVICES_BACKEND=/absolute/rss-mdm pnpm test:mdm:react-devices-enrollment-browser`。入口构建新应用，复用既有设备与注册 HTTPS 夹具、构建租约和隔离清理。浏览器覆盖目录、关联原请求恢复、后台准入拒绝、单 JSON 交付及连接版本观察；输出无秘密的桌面、移动和暗色页面截图目录。合成注册与测试 PKI 只证明 HTTP 接缝；真实 Windows/macOS 安装、ADE/Entra 组织资格及设备效果分别验收。

新 React `/inventory` 提供服务端资产查询、个人保存查询、不可变任务结果、字段与展示布局和采集映射；`/groups` 管理静态、动态与嵌套设备组；`/compliance` 管理规则、评估任务及设备当前/历史结论。设备详情的资产页区分关联视图、终端命名空间、来源和历史值，并提供集合续页、手工值和采集质量读取。设备组预览评估当前条件草稿，返回有界匹配样例（当前最多1000个）并标明扫描是否完成，不保存定义或发布正式成员；旧成员集和此前合规评估保留历史标识。

采集映射从精确 Resource 固定版本保留物理计划、脚本原文及未编辑变体，创建新的冻结版本。版本声明与每份内容上传分别确认；显示原上传标识及固定坐标，按已读取位置显式续传并查询内容回执。隐藏会清除内容缓冲；若尚未开始上传，先以原标识和冻结元数据显式开始，再读取原上传并恢复固定内容，核验长度和 SHA 后继续。脚本恢复需要原内容所在的精确固定版本；该入口不激活或发布资源。

`/inventory/software` 提供已采集软件的双域查询、标准软件及映射维护。查询结果固定到原任务，支持查看分桶、设备、证据和覆盖质量，并显式释放结果。

新资产、设备组与合规 HTTPS Chromium 验证：`MDM_REACT_ASSETS_BACKEND=/absolute/rss-mdm pnpm test:mdm:react-assets-browser`。复用既有设备隔离环境、构建租约及独立清理，运行新 React 代表旅程，输出无秘密的桌面、移动和暗色截图目录。覆盖原请求恢复、服务端分页、嵌套与预览、合规历史和跨租户/权限拒绝；合成设备与字段只证明 HTTP/界面接缝，不代替 Windows/macOS 实际设备效果验收。

新 React `/certificates` 分开提供证书档案与设备 PKI：档案以目录为起点，显式打开生成、导入、编辑、精确版本导出或设置任务，支持主密码和独立权限；PKI 分别显示进程当前材料、轮换受理、撤销发布及设备观察。独立 `/recovery-credentials` 入口可在没有 InventoryRead 时按精确设备和材料坐标披露；设备详情 → 设备安全提供恢复凭据目录、FileVault 收集与托管关联、原生凭据操作及精确材料披露。RSS Login 披露使用绑定设备、材料版本和原操作的 WebAuthn 用途验证，验证完成后须显式披露。秘密和下载只在当前面板短暂保留；隐藏、关闭或离开会清除。结果未知时显式恢复原操作，不自动重放。

证书与恢复凭据真实 HTTPS Chromium 验证：`MDM_REACT_CERTIFICATES_BACKEND=/absolute/rss-mdm pnpm test:mdm:react-certificates-browser`，可追加 `certificates` 或 `recovery` 单独运行旅程。复用既有隔离 PG、HTTPS、PKI、构建租约和独立清理；覆盖档案生成/导入/导出原请求、PKI ACK 边界、配置 CAS、普通披露权限及 FileVault 接缝。RSS Login 的用途验证/原披露恢复保留当前 HTTP mock 与组件覆盖，RSS Login 秘密披露真实正向路径尚未验收；不再使用已退出的 MDM DA 私有表作为前态。输出仅含公开页面的桌面、平板、移动和暗色截图。合成设备与预置合法材料只证明真实 HTTP 和界面接缝，不证明 Agent 创建绑定、Windows/macOS 真机轮换或登录效果。

新 React `/audit` 提供安全审计、设备时间线和管理活动，支持独立读取权限与精确设备定位；当前 Policy 工具名、别名或共享事件定位与历史事实分别显示。设备详情 → 历史沿同一用例读取。`/webhooks` 从紧凑订阅目录进入编辑、测试事件、投递、签名材料和租户健康任务。事件排队、外部 HTTP 接收、Outbox 结算与下游完成分别显示；只有正式死信状态才提供重放或原投递恢复。

Webhook 材料写入要求最近 300 秒认证，本地密码账户可在原材料任务内重新认证，随后显式读取或重提原请求。导入密钥提交后清除，未知结果仅保留无秘密原意图；恢复导入需要重新输入相同密钥。准备、持钥确认和激活分别确认；服务端生成的密钥没有浏览器导出端点，私密交付与接收端确认由宿主负责。材料原操作查询只显示公开记录，既不把未找到当作写入失败，也不凭部分字段确认本次请求；确认需显式重提同 UUID 与冻结原输入。

审计、管理活动与 Webhook 的真实 HTTPS Chromium 验证：`MDM_REACT_AUDIT_WEBHOOKS_BACKEND=/absolute/rss-mdm pnpm test:mdm:react-audit-webhooks-browser`；仅复验公开布局时追加 `design`。入口构建新 React 应用，复用设备夹具的隔离 PG、HTTPS、构建租约和独立清理，输出公开页面的桌面、平板、移动和暗色截图。覆盖已提交响应丢失后的原请求恢复、查询范围、CAS、独立权限和材料清理。410 接收端用于观察 pending/unknown；不修改 Outbox 状态或期限制造死信。宿主持钥确认及真实设备效果分别验收。

React `/policies` 统一配置、范围和记录。Policy 草稿包含总范围及带稳定 ID 的软件批次范围，通过一次 Policy CAS 保存；没有独立 Scope 写入入口。范围样例使用 Policy / 批次上下文，可在保存前按通道预览；未完成扫描或未知来源不能解释为空范围。正式结果与重算使用相同所有者上下文，重算不推进 Policy 配置修订。资格预览要求范围已保存。配置修订、执行版本、成员受理、投递与设备效果分别展示。未知写入冻结原操作，通过原操作回执确认或经显式确认重发相同请求；读取当前状态不能确认原操作。编辑冲突保留草稿，由用户核对最新修订后继续。

资源、设备、组、策略等目录和范围选择器使用正式字段能力构造同一份 RSQL：常用条件与高级 AND/OR 条件、原文编辑、排序、列和分页共享 URL 状态。列表只显示服务端当前页，不本地模拟全集或逐行补详情。设备、关联成员、执行与敏感操作使用 deviceId；绑定代次、因子代次、源 epoch 和凭据保管 epoch 各自保留。软件资产结果的可选维度完全取自任务状态；整数安装证据保持十进制字符串（包括完整 i64 边界），不转换成 JavaScript number。

Policy 的“名称与入口”区分显示名称、稳定工具名、唯一别名和共享事件；清空字段并保存撤回该策略的关联，历史批次成员保持原版本。选择已核对的 Agent 终端后可复制可用的查看链接或等价 `rssmdm open` 命令；原任务链接须匹配当前设备、attempt 与精确版本。事件、批次和精确步骤也可复制为只读地址。命令不承载参数、凭据或批准。批次成员可进入原执行、Policy 与活动审计，各页仍按原权限读取。

Web 使用 `rssmdm://view/v1` 查看地址。规范向量在 `contracts/agent-entry/v1-vectors.json`，由 Web 自身的入口测试验证。

对应真实 HTTPS Chromium 入口为 `MDM_REACT_POLICY_BACKEND=/absolute/rss-mdm pnpm test:mdm:react-policy-browser`，复用设备隔离 fixture、构建租约和独立清理；覆盖范围定义、Policy 管理、原事件身份恢复与公开响应式页面。该入口只证明真实 HTTP/界面接缝，不能代替 Windows/macOS 设备效果验收。

新 React `/telemetry` 可直接定位终端，设备详情的“遥测与采集”复用同一工作区。历史与 latest 查询保留设备、来源、源 epoch、字段版本和维度；选择实际观察序列后查询服务端聚合。接收健康和设备自报缺口分别读取，空缺口不代表完整覆盖。配置预览读取绑定的精确 Resource 版本与当前 Policy，采样定义在资源库维护，分配在策略维护；刷新只读数据。浏览器拒绝无法精确表示的整数，避免展示舍入结果。

真实 HTTPS Chromium 入口：`MDM_REACT_TELEMETRY_BACKEND=/absolute/rss-mdm pnpm test:mdm:react-telemetry-browser`。复用设备隔离环境、构建租约及独立清理，经 Agent mTLS 上报合成观察，验证查询、配置预览、权限拒绝和响应式布局，并输出公开截图。它证明 UI/HTTP 接缝，不替代 Windows/macOS 真机采集效果验收。

新 React `/setup` 从首次配置意图、显式跳过理由进入实际配置与当前观察核对；`/settings` 提供业务与管理租户的授权过滤目录。首次配置完成意图由后端持有，后续降级仍显示当前状态，不重新强制进入引导。刷新/重登录可读取后台意图并按原操作 UUID 查询回执；近期认证后须显式继续，未知结果不自动重放。

操作排障位于 `/operation-diagnostics`，平台管理使用 `/platform/operation-diagnostics`。可用 HTTP 请求编号、原操作定位或对象、设备、主体及记录时间发现证据。原回执、请求尝试、审计和设备执行分别展示。DA 排障使用业务会话中的 Device Access 上下文。设备动作在输入 PIN 或确认前显示当前产品支持、设备前提与权限。排障和动作预览的真实 HTTPS Chromium 证据由执行、审计及管理旅程覆盖，真机效果单独验收。

`/diagnostics` 使用独立运行诊断权限。当前后端仍输出旧中央聚合，正式入口明确显示新合同尚未就绪，缺口登记为 #3140。`pnpm dev:mdm:diagnostics:demo` 在 loopback 启动显式模拟页面，展示候选 owner 的健康、队列及恢复进度；该入口只演示诊断，不提供登录或产品服务，不进入生产构建。`pnpm test:mdm:react-diagnostics-demo-browser` 验证模拟页面；`MDM_REACT_SETUP_BACKEND=/absolute/rss-mdm pnpm test:mdm:react-setup-browser` 验证真实初始化 HTTP/UI 接缝并确认隔离清理。模拟结果不证明实际后端健康或 Windows/macOS 设备效果。

## Web 组件开发

`pnpm dev:ui` 启动独立组件展示页（仅 loopback）；可切换亮暗主题、中英文及禁用/只读/错误/加载/空态。展示入口不加载认证或业务 API，不进入产品镜像。直接展示当前 Ant Design 组件；主题与语言基础见 [@rss/core](packages/core/README.md)。

`make ci` 集中运行下列类型、lint、格式、测试、三个产品构建扫描及组件展示构建，收集所有失败后返回非零；日志目录在命令结束时输出。修复后可按失败项定向复验。

## 开发与验证

使用 Node.js 22、pnpm 11.4.0：

```bash
make prepare-contract
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test:coverage
pnpm test:boundary
pnpm build
```

`pnpm dev` 持续构建 `apps/identity/dist`，不启动独立 HTTP 页面或 API。交互开发复用已配置的 HTTPS 开发宿主，把该目录只读挂载到网关；完成首次构建后，打开宿主的租户登录地址，修改后等待重建完成并手动刷新。完整接入、检查和退出步骤见[交互开发](docs/architecture/20260917-2368-embedded-identity.md#交互开发)。没有宿主时可运行上述组件测试与构建。

`pnpm build:identity` 是生产构建和产物安全扫描的唯一实现，`pnpm build` 分别调用 Identity、MDM 和独立 DA 的生产构建。镜像构建使用当前工作树，允许未提交修改，不要求 Git revision：

```bash
pnpm image:identity --tag rss-identity-web:my-version
```

必要的真实 HTTP 联调使用本地 rss-identity 测试 fixture，要求 Docker 和后端工具链：

```bash
IDENTITY_BACKEND_FIXTURE=/absolute/path/to/rss-identity pnpm test:identity:joint
```

该入口构建当前 UI，通过 jsdom 的生产 XMLHttpRequest transport 访问真实 HTTPS 宿主，覆盖 cookie/CSRF、账户、Provider、step-up 和故障语义。它不是实际浏览器或生产部署验收。中断与超时仍等待 fixture 清理；清理失败返回非零并显示恢复目录，不输出凭据和原始响应。不要求提交、干净 checkout 或源码/产物摘要证明，可复用构建缓存。

历史来源记录保留在 [`docs/migration/20260809-001-gocell-web-source-baseline.md`](docs/migration/20260809-001-gocell-web-source-baseline.md)，不作为当前功能或操作入口。

## 固定 MDM HTTP 契约

`contracts/mdm/source.json` 固定后端 commit、生成入口和 SHA-256。从干净 checkout 开始，或切换到不同的 pin 后，在安装或构建镜像前运行 `make prepare-contract`。它用 Git 检出固定的后端 commit，运行后端现有的导出命令，校验 SHA-256 后将 JSON 写到忽略的 `contracts/mdm/http-v1.json`。已有匹配文件时直接复用。

首次准备在 macOS 或 Linux 上运行，需要 Node、Git、Python 3、后端固定的 Rust 工具链及私有 Git 依赖的读取权限。Linux 安装 `libxml2-dev clang pkg-config`，macOS 可用 `brew install libxml2 pkg-config llvm`。编译缓存默认在 `~/.cache/rss-web/mdm-http-contract`，也可通过 `CARGO_TARGET_DIR` 指定独立目标目录。

GitHub Actions 使用受保护的 `rss-mdm-contract` 环境。先为环境设置所需审核人并启用禁止自审，再在该环境添加 `RSS_AZURE_REPOS_READ_PAT`（Azure Repos Code Read）。凭据用于源码和锁定依赖的拉取，随后离线编译导出。外部 fork PR 跳过该 job。

`pnpm install --frozen-lockfile` 安装后自动生成静态端点、类型和 CSP 安全的校验器，供编辑器使用；根命令及依赖 API 的包级 `dev`、`demo`、`typecheck`、`test`、`test:coverage`、`build` 也会先确保生成完成。生成输入未变化时直接复用本地结果；删除生成目录后，下次命令会重建。安装时若使用 `--ignore-scripts`，可执行 `pnpm generate:contracts` 初始化编辑器类型。

`packages/api/src/generated/` 是忽略的本地产物，不提交 Git。`pnpm generate:contracts` 强制重新生成；`pnpm check:contracts` 确保生成目录存在后核对本地输入与生成结果，已进入 `make ci`。并发包命令共用生成锁，失败会阻止后续命令。

前端升级时自行选择后端 commit，例如当时的 `rss-mdm/develop` HEAD。在该 commit 的干净 checkout 中执行 `python3 hack/http_contract_artifact.py --output /absolute/path/to/rss-web/contracts/mdm/http-v1.json`，记录文件 SHA-256 并更新 `source.json`。随后运行 `make prepare-contract` 校验已有导出，再运行 `pnpm generate:contracts` 并按需迁移实际消费者。生产 HTTP 调用使用 `@rss/api/mdm-operations`；作者模型和 canonical 编码复用 `@rss/api/mdm-types`、`@rss/api/mdm-validators`；其它领域投影和未知编辑输入使用 `@rss/api/mdm-schemas` 自动导出的 scoped 类型与静态校验器，不维护第二套 wire 定义。整数按 JavaScript 精确范围校验，浮点字段保留 producer 的数值语义。Identity 与宿主静态配置继续使用原有边界。

新 React `/resources` 统一管理软件、脚本、配置、Native/Agent 采集和遥测方案的精确版本、变体、Blueprint 与完整定义。元数据保留未编辑键；声明版本、每份内容提交和激活分别确认。文件按块校验与传输；尚未发起上传的本地准备可以放弃。开始请求结果未知时保留原上传标识，显式恢复；冲突或提交未知后，显式读取原上传位置或内容回执，再继续同一操作。下载支持浏览器流式保存，以及最大 16 MiB 的小文件模式；隐藏、权限变化或离开会释放内容与临时下载。

新 React `/software` 复用软件 Resource 目录，详情按需读取。来源支持注册不可变版本、发现及精确导入；软件准入、WinGet/Brew 源发布与撤回各自保留版本与原操作。发布目标由宿主配置并只读展示；Direct 材料不要求先配置或发布原生源。目录名称、分类和激活状态在服务端筛选。打开精确版本后，可进入已有分配或携带版本与变体新建 Policy 草稿。JSON 来源快照单独导入和替换，记录可复制到软件 Resource 草稿，草稿保存独立于来源后续变化。

新软件真实 HTTPS Chromium 入口：`MDM_REACT_SOFTWARE_BACKEND=/absolute/rss-mdm pnpm test:mdm:react-software-browser`。复用独立 PG、存储、测试 PKI、受控 TLS WinGet 来源、构建租约与退出清理；旅程包含精确导入、丢失写响应、材料续传与回执、准入、私有下载和源发布撤回，并输出桌面、移动和暗色截图。受控来源与合成材料证明 HTTP/界面接缝，不证明设备安装效果；该 WinGet 夹具不证明真实 Brew 来源接入。

新 React `/operations` 提供包含 Script/Collection 的正式执行目录、统计、原生命令和 Policy Run/当前 Attempt 详情，并从设备与策略双向定位。周期资格、最近结果、当前触发记录与服务端可证明的允许开始时间分别显示；未知时间不推算。设备详情提供重启、适用平台的锁定和擦除；危险确认绑定已核对注册，PIN 提交即清除。取消与重授权保持原动作和请求坐标，不自动重放未知提交。持续配置的安装/移除意图仍在 Policy 的 Resource 与退出方式维护。 目录摘要与详细结果分别读取：打开原操作后，管理员点击“读取详细结果与证据”，沿原权限查看进程结果、报告和原生回执。详细读取被拒绝不清除已获准的目录摘要；设备和策略之间往返保留原查询上下文。

设备、执行、注册、DA 和恢复凭据的实时读取在首页、详情和统计遇到 `409/query_read_conflict` 时最多读取三次，共享 30 秒预算，间隔为 150/300 毫秒。离开页面、切换查询或会话会取消旧读取；401/403、503、网络失败及写请求不会自动重放。续页冲突显式重读当前页，分页上下文失效时保留筛选、排序、列和页大小重新开始。资产固定结果不会拼接不同版本；原结果不可用时，从原查询显式发起新任务。

`/device-access` 使用正式 DA 注册的设备标识，管理账户绑定、因子重置、解绑、原操作快照及用途绑定材料披露，并读取现有 Platform SSO 配置。DA 与 MDM/Agent 标识不自动互换。企业应用/账户映射保存后可显式刷新核对当前值；未知提交不会自动重放，当前值一致不证明原操作完成。新增 PSSO 注册/恢复状态与全局原操作排障分别留在 #3134/#3135，不展示为已交付。

执行与接入的真实 HTTPS Chromium 入口为 `MDM_REACT_EXECUTION_BACKEND=/absolute/rss-mdm pnpm test:mdm:react-execution-access-browser`，复用现有隔离 PG、Identity、HTTPS、构建租约与独立清理。既有合法 DA 注册/配置前态仅用于业务验证，不证明注册协议、账户/因子本地应用或 Windows/macOS 真机效果。固定后端候选 `f70d2fc7cf5c885504f10cdafa0c7d8ff7b1f1bb` 已通过嵌入 DA 用途绑定/因子重置、企业配置保存及当前值读取、PSSO 配置读取和跨标签会话结束成功路径。正式终端目录、续页以及 MDM/Agent 详情另由设备旅程与后端真实角色 T2 覆盖；业务入口成功不代表全产品 readiness 或真机效果。

Identity 的独立真实浏览器入口为 `IDENTITY_BACKEND_FIXTURE=/absolute/rss-identity pnpm test:identity:browser`，复用 joint 的隔离 HTTPS 宿主并消费当前 React 产物。独立 DA 为 `DEVICE_ACCESS_BACKEND=/absolute/rss-mdm pnpm test:device-access:browser`，复用现有设备 fixture、构建租约及独立清理。浏览器结果与已有 HTTP joint、显式 demo、Windows/macOS 真机效果分别记录；正式后端拒绝不会回退到 mock。
