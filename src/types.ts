/* 全局类型定义
 *
 * 这里是「数据契约」：数据结构一旦定下，storage / streak / 组件全都依赖它。
 * 改这里的字段名会牵连一大片，所以每个字段都写清用途和约束。
 */

/**
 * 一天的唯一标识，格式固定为 'YYYY-MM-DD'。
 *
 * 为什么不用时间戳或 Date 对象：
 * - 时间戳精确到毫秒，每次调用都不同，无法当「一天」的 key
 * - Date 对象作 key 会被隐式转成字符串，格式带时区、不可控
 * - 字符串人眼可读、能直接当 JSON key、调试时一眼看出是哪天
 *
 * 代价：不含时区信息。跨时区使用时同一天可能算成两天。
 * 本项目是单人本机使用，可忽略。
 */
export type DateKey = string

/** 一个需要签到的站点 */
export interface Site {
  /**
   * 站点身份，**由 url 的域名派生**（`siteIdFromUrl`），如 'jd-com'。
   *
   * 为什么不是「名字派生的 slug」（v2 的做法）：
   * 名字是标签，用户随时能改；url 才是「这个站是谁」。
   * 用名字派生时，纯中文名转不出 slug，只能退回 site-1、site-2…
   * 而那些号取决于「删除那一刻哪些号没人占」——
   * 同一个站删掉再加，会拿到不同 id，历史记录直接断掉。
   *
   * 用域名派生后：同一个域名必然算出同一个 id，
   * 于是「删了再加」能自动接回历史，也能顺带挡住重复添加。
   *
   * 由此得到一条**不变量**：id 一旦确定就不再改（它是历史记录的锚）。
   */
  id: string

  /** 显示名称，可以随时改，不影响历史记录 */
  name: string

  /** 点卡片时打开的地址 */
  url: string

  /** 分类。由书签导入的文件夹名或用户手填 */
  category?: string
}

/** localStorage 里存储的完整结构 */
export interface CheckInData {
  /**
   * 数据格式版本号。
   *
   * v1：只有 records。
   * v2：加了 sites —— 站点定义入库，用户可增删改站点。
   * v3：站点 id 从「名字派生的 slug」改成「域名派生」，历史记录随之重写。
   * 以后加字段（备注、标签）时必须再 +1，并在 lib/migrate.ts 里写迁移分支。
   * 没有版本号就只能让用户清库重来。
   */
  version: number

  /** 站点定义，顺序即页面展示顺序 */
  sites: Site[]

  /** 日期 -> 当天已签到的站点 id 列表 */
  records: Record<DateKey, string[]>
}

/** 当前的数据格式版本，与 CheckInData.version 对应 */
export const DATA_VERSION = 3
