// 文本字数统计的单工具验收。运行：node scripts/checks/text-stats.mjs
import { runToolCheck } from '../lib/tool-harness.mjs'

const TILES = "Object.fromEntries([...document.querySelectorAll('.stat-tile')].map(t => [t.querySelector('.stat-tile__label').textContent.trim(), Number(t.querySelector('.stat-tile__value').textContent)]))"
const READING = '分钟（预计阅读时长）'

await runToolCheck('文本字数统计', async (t) => {
  const { assert } = t
  const field = 'textarea[aria-label="待统计文本"]'

  await t.input(field, '你好world 2026')
  let tiles = await t.eval(TILES)
  assert.deepEqual([tiles['汉字'], tiles['英文单词'], tiles['数字串'], tiles['字符数'], tiles['字数']], [2, 1, 1, 11, 4])
  t.pass('你好world 2026 → 汉字 2、单词 1、数字串 1、字符 11、字数 4（与 toolbox-check 一致）')

  // 旧 bug：只按空行分段，「一段一个换行」统计成 1 段
  await t.input(field, '第一段\n第二段\n第三段')
  tiles = await t.eval(TILES)
  assert.equal(tiles['段落'], 3)
  assert.equal(tiles['行数'], 3)
  t.pass('第一段\\n第二段\\n第三段 → 段落 3')

  await t.input(field, '👨‍👩‍👧🇨🇳')
  tiles = await t.eval(TILES)
  assert.equal(tiles['字符数'], 2)
  t.pass('👨‍👩‍👧🇨🇳 → 字符数 2（按字素）')

  await t.input(field, "ＡＢＣ１２３ café don't e-mail")
  tiles = await t.eval(TILES)
  assert.equal(tiles['英文单词'], 4)
  assert.equal(tiles['数字串'], 1)
  t.pass("ＡＢＣ１２３ café don't e-mail → 单词 4、数字串 1（全角归一、重音和连接符不断词）")

  await t.input(field, '，。！？……——')
  tiles = await t.eval(TILES)
  assert.equal(tiles[READING], 0)
  assert.equal(tiles['字数'], 0)
  assert.ok(tiles['字符数'] > 0)
  t.pass(`只有标点：字符数 ${tiles['字符数']}，字数 0，阅读时长 0`)

  await t.page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await t.input(field, '字'.repeat(3000))
  await t.delay(200)
  const scrollWidth = await t.eval('document.documentElement.scrollWidth')
  assert.ok(scrollWidth <= 390, `horizontal overflow at 390px: ${scrollWidth}`)
  t.pass(`390px 宽无横向溢出（scrollWidth ${scrollWidth}）`)
})
