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
  paused?: boolean
  pinned?: boolean
}

/**
 * 一条待办事项。和 Site 一样是「用户数据」，按天归属。
 *
 * 为什么单独一个类型而不是直接塞字符串数组：
 * 待办需要「勾选状态」——字符串本身表达不了。而且以后想加备注、
 * 优先级、提醒时间，都是在对象上加字段，不用改数组的形状。
 */
export interface Todo {
  /**
   * 唯一标识，添加时由 `createTodo` 生成（随机 UUID）。
   *
   * 和 Site.id「由域名派生」是**相反**的取舍：
   * 站点 id 必须稳定，因为它是历史记录的锚（删了再加要能接回历史）；
   * 待办没有这个需求 —— 它只需要在**当天**唯一定位得了一条。
   * 用随机 id 反而更简单，也顺带避开「同一天写两条一模一样的待办
   * （比如两次「买牛奶」）互相顶掉」这个坑。
   */
  id: string

  /** 待办内容 */
  text: string

  /** 是否已完成 */
  done: boolean
  carriedFrom?: DateKey
}

/**
 * 一条日记。和 Todo 一样是「用户数据」，按天归属，一天可以有多条。
 *
 * 为什么按天归属而不是一份扁平的全局列表：这个项目的核心维度就是「一天」，
 * 签到、待办、目标快照全挂在日期 key 上，日记跟着日期走才同源，
 * 也才能和它们共用同一套「按天分组」的迁移/备份/清洗代码。
 *
 * 为什么一天要支持多条（而不是一天一整篇）：
 * 用户可能上午开一个会、下午写一段实习日志、晚上再随手记两句。
 * 合成一整篇会互相干扰；拆成多条可以各自带标题、各自删除。
 */
export interface DiaryEntry {
  /**
   * 唯一标识，由 `createDiaryEntry` 生成（随机 UUID）。
   *
   * 和 Todo.id 完全同一条理由：它不是历史锚点（不像 Site.id 由域名派生），
   * 只需要在**当天**唯一定位得了一条。随机 id 顺带允许「同一天写两条
   * 一模一样的日记」共存，不会互相顶掉。
   */
  id: string

  /**
   * 标题，可选。会议/实习日志可以起个名，纯日记可以留空。
   *
   * 空标题统一存成 `undefined`（不存空串），这样「有没有标题」判断简单，
   * 清洗时也不会出现 `title: ''` 这种半成品。
   */
  title?: string

  /**
   * 正文，纯文本。**必填且非空**（只有标题没有正文的条目没有意义）。
   *
   * 刻意不支持图片：localStorage 每源约 5 MB，图片转 base64 几张就爆配额，
   * 而纯文本 5 MB 够写几百万字。见 CLAUDE.md 的技术红线。
   */
  text: string

  /**
   * 创建时间，ISO 字符串。只用于**同一天内多条日记的排序**，不是身份。
   *
   * 刻意设成可选：老数据/手改数据可能没有它，此时按空串排、稳定靠 id，
   * **不因为缺元数据就丢正文**（和 sanitizeTodos 对 done 的宽容同一条思路）。
   * 迁移刻意不伪造时间戳 —— 那是编数据。
   */
  createdAt?: string
}

export interface Preferences {
  theme: 'auto' | 'dawn' | 'day' | 'dusk' | 'night'
  effects: 'full' | 'light' | 'static'
  compact: boolean
  /** 明暗外观（v6）。与 theme 正交：theme 决定色相，appearance 决定明暗 */
  appearance: 'dark' | 'light'
}

export const DEFAULT_PREFERENCES: Preferences = { theme: 'auto', effects: 'full', compact: false, appearance: 'dark' }

/** localStorage 里存储的完整结构 */
export interface CheckInData {
  /**
   * 数据格式版本号。
   *
   * v1：只有 records。
   * v2：加了 sites —— 站点定义入库，用户可增删改站点。
   * v3：站点 id 从「名字派生的 slug」改成「域名派生」，历史记录随之重写。
   * v4：加了 todos —— 按天归属的每日待办。纯新增字段，不重写既有数据。
   * v5：加了 targets（每日目标快照）和 preferences（主题/特效/紧凑）。
   * v6：preferences 加了 appearance（明暗外观）。纯新增枚举字段。
   * v7：加了 diary —— 按天归属的电子日记，一天可多条。纯新增字段。
   * 以后加字段（备注、标签）时必须再 +1，并在 lib/migrate.ts 里写迁移分支。
   * 没有版本号就只能让用户清库重来。
   */
  version: number

  /** 站点定义，顺序即页面展示顺序 */
  sites: Site[]

  /** 日期 -> 当天已签到的站点 id 列表 */
  records: Record<DateKey, string[]>

  /**
   * 日期 -> 当天的待办清单。
   *
   * 刻意和 records 用同一套「按日期 key 分组」的形状（都是 Record<DateKey, _[]>），
   * 而不是一份不带日期的扁平列表。原因是这个项目的核心维度就是「一天」：
   * 签到记录、连续天数、热力图都挂在日期上，待办跟着日期走才和它们同源。
   *
   * 注意：**待办不参与签到进度环，也不触发樱花满开**。两者虽然同构，
   * 语义却不同 —— 签到是「每天固定要签的站」，待办是「今天顺手记的一件事」。
   * 混进进度环会让「100%」的含义变模糊（没写完待办算不算没完成今天？）。
   */
  todos: Record<DateKey, Todo[]>
  targets: Record<DateKey, Site[]>

  /**
   * 日期 -> 当天的日记条目（v7 新增）。
   *
   * 和 todos 同构（`Record<DateKey, _[]>`），刻意复用同一套「按天分组」的形状，
   * 于是迁移、备份合并、清洗都能照抄待办那一套，少写一份逻辑。
   *
   * 注意：**日记不参与签到进度环，也不触发樱花满开** —— 和待办同一个定位，
   * 它是「今天记下的东西」，不是「今天要完成的任务」。
   */
  diary: Record<DateKey, DiaryEntry[]>
  preferences: Preferences
}

/** 当前的数据格式版本，与 CheckInData.version 对应 */
export const DATA_VERSION = 7
