import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { collection, onSnapshot, doc, getDoc, getDocs, setDoc, addDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from './AuthContext'
import { fetchThaiPublicHolidays } from '../utils/holidaySync'

const HolidaysContext = createContext(null)

export function HolidaysProvider({ children }) {
  const { loading: authLoading, employee } = useAuth()
  const [holidays, setHolidays] = useState([])
  const hasTriedSync = useRef(false)

  useEffect(() => {
    if (authLoading) return
    const unsub = onSnapshot(collection(db, 'holidays'), (snap) => {
      setHolidays(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.date || '').localeCompare(b.date || '')))
    })
    return unsub
  }, [authLoading])

  // ซิงก์วันหยุดราชการจริงของปีปัจจุบัน (และปีถัดไป) ให้อัตโนมัติ — ทำครั้งเดียวต่อปีต่อเครื่อง
  // ทำงานเฉพาะตอนแอดมินล็อกอิน เพื่อไม่ให้พนักงานทั่วไปสั่งเขียนข้อมูลนี้โดยไม่ตั้งใจ
  useEffect(() => {
    if (authLoading || !employee || employee.role !== 'admin' || hasTriedSync.current) return
    hasTriedSync.current = true

    async function autoSync() {
      try {
        const metaRef = doc(db, 'meta', 'holidaySync')
        const metaSnap = await getDoc(metaRef)
        const syncedYears = metaSnap.exists() ? metaSnap.data().syncedYears || [] : []
        const thisYear = new Date().getFullYear()
        const yearsToSync = [thisYear, thisYear + 1].filter((y) => !syncedYears.includes(y))
        if (yearsToSync.length === 0) return

        const existingSnap = await getDocs(collection(db, 'holidays'))
        const existingDates = new Set(existingSnap.docs.map((d) => d.data().date))

        for (const year of yearsToSync) {
          const fetched = await fetchThaiPublicHolidays(year)
          for (const h of fetched) {
            if (existingDates.has(h.date)) continue
            await addDoc(collection(db, 'holidays'), { date: h.date, name: h.name, enabled: true, source: 'auto', year })
            existingDates.add(h.date)
          }
        }
        await setDoc(metaRef, { syncedYears: [...syncedYears, ...yearsToSync] }, { merge: true })
      } catch (err) {
        // ดึงข้อมูลไม่สำเร็จก็ไม่เป็นไร — แอดมินยังเพิ่ม/แก้ไขวันหยุดเองที่หน้า "วันหยุด" ได้ตามปกติ
        console.warn('Holiday auto-sync failed', err)
      }
    }
    autoSync()
  }, [authLoading, employee])

  const holidayDates = useMemo(() => new Set(holidays.filter((h) => h.enabled !== false).map((h) => h.date)), [holidays])

  return <HolidaysContext.Provider value={{ holidays, holidayDates }}>{children}</HolidaysContext.Provider>
}

export function useHolidays() {
  const ctx = useContext(HolidaysContext)
  if (!ctx) throw new Error('useHolidays must be used within HolidaysProvider')
  return ctx
}
