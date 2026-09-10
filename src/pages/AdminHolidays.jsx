import { useEffect, useState } from 'react'
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore'
import { db } from '../firebase'
import { formatThaiDate, todayISO } from '../utils/dateUtils'
import { fetchThaiPublicHolidays } from '../utils/holidaySync'

export default function AdminHolidays() {
  const [holidays, setHolidays] = useState([])
  const [newDate, setNewDate] = useState(todayISO())
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')

  const [syncYear, setSyncYear] = useState(new Date().getFullYear())
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'holidays'), (snap) =>
      setHolidays(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.date || '').localeCompare(b.date || '')))
    )
    return unsub
  }, [])

  async function addHoliday(e) {
    e.preventDefault()
    setError('')
    if (!newName.trim()) {
      setError('กรุณาตั้งชื่อวันหยุด')
      return
    }
    if (holidays.some((h) => h.date === newDate)) {
      setError('มีวันหยุดของวันที่นี้อยู่แล้ว')
      return
    }
    await addDoc(collection(db, 'holidays'), { date: newDate, name: newName.trim(), enabled: true, source: 'manual' })
    setNewName('')
  }

  async function toggleHoliday(h) {
    await updateDoc(doc(db, 'holidays', h.id), { enabled: !(h.enabled !== false) })
  }

  async function removeHoliday(h) {
    if (!confirm(`ลบวันหยุด "${h.name}" (${formatThaiDate(h.date)})?`)) return
    await deleteDoc(doc(db, 'holidays', h.id))
  }

  async function handleSync() {
    setSyncing(true)
    setSyncMsg('')
    try {
      const fetched = await fetchThaiPublicHolidays(syncYear)
      const existingDates = new Set(holidays.map((h) => h.date))
      let added = 0
      for (const h of fetched) {
        if (existingDates.has(h.date)) continue
        await addDoc(collection(db, 'holidays'), { date: h.date, name: h.name, enabled: true, source: 'auto', year: syncYear })
        existingDates.add(h.date)
        added++
      }
      setSyncMsg(added > 0 ? `ดึงวันหยุดใหม่มาเพิ่ม ${added} วันเรียบร้อย` : 'ไม่มีวันหยุดใหม่ที่ต้องเพิ่ม (มีอยู่แล้วทั้งหมด)')
    } catch (err) {
      setSyncMsg('ดึงข้อมูลจากอินเทอร์เน็ตไม่สำเร็จ ลองใหม่อีกครั้ง หรือเพิ่มด้วยตนเองด้านล่าง')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">วันหยุดราชการ / นักขัตฤกษ์</h1>
        <p className="text-sm text-ink-soft mt-1">
          วันทำการของร้านคือ จันทร์–เสาร์ (หยุดวันอาทิตย์เป็นค่าเริ่มต้น) ระบบดึงวันหยุดราชการจริงของไทยมาให้อัตโนมัติทุกปี
          (ปีปัจจุบันและปีถัดไป) — ใช้สวิตช์เปิด/ปิดเพื่อเลือกว่าวันไหนร้านหยุดจริง วันไหนเปิดตามปกติแม้เป็นวันหยุดราชการ
        </p>
      </div>

      <div className="card p-4 bg-brass/5 border-brass/20 space-y-3">
        <p className="text-sm text-ink">
          <span className="font-semibold">ดึงวันหยุดจากอินเทอร์เน็ตด้วยตนเอง</span> — ปกติระบบดึงให้อัตโนมัติอยู่แล้วเมื่อแอดมินเข้าใช้งาน
          แต่กดปุ่มนี้ได้ถ้าอยากดึงซ้ำ หรือดึงของปีอื่นเพิ่ม
        </p>
        <div className="flex gap-2">
          <input
            type="number"
            value={syncYear}
            onChange={(e) => setSyncYear(Number(e.target.value))}
            className="input-field w-28"
          />
          <button onClick={handleSync} disabled={syncing} className="btn-secondary py-2 px-4 text-sm">
            {syncing ? 'กำลังดึงข้อมูล...' : 'ดึงวันหยุดปีนี้'}
          </button>
        </div>
        {syncMsg && <p className="text-sm text-ink-soft">{syncMsg}</p>}
        <p className="text-xs text-ink-soft">
          ข้อมูลดึงจากบริการสาธารณะ (Nager.Date) อาจไม่ครบ 100% โดยเฉพาะวันหยุดชดเชยพิเศษที่ประกาศภายหลัง
          แนะนำให้ตรวจสอบกับประกาศราชการอย่างเป็นทางการอีกครั้ง
        </p>
      </div>

      <form onSubmit={addHoliday} className="card p-4 space-y-3">
        <p className="text-sm font-semibold text-ink">เพิ่มวันหยุดเอง</p>
        <div className="grid grid-cols-2 gap-3">
          <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="input-field" required />
          <input placeholder="ชื่อวันหยุด เช่น วันหยุดพิเศษของร้าน" value={newName} onChange={(e) => setNewName(e.target.value)} className="input-field" required />
        </div>
        {error && <p className="text-clay text-sm">{error}</p>}
        <button className="btn-primary py-2 px-4 text-sm">+ เพิ่มวันหยุด</button>
      </form>

      <div className="space-y-2">
        {holidays.length === 0 && <p className="text-ink-soft text-sm py-6 text-center">ยังไม่มีวันหยุดที่เพิ่มไว้</p>}
        {holidays.map((h) => {
          const enabled = h.enabled !== false
          return (
            <div key={h.id} className="card p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-ink">
                  {h.name}
                  {h.source === 'auto' && <span className="ml-2 text-xs stamp-pending align-middle">ดึงอัตโนมัติ</span>}
                </p>
                <p className="text-sm text-ink-soft font-mono">{formatThaiDate(h.date)}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => toggleHoliday(h)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-sage' : 'bg-ink/20'}`}
                  title={enabled ? 'กำลังเปิดใช้งาน (ร้านหยุดวันนี้)' : 'ปิดใช้งาน (ร้านเปิดตามปกติ)'}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                    }`}
                  />
                </button>
                <button onClick={() => removeHoliday(h)} className="text-clay text-sm font-semibold">
                  ลบ
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
