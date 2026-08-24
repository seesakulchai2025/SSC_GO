const LABELS = {
  pending: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ไม่อนุมัติ',
  cancelled: 'ยกเลิกแล้ว',
}

export default function StatusBadge({ status }) {
  const cls =
    status === 'approved' ? 'stamp-approved'
    : status === 'rejected' ? 'stamp-rejected'
    : status === 'cancelled' ? 'stamp-cancelled'
    : 'stamp-pending'
  return <span className={cls}>{LABELS[status] || status}</span>
}
