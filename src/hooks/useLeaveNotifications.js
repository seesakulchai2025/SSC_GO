import { useEffect, useState, useCallback } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

function storageKey(employeeId) {
  return `leave-tracker-last-seen-${employeeId}`
}

// ติดตามว่าใบลาของพนักงานคนนี้มีรายการที่เพิ่งถูกอนุมัติ/ปฏิเสธ ที่ยังไม่เคยเปิดดูหรือไม่
// ใช้เวลาที่บันทึกไว้ในเครื่อง (localStorage) เทียบกับเวลาที่แอดมินตัดสินใจ (reviewedAt)
export function useLeaveNotifications(employeeId) {
  const [requests, setRequests] = useState([])
  const [lastSeen, setLastSeen] = useState(() => Number(localStorage.getItem(storageKey(employeeId))) || 0)

  useEffect(() => {
    if (!employeeId) return
    const q = query(collection(db, 'leaveRequests'), where('employeeId', '==', employeeId))
    const unsub = onSnapshot(q, (snap) => {
      setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [employeeId])

  const unseenCount = requests.filter((r) => {
    if (r.status !== 'approved' && r.status !== 'rejected') return false
    const reviewedMs = r.reviewedAt?.toMillis ? r.reviewedAt.toMillis() : 0
    return reviewedMs > lastSeen
  }).length

  const markAllSeen = useCallback(() => {
    const now = Date.now()
    localStorage.setItem(storageKey(employeeId), String(now))
    setLastSeen(now)
  }, [employeeId])

  return { unseenCount, markAllSeen }
}
