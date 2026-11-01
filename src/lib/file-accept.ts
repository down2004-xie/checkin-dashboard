/* 文件类型过滤 —— 纯函数，可单测。FilePicker 的拖放 / 粘贴走这里。
 *
 * 为什么要自己过滤：<input accept> 只约束「点击选择」的文件框，
 * 拖放和粘贴进来的文件浏览器不管，什么都能扔进来。所以三条入口要用同一把尺子。
 * 规则照 HTML accept 属性：逗号分隔，每项是扩展名（.pdf）、type/*（image/*）或完整 MIME。
 */

export interface FileLike {
  name: string
  type: string
}

/** 文件是否符合 accept 规则。accept 为空表示不限 */
export function matchesAccept(file: FileLike, accept: string): boolean {
  const rules = accept.split(',').map((rule) => rule.trim().toLowerCase()).filter(Boolean)
  if (rules.length === 0) return true
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return rules.some((rule) => {
    if (rule.startsWith('.')) return name.endsWith(rule)
    if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1))
    return type === rule
  })
}

/** 按 accept 把文件分成「收下」和「拒收」两组；multiple 为 false 时只收第一个合格的 */
export function partitionFiles<T extends FileLike>(files: T[], accept: string, multiple: boolean): { accepted: T[]; rejected: T[] } {
  const accepted: T[] = []
  const rejected: T[] = []
  for (const file of files) {
    if (!matchesAccept(file, accept)) rejected.push(file)
    else if (multiple || accepted.length === 0) accepted.push(file)
  }
  return { accepted, rejected }
}

/**
 * 给拒收或解码失败的文件一句「说得出原因」的提示。
 * HEIC 单独点名：iPhone 默认拍 HEIC，Chrome / Firefox 解不开，
 * 笼统一句「加载失败」用户不知道该怎么办。
 */
export function unsupportedHint(file: FileLike): string {
  const name = file.name.toLowerCase()
  if (/\.(heic|heif)$/.test(name) || /image\/hei[cf]/.test(file.type.toLowerCase())) {
    return `「${file.name}」是 HEIC 格式，大多数浏览器解不开。请先在手机相册里导出为 JPEG，或在 iPhone 设置 → 相机 → 格式里选「兼容性最佳」`
  }
  return `「${file.name}」的格式不受这个工具支持`
}
