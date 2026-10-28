# @rss/core

共享展示基础：主题偏好、语言选择和设计 token。产品持有消息、HTTP、权限、业务状态及副作用；标准交互组件直接使用 Vuetify。

- `@rss/core` 导出 `createRssI18n`；`@rss/core/composables` 导出 `useTheme`。
- 每个需要共享主题偏好的应用安装自己的 Pinia；`useTheme` 与 `data-theme` 是该应用主题偏好的唯一来源。
- 应用通过 `@rss/core/styles/tokens.css` 引入基础 token；产品布局和业务语义样式归对应应用。
- Vuetify 实例由消费应用创建。主题 CSS 通过仓内 `build/vuetify-styles.mjs` 在构建期生成，运行时设置 `theme: false`；应用负责主题容器、locale 和弹层挂载位置。
- `pnpm dev:ui` 启动独立 Vuetify 展示页，可检查浅深主题、中英文、表单状态和嵌套弹层；`pnpm build:ui-preview` 单独构建。展示页不加载产品 API，也不进入产品镜像。
