import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { todayISO, DURATION_LABELS } from '../utils/dateUtils'
import MobileSheetSection from './MobileSheetSection'

export default function TodayLeaveCard() {
  const [requests, setRequests] = useState([])

  useEffect(() => {
    const q = query(collection(db, 'leaveRequests'), where('status', '==', 'approved'))
    const unsub = onSnapshot(q, (snap) => setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
    return unsub
  }, [])

  const today = todayISO()
  const todayList = requests
    .filter((r) => r.startDate <= today && r.endDate >= today)
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'th'))

  return (
    <div className="card page-card">
      <p className={`font-display font-semibold text-ink mb-1 ${todayList.length > 0 ? 'hidden sm:block' : ''}`}>
        วันนี้ใครลาบ้าง {todayList.length > 0 && <span className="text-brass-dark">({todayList.length} คน)</span>}
        {todayList.length === 0 && <span className="text-sm font-normal text-ink-soft sm:hidden">· ไม่มีใครลา</span>}
      </p>
      {todayList.length === 0 ? (
        <p className="hidden text-sm text-ink-soft sm:block">วันนี้ไม่มีใครลา ทุกคนเข้างานตามปกติ</p>
      ) : (
        <MobileSheetSection
          title="วันนี้ใครลาบ้าง"
          label={`วันนี้ลา ${todayList.length} คน`}
          summary="ดูรายชื่อ"
          triggerClassName="min-h-8 border-0 bg-transparent !px-0 font-display"
        >
          <div className="space-y-2 mt-2">
            {todayList.map((r) => (
              <div key={r.id} className="text-sm border-b border-ink/10 pb-2 last:border-0 last:pb-0">
                <p className="font-semibold text-ink">
                  {r.employeeName} <span className="text-ink-soft font-normal">· {r.department}</span>
                </p>
                <p className="text-ink-soft text-xs">
                  {r.leaveTypeName}
                  {r.duration && r.duration !== 'full' ? ` (${DURATION_LABELS[r.duration]})` : ''}
                </p>
              </div>
            ))}
          </div>
        </MobileSheetSection>
      )}
    </div>
  )
}
