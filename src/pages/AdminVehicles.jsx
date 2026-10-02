import { useEffect, useState } from 'react'
import { addDoc, collection, doc, onSnapshot, runTransaction, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { notifyError, notifySuccess } from '../components/ToastViewport'

function explainError(action, error) {
  if (error.code === 'permission-denied' || error.message?.includes('Missing or insufficient permissions')) {
    return `${action}ไม่สำเร็จ: Firestore ยังไม่อนุญาต collection รถ ให้ Publish firestore.rules ใน Firebase Console หรือรัน npm run deploy:firestore หลังติดตั้ง Firebase CLI และเข้าสู่ระบบ`
  }
  return `${action}ไม่สำเร็จ (${error.message || 'unknown'})`
}

export default function AdminVehicles() {
  const [vehicles, setVehicles] = useState([])
  const [maxHours, setMaxHours] = useState(8)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const stopVehicles = onSnapshot(collection(db, 'vehicles'), (snapshot) => {
      setVehicles(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'th')))
    }, (error) => notifyError(`โหลดรายชื่อรถไม่สำเร็จ (${error.message})`))
    const stopSettings = onSnapshot(doc(db, 'systemSettings', 'vehicleLog'), (snapshot) => {
      if (snapshot.exists()) setMaxHours(Number(snapshot.data().maxCheckoutHours) || 8)
    }, (error) => notifyError(`โหลดการตั้งค่าไม่สำเร็จ (${error.message})`))
    return () => { stopVehicles(); stopSettings() }
  }, [])

  async function saveVehicle(event) {
    event.preventDefault()
    const name = editing.name.trim()
    const plate = editing.plate.trim()
    if (!name || !plate) return
    if (vehicles.some((item) => item.id !== editing.id && item.plate.toLocaleLowerCase() === plate.toLocaleLowerCase())) {
      notifyError('เลขทะเบียนนี้มีอยู่ในระบบแล้ว')
      return
    }
    setSaving(true)
    try {
      if (editing.id) {
        await updateDoc(doc(db, 'vehicles', editing.id), { name, plate, updatedAt: serverTimestamp() })
        notifySuccess('แก้ไขข้อมูลรถเรียบร้อยแล้ว')
      } else {
        await addDoc(collection(db, 'vehicles'), { name, plate, active: true, activeCheckoutId: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        notifySuccess('เพิ่มรถเรียบร้อยแล้ว')
      }
      setEditing(null)
    } catch (error) {
      notifyError(explainError('บันทึกข้อมูลรถ', error))
    } finally {
      setSaving(false)
    }
  }

  async function saveMaxHours(event) {
    event.preventDefault()
    const value = Number(maxHours)
    if (!Number.isFinite(value) || value < 0.25 || value > 168) {
      notifyError('กำหนดเวลาได้ตั้งแต่ 0.25 ถึง 168 ชั่วโมง')
      return
    }
    try {
      await setDoc(doc(db, 'systemSettings', 'vehicleLog'), { maxCheckoutHours: value, updatedAt: serverTimestamp() }, { merge: true })
      notifySuccess('บันทึกเวลาคืนรถสูงสุดแล้ว')
    } catch (error) {
      notifyError(explainError('บันทึกการตั้งค่า', error))
    }
  }

  async function toggleVehicle(vehicle) {
    const nextActive = vehicle.active === false
    try {
      await runTransaction(db, async (transaction) => {
        const vehicleRef = doc(db, 'vehicles', vehicle.id)
        const snapshot = await transaction.get(vehicleRef)
        if (!snapshot.exists()) throw new Error('ไม่พบข้อมูลรถ')
        if (!nextActive && snapshot.data().activeCheckoutId) throw new Error('รถคันนี้ยังมีผู้ใช้งานอยู่ กรุณาบันทึกคืนรถก่อน')
        transaction.update(vehicleRef, { active: nextActive, updatedAt: serverTimestamp() })
      })
      notifySuccess(nextActive ? 'เปิดใช้งานรถแล้ว' : 'ปิดใช้งานรถแล้ว')
    } catch (error) {
      notifyError(error.message || 'เปลี่ยนสถานะรถไม่สำเร็จ')
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <header className="border-b border-ink/10 pb-4">
        <p className="font-mono text-xs uppercase text-brass-dark">Fleet settings</p>
        <h1 className="font-display text-2xl font-semibold text-ink">จัดการรถบริษัท</h1>
        <p className="mt-1 text-sm text-ink-soft">เพิ่มหรือแก้ไขชื่อรถและเลขทะเบียน พร้อมกำหนดเวลาคืนสูงสุด</p>
      </header>

      <form onSubmit={saveMaxHours} className="flex flex-wrap items-end gap-3 border-y border-ink/10 py-4">
        <label className="max-w-48 text-sm font-medium text-ink">เวลาคืนสูงสุด (ชั่วโมง)<input type="number" min="0.25" max="168" step="0.25" value={maxHours} onChange={(event) => setMaxHours(event.target.value)} className="input-field mt-1" required /></label>
        <button className="btn-secondary px-4 py-3 text-sm">บันทึกเวลา</button>
        <p className="basis-full text-xs text-ink-soft">ระบบแสดงรายการเกินกำหนดเมื่อเลยเวลานี้ และเวลาคืนคำนวณจากเวลาเบิกรถ</p>
      </form>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-ink">รายชื่อรถ ({vehicles.length})</h2>
          <button type="button" onClick={() => setEditing({ id: null, name: '', plate: '' })} className="btn-primary px-4 py-2 text-sm">+ เพิ่มรถ</button>
        </div>
        {editing && (
          <form onSubmit={saveVehicle} className="card mb-4 grid gap-3 p-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-ink">ชื่อรถ<input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} className="input-field mt-1" placeholder="เช่น กระบะ 1" required /></label>
            <label className="text-sm font-medium text-ink">เลขทะเบียน<input value={editing.plate} onChange={(event) => setEditing({ ...editing, plate: event.target.value })} className="input-field mt-1" placeholder="เช่น กข 1234" required /></label>
            <div className="flex gap-2 sm:col-span-2"><button disabled={saving} className="btn-primary px-4 py-2 text-sm">{saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</button><button type="button" onClick={() => setEditing(null)} className="btn-secondary px-4 py-2 text-sm">ยกเลิก</button></div>
          </form>
        )}
        {vehicles.length === 0 ? <p className="border border-dashed border-ink/20 p-6 text-center text-sm text-ink-soft">ยังไม่มีรายชื่อรถ เพิ่มรถเพื่อให้พนักงานเริ่มบันทึกการใช้งานได้</p> : (
          <div className="divide-y divide-ink/10 border-y border-ink/10">
            {vehicles.map((vehicle) => (
              <div key={vehicle.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0"><p className="font-semibold text-ink">{vehicle.name} <span className="font-mono text-sm font-normal text-ink-soft">· {vehicle.plate}</span></p><p className={`mt-1 text-xs ${vehicle.active === false ? 'text-ink-soft' : vehicle.activeCheckoutId ? 'text-clay' : 'text-sage'}`}>{vehicle.active === false ? 'ปิดใช้งาน' : vehicle.activeCheckoutId ? 'กำลังมีผู้ใช้งาน' : 'พร้อมใช้งาน'}</p></div>
                <div className="flex gap-3"><button type="button" onClick={() => setEditing({ id: vehicle.id, name: vehicle.name, plate: vehicle.plate })} className="text-sm font-semibold text-ink-soft underline">แก้ไข</button><button type="button" onClick={() => toggleVehicle(vehicle)} className={`text-sm font-semibold underline ${vehicle.active === false ? 'text-sage' : 'text-clay'}`}>{vehicle.active === false ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</button></div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}