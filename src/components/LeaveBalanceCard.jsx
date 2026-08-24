export default function LeaveBalanceCard({ leaveType, used, quota }) {
  const remaining = Math.max(quota - used, 0)
  const pct = quota > 0 ? Math.min((used / quota) * 100, 100) : 0
  const over = used > quota

  return (
    <div className="card p-4">
      <p className="font-display font-semibold text-ink">{leaveType.name}</p>
      <div className="flex items-end justify-between mt-2">
        <p className="text-3xl font-mono font-semibold text-ink">
          {remaining}
          <span className="text-sm font-sans font-normal text-ink-soft ml-1">วันคงเหลือ</span>
        </p>
      </div>
      <div className="h-1.5 rounded-full bg-ink/10 mt-3 overflow-hidden">
        <div
          className={`h-full rounded-full ${over ? 'bg-clay' : 'bg-brass'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-ink-soft mt-1.5 font-mono">
        ใช้ไป {used} จากโควตา {quota} วัน
      </p>
    </div>
  )
}
