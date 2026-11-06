# @rss/core

共享展示基础：主题偏好、语言选择、设计 token 和无业务语义的查询展示。产品持有消息、HTTP、权限和业务状态，标准交互直接使用 Ant Design。

- 应用使用 `Presentation`，通过 `usePresentation` 读取或设置浅深主题与中英文。主题、语言偏好可以保存在 localStorage；不存储身份、会话或凭据。
- `QueryControls` 与 `QueryRows` 只展示输入和结果；消费方持有已接受查询、分页、请求和详情身份。
- 引入 `@rss/core/styles/tokens.css` 与构建生成的 `virtual:rss-theme.css`。应用使用 `build/antd-styles.ts` 提取两套外部 CSS，运行时沿用严格 CSP，不注入可执行代码或文档内样式。
- `pnpm dev:ui` 启动独立 React + Ant Design 预览；`pnpm build:ui-preview` 单独构建。预览不加载产品 API，也不进入产品镜像。
