import StatusBadge from './StatusBadge'
import { formatThaiDate, DURATION_LABELS } from '../utils/dateUtils'

export default function LeaveHistoryList({ requests, showEmployee = false, actions }) {
  if (requests.length === 0) {
    return <p className="text-ink-soft text-sm py-6 text-center">ยังไม่มีรายการ</p>
  }

  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <div key={r.id} className="card p-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {showEmployee && (
              <p className="font-semibold text-ink text-sm">
                {r.employeeName} <span className="text-ink-soft font-normal">· {r.department}</span>
              </p>
            )}
            <p className="font-display font-semibold text-ink">{r.leaveTypeName}</p>
            <p className="text-sm text-ink-soft font-mono">
              {formatThaiDate(r.startDate)}
              {r.startDate !== r.endDate && ` – ${formatThaiDate(r.endDate)}`} · {r.days} วัน
              {r.duration && r.duration !== 'full' && ` (${DURATION_LABELS[r.duration]})`}
            </p>
            {r.reason && <p className="text-sm text-ink-soft mt-1">"{r.reason}"</p>}
            {r.attachmentData && (
              <a
                href={r.attachmentData}
                download={r.attachmentName || 'evidence'}
                className="text-xs text-brass-dark font-semibold underline mt-1 inline-block"
              >
                📎 {r.attachmentName || 'ดูหลักฐานที่แนบ'}
              </a>
            )}
            {r.status !== 'pending' && r.reviewedBy && (
              <p className="text-xs text-ink-soft mt-1">
                {r.status === 'approved' ? 'อนุมัติโดย' : 'ปฏิเสธโดย'} {r.reviewedBy}
                {r.reviewNote ? ` · เหตุผล: ${r.reviewNote}` : ''}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <StatusBadge status={r.status} />
            {actions?.(r)}
          </div>
        </div>
      ))}
    </div>
  )
}
