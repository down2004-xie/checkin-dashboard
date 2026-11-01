// 答案之书的单工具验收。运行：node scripts/checks/answer-book.mjs
// 按住交互必须用 CDP 真输入事件（Input.dispatch*）：合成 PointerEvent 不触发 pointer capture，
// 和拖拽排序验收（test:drag）同一个原因。
import { runToolCheck } from '../lib/tool-harness.mjs'

await runToolCheck('答案之书', async (t) => {
  const { page, assert, delay } = t
  const answerText = () => t.eval("document.querySelector('.answer-book__answer')?.textContent ?? null")
  const notice = () => t.eval("document.querySelector('.answer-book__notice').textContent")
  const center = async () => t.eval("(() => { const r = document.querySelector('.answer-book__button').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()")
  const mouse = (type, { x, y }) => page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 })
  const storage = () => t.eval('JSON.stringify(Object.entries(localStorage).sort())')
  const storageBefore = await storage()

  // 1. 初始是封面，没有答案；文案里有「仅供娱乐」
  assert.equal(await answerText(), null)
  assert.ok((await t.eval("document.querySelector('.tool-panel').textContent")).includes('仅供娱乐，随机抽取，不是预测'))
  t.pass('初始显示封面，界面写明「仅供娱乐，随机抽取，不是预测」')

  // 2. 鼠标按住 0.4 秒就松手：不出答案，给提示
  let point = await center()
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y })
  await mouse('mousePressed', point)
  await delay(400)
  const midProgress = Number(await t.eval("document.querySelector('.answer-book__progress').getAttribute('aria-valuenow')"))
  assert.ok(midProgress > 5 && midProgress < 60, `progress mid-hold should be partial, got ${midProgress}`)
  await mouse('mouseReleased', point)
  await delay(100)
  assert.equal(await answerText(), null, 'early release must not reveal')
  assert.ok((await notice()).includes('松手太早'))
  assert.equal(await t.eval("document.querySelector('.answer-book__progress').getAttribute('aria-valuenow')"), '0')
  t.pass(`按住 0.4 秒时进度 ${midProgress}%，松手后不出答案、进度归零、提示「松手太早」`)

  // 3. 鼠标按住 1.8 秒：出答案，有翻书动画
  await mouse('mousePressed', point)
  await delay(1800)
  await mouse('mouseReleased', point)
  await t.waitFor("!!document.querySelector('.answer-book__answer')", 'answer not revealed after long hold')
  const first = await answerText()
  assert.ok(first && first.length > 0)
  assert.equal(await t.eval("getComputedStyle(document.querySelector('.answer-book__page')).animationName"), 'answer-book-flip')
  assert.equal(await notice(), '')
  t.pass(`鼠标按住 1.8 秒翻开答案「${first}」，翻书动画 answer-book-flip 生效`)

  // 4. 键盘：聚焦按钮，按住空格 1.8 秒（keydown 只发一次，模拟不自动重复的情况）
  await t.eval("document.querySelector('.answer-book__button').focus()")
  const space = (type) => page.send('Input.dispatchKeyEvent', { type, key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 })
  await space('keyDown')
  await delay(300)
  await space('keyUp')
  await delay(100)
  assert.equal(await answerText(), first, 'early key release must not change answer')
  assert.ok((await notice()).includes('松手太早'))
  await space('keyDown')
  await delay(1800)
  await space('keyUp')
  await delay(100)
  const second = await answerText()
  assert.notEqual(second, first, 'keyboard hold should reveal a different answer (no immediate repeat)')
  t.pass(`键盘按住空格：0.3 秒松开不翻，1.8 秒翻出新答案「${second}」（和上一条不同）`)

  // 5. 回车同样可以
  const enter = (type) => page.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
  await enter('keyDown')
  await delay(1800)
  await enter('keyUp')
  await delay(100)
  const third = await answerText()
  assert.notEqual(third, second)
  t.pass(`键盘按住回车翻出「${third}」`)

  // 6. 「直接翻开」辅助入口：连续点 30 次，相邻两次从不重复
  let previous = third
  for (let i = 0; i < 30; i += 1) {
    await t.clickText('直接翻开（不用按住）')
    const next = await answerText()
    assert.notEqual(next, previous, `direct reveal repeated "${next}"`)
    previous = next
  }
  t.pass('「直接翻开」连点 30 次，相邻两次从不重复')

  // 7. 触屏：开触摸模拟后发 touchStart / touchEnd
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
  point = await center()
  const touch = (type) => page.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: point.x, y: point.y }] })
  await touch('touchStart')
  await delay(300)
  await touch('touchEnd')
  await delay(100)
  assert.equal(await answerText(), previous, 'early touch release must not reveal')
  assert.ok((await notice()).includes('松手太早'))
  await touch('touchStart')
  await delay(1800)
  await touch('touchEnd')
  await delay(100)
  const touched = await answerText()
  assert.notEqual(touched, previous)
  t.pass(`触屏：0.3 秒松手不翻，按住 1.8 秒翻出「${touched}」`)
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: false })

  // 8. 按住中切走窗口（blur）：复位，不会卡在「按住中」
  point = await center()
  await mouse('mousePressed', point)
  await delay(300)
  await t.eval("window.dispatchEvent(new Event('blur'))")
  await delay(100)
  assert.ok((await notice()).includes('被打断'))
  assert.equal(await t.eval("document.querySelector('.answer-book__button').classList.contains('answer-book__button--holding')"), false)
  await mouse('mouseReleased', point)
  await delay(1700)
  assert.equal(await answerText(), touched, 'blur-cancelled hold must not reveal later')
  t.pass('按住中窗口失焦：立刻复位并提示「被打断」，之后也不会偷偷翻开')

  // 9. prefers-reduced-motion：不做动画直接显示
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await t.clickText('直接翻开（不用按住）')
  assert.equal(await t.eval("getComputedStyle(document.querySelector('.answer-book__page')).animationName"), 'none')
  assert.equal(await t.eval("getComputedStyle(document.querySelector('.answer-book__page')).opacity"), '1')
  t.pass('reduced-motion 下 animation-name 为 none，答案直接可见')
  await page.send('Emulation.setEmulatedMedia', { features: [] })

  // 10. 不碰 localStorage
  assert.equal(await storage(), storageBefore)
  t.pass('整套操作前后 localStorage 完全一致')

  // 11. 移动端 390px 不横向溢出
  await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await delay(300)
  const overflow = await t.eval('document.documentElement.scrollWidth - window.innerWidth')
  assert.ok(overflow <= 0, `horizontal overflow ${overflow}px at 390px`)
  t.pass('390px 宽无横向溢出')
  await t.shot('answer-book-390.png')
})
