import type { Preferences } from '../types'

interface SettingsPanelProps {
  value: Preferences
  onChange: (patch: Partial<Preferences>) => void
}

export function SettingsPanel({ value, onChange }: SettingsPanelProps) {
  return (
    <details className="settings panel">
      <summary>外观与显示设置</summary>
      <div className="settings-grid">
        <label>主题配色<select aria-label="主题配色" value={value.theme} onChange={(event) => onChange({ theme: event.target.value as Preferences['theme'] })}>
          <option value="auto">跟随时段</option><option value="dawn">清晨紫</option><option value="day">晴日蓝</option><option value="dusk">落日橙</option><option value="night">静夜靛</option>
        </select></label>
        <label>视觉效果<select aria-label="视觉效果" value={value.effects} onChange={(event) => onChange({ effects: event.target.value as Preferences['effects'] })}>
          <option value="full">完整特效</option><option value="light">轻量特效</option><option value="static">静态模式</option>
        </select></label>
        <label className="check-label"><input type="checkbox" checked={value.compact} onChange={(event) => onChange({ compact: event.target.checked })} />紧凑卡片布局</label>
      </div>
      <p className="hint">轻量模式关闭花瓣、树摆动与指针追光；静态模式进一步关闭动画。始终尊重系统减少动态效果偏好。</p>
    </details>
  )
}
