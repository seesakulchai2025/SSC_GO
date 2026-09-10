export default function LeaveBalanceCard({ leaveType, used, quota }) {
  const remaining = quota - used
  const over = remaining < 0
  const pct = quota > 0 ? Math.min((used / quota) * 100, 100) : 0

  return (
    <div className="card p-4">
      <p className="font-display font-semibold text-ink">{leaveType.name}</p>
      <div className="flex items-end justify-between mt-2">
        <p className={`text-3xl font-mono font-semibold ${over ? 'text-clay' : 'text-ink'}`}>
          {remaining}
          <span className={`text-sm font-sans font-normal ml-1 ${over ? 'text-clay' : 'text-ink-soft'}`}>
            {over ? 'วันเกินโควตา' : 'วันคงเหลือ'}
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
