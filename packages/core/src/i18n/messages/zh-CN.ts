/**
 * zh-CN — 简体中文消息表（框架级 key）
 *
 * 命名空间规则：
 *   nav.*       导航项（group label + item label）
 *   shell.*     面包屑 / 搜索 / 主题 / 折叠 / 用户卡
 *   command.*   命令面板占位
 *   errors.*    错误码对照表（key = errors.<CODE>，对应后端 error.code）
 *
 * 业务页面文案逐 batch 补充，本文件只含框架层 key。
 */
const zhCN = {
  nav: {
    group: {
      access: 'Access',
      operate: 'Operate',
    },
    identities: '身份',
    policies: '策略',
    audit: '审计日志',
    config: '配置',
    pill: {
      live: '上线',
      preview: '预览',
      new: '新',
      reserved: '预留',
    },
  },
  shell: {
    brand: 'gocell',
    env: 'prod',
    search: {
      placeholder: '搜索…',
      shortcut: '⌘K',
      label: '打开搜索',
    },
    collapse: {
      collapse: '收起侧边栏',
      expand: '展开侧边栏',
    },
    theme: {
      toggle: '切换主题',
      light: '亮色',
      dark: '暗色',
    },
    locale: {
      toggle: '切换语言',
      zh: '中文',
      en: 'English',
    },
    breadcrumb: {
      root: 'gocell',
    },
    user: {
      guest: '未登录',
      role: '管理员',
    },
    commandPalette: {
      open: '打开命令面板',
      close: '关闭命令面板',
      title: '命令面板',
      escKey: 'Esc',
    },
    sidebar: {
      label: '侧边栏',
    },
    nav: {
      label: '主导航',
    },
    ai: {
      label: 'AI 助手',
      expand: '展开 AI 助手',
      collapse: '收起 AI 助手',
      name: 'AI',
      studioPlaceholder: 'AI Studio · 即将推出',
    },
    skipToContent: '跳到主内容',
  },
  command: {
    searchLabel: '搜索命令',
    placeholder: '输入命令或搜索…',
    empty: '无结果',
    hint: '输入以搜索',
    resultsLabel: '搜索结果',
  },
  access: {
    pdp: {
      // 路由 PDP 网关拒绝时的提示，key 后缀 = Decision.reasonCode
      deny: {
        'role-missing': '您没有访问该页面的权限',
        error: '权限校验失败，请稍后重试',
      },
    },
    login: {
      title: '登录',
      subtitle: '使用管理员账号登录控制台',
      brand: 'gocell',
      username: { label: '用户名', placeholder: 'admin' },
      password: { label: '密码', placeholder: '请输入密码' },
      passwordShow: '显示密码',
      passwordHide: '隐藏密码',
      submit: '登录',
      submitPending: '登录中…',
      usernameRequired: '请输入用户名',
      passwordRequired: '请输入密码',
      sessionExpired: '会话已过期，请重新登录',
    },
    identities: {
      title: '身份',
      subtitle: '管理用户主体 — 创建、编辑、锁定与改密',
      tabs: {
        label: '主体类型',
        users: '用户',
        serviceAccounts: '服务账号',
        serviceAccountsHint: '服务账号经 API 管理，暂未开放',
      },
      filter: {
        label: '筛选',
        placeholder: '按用户名或邮箱搜索…',
      },
      table: {
        label: '用户列表',
        username: '用户名',
        email: '邮箱',
        status: '状态',
        createdAt: '创建时间',
        actions: '操作',
      },
      status: {
        active: '正常',
        locked: '已锁定',
      },
      loading: '正在加载用户…',
      empty: '暂无用户',
      loadMore: '加载更多',
      resultCount: '{count} 个用户',
      actions: {
        create: '新建用户',
        edit: '编辑',
        changePassword: '改密',
        lock: '锁定',
        unlock: '解锁',
        delete: '删除',
        // 行操作按钮的读屏后缀：拼在动作名后给出用户名上下文（如「编辑 alice」）
        rowSuffix: ' {username}',
      },
      form: {
        createTitle: '新建用户',
        editTitle: '编辑用户',
        username: {
          label: '用户名',
          placeholder: 'alice',
          required: '请输入用户名',
          format: '3–32 字符，字母 / 数字 / . _ -',
        },
        email: {
          label: '邮箱',
          // vue-i18n 把 `@` 当作 linked-message 前缀，邮箱示例须用字面插值转义
          placeholder: "alice{'@'}corp.example",
          required: '请输入邮箱',
          format: '请输入有效的邮箱地址',
        },
        password: {
          label: '初始密码',
          placeholder: '长口令，大小写 + 数字 + 符号',
          required: '请输入密码',
          tooShort: '需 8–72 字节（bcrypt 上限）',
          controlChar: '不能包含控制字符',
        },
        requirePasswordReset: '要求首次登录后修改密码',
        cancel: '取消',
        submit: '保存',
        submitting: '保存中…',
      },
      password: {
        title: '修改密码',
        old: { label: '当前密码' },
        new: { label: '新密码' },
        confirm: { label: '确认新密码' },
        oldRequired: '请输入当前密码',
        newRequired: '请输入新密码',
        newTooShort: '需 8–72 字节（bcrypt 上限）',
        newControlChar: '不能包含控制字符',
        confirmRequired: '请再次输入新密码',
        confirmMismatch: '两次密码不一致',
        cancel: '取消',
        submit: '修改密码',
        submitting: '提交中…',
      },
      confirm: {
        cancel: '取消',
        lock: {
          title: '锁定用户',
          message: '锁定后该用户将无法登录，可随时解锁。确认锁定？',
          confirm: '锁定',
        },
        unlock: {
          title: '解锁用户',
          message: '解锁后该用户可恢复登录。确认解锁？',
          confirm: '解锁',
        },
        delete: {
          title: '删除用户',
          message: '删除后该用户及其会话将被移除，且不可恢复。确认删除？',
          confirm: '删除',
        },
      },
    },
    policies: {
      title: '策略',
      subtitle: '角色与权限矩阵 · 为用户分配 / 撤销角色',
      tabs: {
        label: '策略视图',
        roles: '角色',
        rules: '规则',
        templates: '模板',
        rulesHint: '规则引擎将在后续版本提供',
        templatesHint: '策略模板将在后续版本提供',
      },
      user: {
        label: '用户 ID',
        placeholder: '输入用户 ID 查看其角色',
        load: '查询',
        required: '请输入用户 ID',
      },
      loading: '正在加载角色…',
      empty: '该用户暂无角色',
      prompt: '输入用户 ID 以查看其角色与权限',
      matrix: {
        label: '角色 — 权限矩阵',
        roleHeader: '角色',
        granted: '已授予',
        denied: '未授予',
        empty: '无可显示的角色',
      },
      assign: {
        label: '角色 ID',
        placeholder: '输入要分配的角色 ID',
        button: '分配角色',
        required: '请输入角色 ID',
        title: '分配角色',
      },
      revoke: {
        label: '当前角色',
        button: '撤销角色',
        empty: '该用户暂无可撤销的角色',
        selectPlaceholder: '选择要撤销的角色',
        title: '撤销角色',
      },
      roleCount: '共 {count} 个角色',
      errors: {
        assignFailed: '分配角色失败',
        revokeFailed: '撤销角色失败',
        tenantUnavailable: '当前会话缺少租户上下文，暂无法变更角色',
      },
    },
  },
  audit: {
    log: {
      title: '审计日志',
      subtitle:
        '防篡改的特权操作记录 —— 人工、服务账号、Cell 及 AI 沙箱均纳入；按租户哈希链持续校验。',
      loading: '正在加载审计条目…',
      empty: '暂无匹配的审计条目',
      loadMore: '加载更多',
      list: { label: '审计日志列表' },
      day: { today: '今天', yesterday: '昨天' },
      range: { label: '时间范围' },
      actions: {
        export: '导出 CSV',
        verify: '验证链',
      },
      chain: {
        label: '哈希链完整性',
        ok: '哈希链完整',
        broken: '哈希链已断裂',
        unavailable: '链校验不可用',
        // BR-006 仅保留在代码注释中，不向用户暴露内部编号
        unavailableNote: '此版本暂不支持哈希链校验',
      },
      filter: {
        label: '搜索',
        placeholder: '过滤 eventType、actorId、subjectId…',
        count: '显示 {shown} 条',
        actorKind: {
          label: '操作者类型',
          all: '全部类型',
          human: '人工',
          service: '服务账号',
          cell: 'Cell（自动）',
          sandbox: 'AI 沙箱',
          unknown: '未知',
        },
        actionNs: {
          label: '操作命名空间',
          all: '全部操作',
          slice: 'slice.*',
          flag: 'flag.*',
          config: 'config.*',
          sandbox: 'sandbox.*',
          role: 'role.*',
          secret: 'secret.*',
          cell: 'cell.*',
          tenant: 'tenant.*',
          user: 'user.*',
          anomaly: 'anomaly.*',
        },
      },
      quickFilter: {
        label: '快捷过滤',
        prefix: '快捷过滤：',
        sandboxActions: '沙箱操作',
        secretReads: '密钥读取',
        flagFlips: '开关变更',
        roleChangesByHumans: '人工角色变更',
      },
      detail: {
        label: '条目详情',
        entryId: '条目 ID',
        eventType: '事件类型',
        actor: '操作者',
        target: '目标',
        tenantId: '租户',
        scope: '范围',
        correlationId: '关联 ID',
        timestamp: '时间',
        payload: 'Payload（已签名）',
        noPayload: '暂无 payload',
        chainContext: '哈希链上下文',
        noTarget: '—',
      },
    },
  },
  config: {
    entries: {
      title: '配置管理',
      subtitle: '版本化配置项 —— 编辑先暂存，发布后生效。',
      loading: '正在加载…',
      empty: '暂无配置项',
      loadMore: '加载更多',
      resultCount: '共 {count} 条',
      filter: {
        label: '按键名筛选',
        placeholder: '输入键名…',
      },
      table: {
        label: '配置项列表',
        key: '键名',
        value: '值',
        version: '版本',
        updatedAt: '更新时间',
        actions: '操作',
        sensitiveTag: '敏感',
        sensitiveAriaLabel: '敏感值已脱敏',
      },
      actions: {
        create: '+ 新建键',
        edit: '编辑',
        editAriaLabel: '编辑 {key}',
        publish: '发布',
        publishAriaLabel: '发布 {key}',
        rollback: '回滚',
        rollbackAriaLabel: '回滚 {key}',
        delete: '删除',
        deleteAriaLabel: '删除 {key}',
      },
      drawer: {
        createTitle: '新建配置项',
        editTitle: '编辑配置项',
        stageHint: '保存后为暂存状态，点击"发布"后正式生效。',
        cancel: '取消',
        submit: '暂存修改',
        submitting: '提交中…',
        sensitive: {
          label: '标记为敏感（值在响应中脱敏显示）',
        },
        key: {
          label: '键名',
          placeholder: '例如 app.debug',
        },
        value: {
          label: '值',
          placeholder: '输入配置值',
          sensitiveLabel: '敏感',
          sensitivePlaceholder: '输入新值（原值已脱敏，请重新输入）',
          sensitiveHint: '敏感配置原值不可读取，请输入新值后提交。',
        },
      },
      confirm: {
        cancel: '取消',
        publish: {
          title: '发布配置',
          message: '确认将当前配置项发布为正式版本？',
          confirm: '确认发布',
        },
        rollback: {
          title: '回滚配置',
          message: '确认将配置回滚到指定版本？',
          confirm: '确认回滚',
          versionLabel: '目标版本号',
          versionHint: '输入 1 到 {max} 之间的版本号',
        },
        delete: {
          title: '删除配置项',
          message: '此操作不可恢复，确认删除该配置项？',
          confirm: '确认删除',
        },
      },
      validation: {
        key: {
          required: '键名不能为空',
          tooLong: '键名不能超过 255 个字符',
          invalidChars: '键名包含非法控制字符',
        },
        value: {
          required: '值不能为空',
          sensitiveRedacted: '敏感值已脱敏，请重新输入实际值',
        },
      },
    },
  },
  landing: {
    title: '系统概览',
    subtitle: '所有 cell 的健康状态与系统元信息。',
    refresh: '刷新',
    lastCheck: '最近检查 {time}',
    loading: '正在加载健康状态…',
    liveRegion: '健康状态已于 {time} 刷新',
    unavailable: {
      title: '健康端点暂不可用',
      message: '后端健康聚合端点（/admin/health/cells）尚未实现，暂无法获取 cell 健康数据。',
      retry: '重试',
    },
    summary: {
      label: '健康汇总',
      total: '共 {n}',
      healthy: '{n} 健康',
      degraded: '{n} 降级',
      down: '{n} 下线',
    },
    status: {
      healthy: '健康',
      degraded: '降级',
      down: '下线',
      starting: '启动中',
      stopping: '停止中',
      unknown: '未知',
    },
    cell: {
      version: '版本',
      commit: '提交',
      uptime: '运行时长',
      durability: '持久性',
      slices: '{n} 个 slice',
      sliceSummary: '{healthy}/{total} slice 健康',
      lastError: '最近错误',
    },
    system: {
      title: '系统信息',
      unavailable: '系统元信息暂不可用',
      build: '构建',
      version: '版本',
      commit: '提交',
      goVersion: 'Go 版本',
      dirty: '工作区',
      dirtyYes: '有未提交改动',
      dirtyClean: '干净',
      runtime: '运行时',
      uptime: '运行时长',
      goroutines: 'Goroutines',
      memory: '内存',
      pid: 'PID',
      assembly: '装配',
      cells: 'Cells',
      primaryAddr: '主监听',
      internalAddr: '内部监听',
      environment: '环境',
      hostname: '主机名',
    },
    deploys: {
      title: '最近部署',
      unavailable: '部署历史数据源待接入。',
    },
    kpi: {
      title: '关键指标',
      unavailable: '当前健康视图不提供关键指标。',
    },
  },
  errors: {
    unknown: '发生未知错误，请稍后重试',
    network: '网络连接失败，请检查网络后重试',
    ERR_AUTH_LOGIN_FAILED: '用户名或密码错误',
    ERR_AUTH_REFRESH_FAILED: '会话已失效，请重新登录',
    ERR_AUTH_TOKEN_EXPIRED: '登录已过期，请重新登录',
    ERR_AUTH_UNAUTHORIZED: '无权访问，请检查账号权限',
    ERR_AUTH_FORBIDDEN: '权限不足',
    ERR_VERSION_CONFLICT: '数据版本冲突，请刷新后重试',
    ERR_VALIDATION: '请求参数不合法',
    ERR_NOT_FOUND: '资源不存在',
    ERR_CONFLICT: '资源冲突',
    ERR_INTERNAL: '服务器内部错误，请联系管理员',
    ERR_RATE_LIMIT: '请求过于频繁，请稍后重试',
    ERR_TIMEOUT: '请求超时，请稍后重试',
    ERR_REQUEST_TOO_LARGE: '请求体过大，请减小后重试',
  },
} as const

export default zhCN

/**
 * Recursively map all leaf string-literal types to `string`.
 * This gives en-US a structural schema to `satisfies` against — enforcing
 * that all keys exist without requiring identical string values.
 */
type Widen<T> = T extends string
  ? string
  : T extends Record<string, unknown>
    ? { [K in keyof T]: Widen<T[K]> }
    : T

export type MessageSchema = Widen<typeof zhCN>
