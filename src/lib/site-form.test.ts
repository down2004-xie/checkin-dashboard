import { describe, expect, it } from 'vitest'

import { normalizeUrl, siteHost, siteIdFromUrl, slugify } from './site-form'
import { SITES } from '../data/sites'

describe('slugify', () => {
  it('英文名转小写', () => {
    expect(slugify('GitHub')).toBe('github')
  })

  it('空格和符号折叠成连字符', () => {
    expect(slugify('JD Daily!')).toBe('jd-daily')
  })

  it('纯中文名得到空串', () => {
    expect(slugify('京东')).toBe('')
  })

  it('首尾连字符被去掉', () => {
    expect(slugify('--hello--')).toBe('hello')
  })
})

describe('siteHost', () => {
  it('取域名并小写', () => {
    expect(siteHost('https://www.JD.com/a/b?c=1')).toBe('jd.com')
  })

  it('去掉开头的 www.', () => {
    expect(siteHost('https://www.bilibili.com')).toBe('bilibili.com')
  })

  it('只去一个 www.，不会把域名吃掉', () => {
    expect(siteHost('https://www.www.com')).toBe('www.com')
  })

  it('子域名保留', () => {
    expect(siteHost('https://music.163.com')).toBe('music.163.com')
  })

  it('缺协议时自动补 https —— 和 normalizeUrl 用同一套判断', () => {
    expect(siteHost('bilibili.com')).toBe('bilibili.com')
    expect(siteHost('哔哩哔哩.com')).not.toBeNull()
  })

  it('语法上不成 URL → null', () => {
    expect(siteHost('')).toBeNull()
    expect(siteHost('   ')).toBeNull()
    expect(siteHost('https://')).toBeNull() // 有协议没主机名
  })
})

describe('siteIdFromUrl', () => {
  it('域名转 slug：点变成连字符', () => {
    expect(siteIdFromUrl('https://www.jd.com')).toBe('jd-com')
  })

  it('www. 不影响 id', () => {
    expect(siteIdFromUrl('https://jd.com')).toBe('jd-com')
    expect(siteIdFromUrl('https://www.jd.com')).toBe('jd-com')
  })

  it('路径 / query 不影响 id —— 是按站点签到，不是按页面', () => {
    expect(siteIdFromUrl('https://www.jd.com/index.html?x=1#top')).toBe('jd-com')
  })

  it('子域名是不同的站，id 也不同', () => {
    expect(siteIdFromUrl('https://music.163.com')).toBe('music-163-com')
    expect(siteIdFromUrl('https://www.163.com')).toBe('163-com')
  })

  it('中文域名先被转成 punycode，也能算出非空 id', () => {
    const id = siteIdFromUrl('哔哩哔哩.com')
    expect(id).not.toBeNull()
    expect(id).not.toBe('')
  })

  it('语法上不成 URL → null（调用方用它区分「网址不合法」）', () => {
    expect(siteIdFromUrl('')).toBeNull()
    expect(siteIdFromUrl('https://')).toBeNull()
  })

  it('和 normalizeUrl 判断一致：它接受的输入，这里必须算得出身份', () => {
    // 否则会出现「网址能存进去、但算不出 id」的自相矛盾状态
    for (const input of ['bilibili.com', 'https://www.jd.com/a?b=1', '哔哩哔哩.com']) {
      if (normalizeUrl(input) !== null) {
        expect(siteIdFromUrl(input)).not.toBeNull()
      }
    }
  })
})

describe('siteIdFromUrl — 身份必须确定，才谈得上「删了再加能接回历史」', () => {
  it('同一个域名永远是同一个 id，跟名字无关', () => {
    // 这是 v3 改造的核心：v2 用「名字派生的 slug」，
    // 纯中文名转不出 slug 就退回 site-N，而 N 取决于当下哪些号没人占，
    // 于是同一个站删掉再加会拿到不同 id，历史断掉。
    // 改成域名派生后，同一个域名必然同一个 id。
    const a = siteIdFromUrl('https://www.taobao.com')
    const b = siteIdFromUrl('https://taobao.com/')
    expect(a).toBe('taobao-com')
    expect(b).toBe(a)
  })
})

describe('种子站点的 id 必须符合身份规则', () => {
  it('每个种子站点的 id 都等于 siteIdFromUrl(url)', () => {
    // 种子站点也会被 v1 迁移读到。id 形态和用户自己加的站必须一致，
    // 否则「删掉再加」接不回历史。往 data/sites.ts 加站忘了改 id 会当场失败。
    for (const site of SITES) {
      expect(site.id).toBe(siteIdFromUrl(site.url))
    }
  })

  it('种子站点之间没有重复域名', () => {
    const hosts = SITES.map((s) => siteHost(s.url))
    expect(new Set(hosts).size).toBe(hosts.length)
  })
})

describe('normalizeUrl', () => {
  it('空串 → null', () => {
    expect(normalizeUrl('')).toBeNull()
    expect(normalizeUrl('   ')).toBeNull()
  })

  it('缺协议自动补 https', () => {
    expect(normalizeUrl('bilibili.com')).toBe('https://bilibili.com/')
  })

  it('已有协议原样保留', () => {
    expect(normalizeUrl('https://www.bilibili.com/video')).toBe(
      'https://www.bilibili.com/video',
    )
  })

  it('非 http(s) 协议被拒', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull()
  })

  it('语法非法（缺 host）→ null', () => {
    expect(normalizeUrl('https://')).toBeNull()
  })

  it('中文域名被当作合法 IDN（转 punycode）', () => {
    // new URL 会把中文域名编码成 punycode，这是标准行为，不应拒绝
    expect(normalizeUrl('哔哩哔哩.com')).not.toBeNull()
  })
})

describe('身份稳定性 —— 「删掉再加能接回历史」是真的了', () => {
  it('纯中文名的站删掉再加，拿到的是同一个 id', () => {
    // 这条测试在 v2 时期是**断言缺陷**的（当时同一个名字会算出 site-1 / site-2
    // 两个不同 id，历史会断）。v3 改成域名身份后，它变成了断言修复后的行为。
    const before = siteIdFromUrl('https://www.taobao.com')

    // 用户删掉京东又删掉淘宝，站点所剩无几，再重新添加淘宝
    const after = siteIdFromUrl('https://www.taobao.com')

    expect(after).toBe(before)
    expect(after).toBe('taobao-com')
  })

  it('id 与「当下已有哪些站点」无关 —— 不再依赖外部状态', () => {
    // v2 的 makeSiteId 要传 existingIds，id 会随现有站点变化；
    // 现在签名里根本没有这个参数，从类型上就不可能再依赖它
    expect(siteIdFromUrl('https://www.jd.com')).toBe('jd-com')
    expect(siteIdFromUrl('https://www.jd.com')).toBe('jd-com')
  })
})
