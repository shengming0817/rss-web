export const groupMessages = {
  'zh-CN': {
    groupModule: {
      title: '组',
      boundary:
        '设备组用于设备策略与软件分配。用户组用于自助服务访问；设备范围需要明确的用户与设备关联规则。',
      'device-dynamic': '设备动态组',
      'device-static': '设备静态组',
      'user-dynamic': '用户动态组',
      'user-static': '用户静态组',
      userBoundary: '维护本租户的明确用户成员，用于自助服务策略和授权选择器。',
      dynamicUnavailable:
        '当前正式 API 仅支持静态用户组。动态用户条件与用户到设备组的生成契约尚未提供。',
      advanced: '高级资产查询',
      advancedHint: '使用正式资产字段目录构造 RSQL，异步查询已上报资产；查询结果保留原始终端身份。',
      rsql: '目录 RSQL 过滤条件',
      rsqlHint: '与基础过滤条件共同应用。支持目录正式字段和 RSQL 运算符。',
    },
  },
  en: {
    groupModule: {
      title: 'Groups',
      boundary:
        'Device groups target device policies and software. User groups control self service access; device targeting requires an explicit user-to-device association rule.',
      'device-dynamic': 'Dynamic device groups',
      'device-static': 'Static device groups',
      'user-dynamic': 'Dynamic user groups',
      'user-static': 'Static user groups',
      userBoundary:
        'Maintain explicit members in this tenant for self service policies and authorization selectors.',
      dynamicUnavailable:
        'The current production API supports static user groups. Dynamic user criteria and user-to-device group generation contracts are not available yet.',
      advanced: 'Advanced inventory query',
      advancedHint:
        'Build RSQL from the production asset field catalog and query reported inventory asynchronously. Results retain their original endpoint identity.',
      rsql: 'Directory RSQL filter',
      rsqlHint:
        'Combined with the basic filters. Uses the directory’s production fields and RSQL operators.',
    },
  },
}
