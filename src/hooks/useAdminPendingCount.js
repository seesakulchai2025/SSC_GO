import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

// นับจำนวนใบลาที่ "รออนุมัติ" แบบเรียลไทม์ ใช้ทำจุดแดงแจ้งเตือนที่เมนู "อนุมัติ" ของแอดมิน
export function useAdminPendingCount(enabled) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const q = query(collection(db, 'leaveRequests'), where('status', '==', 'pending'))
    const unsub = onSnapshot(q, (snap) => setCount(snap.size))
    return unsub
  }, [enabled])

  return enabled ? count : 0
}
