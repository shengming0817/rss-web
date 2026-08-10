const zhCN = {
  navigation: { home: '首页' },
  home: { subtitle: '已验证身份，并独立加载 Runtime 与 Audit 的服务端事实。' },
  runtimeSummary: {
    title: '运行时摘要',
    loading: '正在读取运行时事实…',
    schemaVersion: '模式版本',
    assembly: 'Assembly 指纹',
    plan: 'Runtime plan 指纹',
    domains: '领域',
  },
  auditEntries: {
    title: '首批审计条目',
    firstPageNotice: '按服务端顺序显示首批条目；这不是“最新”视图。',
    loading: '正在读取审计条目…',
    hasMore: '服务端还有后续条目。',
    outcome: '结果',
    recordedAt: '记录时间',
    fingerprint: '不透明指纹',
    notVerified: '浏览器未验证',
  },
  identity: {
    login: {
      title: '登录',
      subtitle: '使用 RSS Identity 凭据继续。租户由可信部署配置确定。',
      username: '用户名',
      password: '密码',
      submit: '登录',
      authenticating: '正在验证登录…',
      verifyingProfile: '正在验证身份…',
      signingOut: '正在安全退出…',
    },
    errors: {
      required: '请填写用户名和密码。',
      invalidCredentials: '凭据无效，请重试。',
      forbidden: '当前账户不能进入此应用。',
      conflict: '登录状态已变更，请重试。',
      rateLimited: '尝试过于频繁，请稍后重试。',
      serviceUnavailable: '身份服务暂时不可用。',
      connection: '无法连接身份服务。',
      timeout: '身份请求超时。',
      invalidResponse: '身份服务返回了无效响应。',
      profileVerificationFailed: '无法验证完整身份，未建立会话。',
      alreadySubmitting: '登录正在进行。',
      unknown: '登录失败，请重试。',
    },
    notice: {
      signedOut: '已安全退出。',
      logoutUnconfirmed: '本地会话已清除，但服务端退出确认不可用。',
      sessionExpired: '会话已失效，请重新登录。',
    },
    profile: { title: '已验证身份', subject: '主体', tenant: '租户', kind: '类型' },
    actions: { logout: '退出', logoutAll: '退出所有会话' },
    logoutAll: {
      title: '退出所有会话？',
      description: '这将撤销当前账户的所有会话，包括其他设备。',
      cancel: '取消',
      confirm: '退出全部',
    },
  },
} as const

export default zhCN
export type WebMessageSchema = typeof zhCN
