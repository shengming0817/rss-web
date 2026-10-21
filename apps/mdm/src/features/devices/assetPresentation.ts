/** Presentation categories do not grant field access or change source precedence. */
export const assetCategories = [
  'overview',
  'hardware',
  'os',
  'storage',
  'network',
  'security',
  'extensions',
] as const
export function assetCategory(key: string): (typeof assetCategories)[number] {
  if (key.startsWith('custom.')) return 'extensions'
  if (key.startsWith('device.os.') || key === 'device.architecture') return 'os'
  if (key.startsWith('device.storage.')) return 'storage'
  if (key.startsWith('device.network.')) return 'network'
  if (key.includes('security') || key.includes('encryption') || key.includes('firewall'))
    return 'security'
  if (
    key.includes('cpu') ||
    key.includes('memory') ||
    key.includes('model') ||
    key.includes('manufacturer')
  )
    return 'hardware'
  return 'overview'
}
export const assetLabels: Record<string, { zh: string; en: string }> = {
  'device.model': { zh: '设备型号', en: 'Model' },
  'device.serial_number': { zh: '序列号', en: 'Serial number' },
  'device.hardware_uuid': { zh: '硬件标识', en: 'Hardware identity' },
  'device.manufacturer': { zh: '制造商', en: 'Manufacturer' },
  'device.cpu.model': { zh: '处理器', en: 'Processor' },
  'device.cpu.logical_cores': { zh: '逻辑核心', en: 'Logical cores' },
  'device.memory.bytes': { zh: '内存（字节）', en: 'Memory (bytes)' },
  'device.os.name': { zh: '操作系统', en: 'Operating system' },
  'device.os.version': { zh: '系统版本', en: 'OS version' },
  'device.os.build': { zh: '系统构建', en: 'OS build' },
  'device.architecture': { zh: '架构', en: 'Architecture' },
  'custom.asset_tag': { zh: '资产编号', en: 'Asset tag' },
  'custom.office_floor': { zh: '办公楼层', en: 'Office floor' },
  'custom.is_loaner': { zh: '借用设备', en: 'Loaner' },
  'custom.purchase_date': { zh: '采购日期', en: 'Purchase date' },
}
export function assetLabel(key: string, locale: string) {
  return assetLabels[key]?.[locale === 'zh-CN' ? 'zh' : 'en'] ?? key
}
