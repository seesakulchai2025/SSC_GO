export default function LeaveBalanceCard({ leaveType, used, quota, variant = 'bar' }) {
  const remaining = quota - used
  const over = remaining < 0
  const pct = quota > 0 ? Math.min(Math.max((used / quota) * 100, 0), 100) : 0
  const formatDays = (value) => new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 }).format(value)

  if (variant === 'donut') {
    return (
      <article className="card flex min-w-0 flex-col items-center gap-2 p-2 text-center sm:gap-3 sm:p-3">
        <h3 className="max-w-full text-xs font-semibold leading-4 text-ink sm:text-sm">{leaveType.name}</h3>
        <div
          role="img"
          aria-label={`${leaveType.name} คงเหลือ ${formatDays(remaining)} วัน ใช้ไป ${formatDays(used)} จาก ${formatDays(quota)} วัน`}
          className="grid size-20 shrink-0 place-items-center rounded-full sm:size-28"
          style={{ background: `conic-gradient(${over ? 'var(--color-rejected)' : 'var(--color-accent)'} ${pct}%, var(--color-border) ${pct}% 100%)` }}
        >
          <div className="grid size-16 place-content-center rounded-full bg-white sm:size-24">
            <span className={`font-mono text-lg font-semibold leading-6 sm:text-2xl ${over ? 'text-clay' : 'text-ink'}`}>{formatDays(remaining)}</span>
            <span className="text-[10px] leading-4 text-ink-soft sm:text-xs">วันคงเหลือ</span>
          </div>
        </div>
        <p className={`text-[10px] leading-4 text-ink-soft sm:text-xs ${over ? 'text-clay' : ''}`}>ใช้ {formatDays(used)} / {formatDays(quota)} วัน</p>
      </article>
    )
  }

  return (
    <div className="card p-4">
      <p className="font-display font-semibold text-ink">{leaveType.name}</p>
      <div className="flex items-end justify-between mt-2">
        <p className={`text-3xl font-mono font-semibold ${over ? 'text-clay' : 'text-ink'}`}>
          {remaining}
          <span className={`text-sm font-sans font-normal ml-1 ${over ? 'text-clay' : 'text-ink-soft'}`}>
            {over ? 'วันใช้เกิน' : 'วันคงเหลือ'}
          </span>
        </p>
      </div>
      <div className="h-1.5 rounded-full bg-ink/10 mt-3 overflow-hidden">
        <div
          className={`h-full rounded-full ${over ? 'bg-clay' : 'bg-brass'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={`text-xs mt-1.5 font-mono ${over ? 'text-clay font-semibold' : 'text-ink-soft'}`}>
        ใช้ไป {used} จากโควตา {quota} วัน
      </p>
    </div>
  )
}
