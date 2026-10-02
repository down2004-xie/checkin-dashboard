interface BackupBarProps {
  /** 操作结果提示，null 表示不显示 */
  notice: string | null
  onExport: () => void
  onImportClick: () => void
}

/**
 * 数据备份操作条。
 *
 * 为什么这个功能要放在显眼位置而不是藏进设置里：
 * 本项目不做跨设备同步，localStorage 是唯一存储。
 * 用户清一次浏览数据，所有签到历史就没了 —— 连续天数无法恢复。
 * 所以备份不是「高级功能」，是数据安全的基本保障，值得占一块版面。
 */
export function BackupBar({ notice, onExport, onImportClick }: BackupBarProps) {
  return (
    <footer className="backup">
      <div className="backup__text">
        <span className="backup__title">数据只存在本机浏览器</span>
        <span className="backup__hint">
          清理浏览数据会丢失记录，建议定期导出备份
        </span>
      </div>

      <div className="backup__actions">
        <button type="button" className="btn" onClick={onExport}>
          导出备份
        </button>
        <button type="button" className="btn" onClick={onImportClick}>
          导入备份
        </button>
      </div>

      {notice && (
        <p className="backup__notice" role="status">
          {notice}
        </p>
      )}
    </footer>
  )
}
