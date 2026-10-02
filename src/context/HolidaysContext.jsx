import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { collection, onSnapshot, doc, getDoc, getDocs, setDoc, addDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from './AuthContext'
import { buildCompensatoryHolidays, fetchThaiPublicHolidays } from '../utils/holidaySync'
import { notifyError, notifySuccess } from '../components/ToastViewport'

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
        const yearsToPrepare = [thisYear, thisYear + 1]
        const yearsToSync = yearsToPrepare.filter((y) => !syncedYears.includes(y))

        const existingSnap = await getDocs(collection(db, 'holidays'))
        const existingHolidays = existingSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
        const existingDates = new Set(existingHolidays.map((h) => h.date))
        let addedCount = 0

        for (const year of yearsToPrepare) {
          let fetched = []
          if (yearsToSync.includes(year)) {
            try {
              fetched = await fetchThaiPublicHolidays(year)
            } catch (err) {
              console.warn(`Holiday sync failed for ${year}`, err)
              notifyError(`ดึงวันหยุดปี ${year} ไม่สำเร็จ (${err.message || 'unknown'})`)
            }
          }
          for (const h of fetched) {
            if (existingDates.has(h.date)) continue
            const holiday = { date: h.date, name: h.name, enabled: true, source: 'auto', year }
            await addDoc(collection(db, 'holidays'), holiday)
            existingHolidays.push(holiday)
            existingDates.add(h.date)
            addedCount++
          }
          const compensatory = buildCompensatoryHolidays([...existingHolidays, ...fetched.map((h) => ({ ...h, source: 'auto' }))], year)
          for (const holiday of compensatory) {
            if (existingDates.has(holiday.date)) continue
            await addDoc(collection(db, 'holidays'), holiday)
            existingHolidays.push(holiday)
            existingDates.add(holiday.date)
            addedCount++
          }
        }
        if (yearsToSync.length > 0) {
          await setDoc(metaRef, { syncedYears: [...syncedYears, ...yearsToSync] }, { merge: true })
        }
        if (addedCount > 0) notifySuccess(`ซิงก์วันหยุดอัตโนมัติ ${addedCount} วันแล้ว`)
      } catch (err) {
        // ดึงข้อมูลไม่สำเร็จก็ไม่เป็นไร — แอดมินยังเพิ่ม/แก้ไขวันหยุดเองที่หน้า "วันหยุด" ได้ตามปกติ
        console.warn('Holiday auto-sync failed', err)
        notifyError(`ซิงก์วันหยุดอัตโนมัติไม่สำเร็จ (${err.code || err.message || 'unknown'})`)
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
