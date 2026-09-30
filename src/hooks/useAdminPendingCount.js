import { useCallback, useEffect, useRef, useState } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

// นับจำนวนใบลาที่ "รออนุมัติ" แบบเรียลไทม์ ใช้ทำจุดแดงแจ้งเตือนที่เมนู "อนุมัติ" ของแอดมิน
export function useAdminPendingCount(enabled) {
  const [count, setCount] = useState(0)
  const [notice, setNotice] = useState(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (!enabled) {
      initialized.current = false
      setCount(0)
      setNotice(null)
      return undefined
    }
    const q = query(collection(db, 'leaveRequests'), where('status', '==', 'pending'))
    const unsub = onSnapshot(q, (snap) => {
      setCount(snap.size)
      if (!initialized.current) {
        initialized.current = true
        return
      }
      const added = snap.docChanges().filter((change) => change.type === 'added')
      if (added.length > 0) {
        setNotice({
          id: `${Date.now()}-${added[0].doc.id}`,
          count: added.length,
          employeeName: added.length === 1 ? added[0].doc.data().employeeName : '',
        })
      }
    }, (error) => console.warn('Pending leave listener failed', error))
    return unsub
  }, [enabled])

  useEffect(() => {
    if (!notice) return undefined
    const timeout = window.setTimeout(() => setNotice(null), 10000)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const dismissNotice = useCallback(() => setNotice(null), [])

  return { count: enabled ? count : 0, notice, dismissNotice }
}
