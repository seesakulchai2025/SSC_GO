import { useEffect, useState } from 'react'
import { addDoc, collection, doc, onSnapshot, runTransaction, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { notifyError, notifySuccess } from '../components/ToastViewport'
import { formatDateDMY } from '../utils/dateUtils'
import MobileSheetSection, { MobileInfo, MobileList } from '../components/MobileSheetSection'

function explainError(action, error) {
  if (error.code === 'permission-denied' || error.message?.includes('Missing or insufficient permissions')) {
    return `${action}ไม่สำเร็จ: Firestore ยังไม่อนุญาต collection รถ ให้ Publish firestore.rules ใน Firebase Console หรือรัน npm run deploy:firestore หลังติดตั้ง Firebase CLI และเข้าสู่ระบบ`
  }
  return `${action}ไม่สำเร็จ (${error.message || 'unknown'})`
}

function getVehicleNameParts(vehicle) {
  const legacyParts = (vehicle.name || '').trim().split(/\s+/).filter(Boolean)
  const brand = vehicle.brand?.trim() || legacyParts.shift() || ''
  if (vehicle.brand && legacyParts[0] === brand) legacyParts.shift()
  const model = vehicle.model?.trim() || legacyParts.join(' ')
  return { brand, model }
}

function getInsuranceStatus(value) {
  if (!value) return { label: 'ประกัน: ไม่ระบุ', className: 'text-ink-soft', icon: null }
  const expiry = new Date(`${value}T00:00:00`)
  if (Number.isNaN(expiry.getTime())) return { label: 'ประกัน: ไม่ระบุ', className: 'text-ink-soft', icon: null }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const daysRemaining = Math.ceil((expiry.getTime() - today.getTime()) / 86400000)
  if (daysRemaining < 0) return { label: `ประกันหมดอายุ ${formatDateDMY(value)}`, className: 'text-clay', icon: '!' }
  if (daysRemaining < 30) return { label: `ประกันหมดอายุ ${formatDateDMY(value)} · เหลือ ${daysRemaining} วัน`, className: 'text-pending', icon: '!' }
  return { label: `ประกันหมดอายุ ${formatDateDMY(value)}`, className: 'text-ink-soft', icon: null }
}

function SummaryChip({ label, count, tone }) {
  const tones = {
    neutral: 'border-ink/10 bg-white text-ink',
    ready: 'border-sage/20 bg-sage-light text-sage',
    inUse: 'border-pending/20 bg-pending-light text-pending',
    inactive: 'border-ink/10 bg-ink/5 text-ink-soft',
  }
  return <span className={`inline-flex min-h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold ${tones[tone]}`}><span>{label}</span><span className="font-mono">{count}</span></span>
}

export default function AdminVehicles() {
  const [vehicles, setVehicles] = useState([])
  const [maxHours, setMaxHours] = useState(8)
  const [savedMaxHours, setSavedMaxHours] = useState(8)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [plateError, setPlateError] = useState('')

  useEffect(() => {
    const stopVehicles = onSnapshot(collection(db, 'vehicles'), (snapshot) => {
      setVehicles(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'th')))
    }, (error) => notifyError(`โหลดรายชื่อรถไม่สำเร็จ (${error.message})`))
    const stopSettings = onSnapshot(doc(db, 'systemSettings', 'vehicleLog'), (snapshot) => {
      if (snapshot.exists()) {
        const value = Number(snapshot.data().maxCheckoutHours) || 8
        setMaxHours(value)
        setSavedMaxHours(value)
      }
    }, (error) => notifyError(`โหลดการตั้งค่าไม่สำเร็จ (${error.message})`))
    return () => { stopVehicles(); stopSettings() }
  }, [])

  async function saveVehicle(event) {
    event.preventDefault()
    const brand = editing.brand.trim()
    const model = editing.model.trim()
    const name = [brand, model].filter(Boolean).join(' ')
    const plate = editing.plate.trim()
    const insuranceExpiry = editing.insuranceExpiry || null
    if (!brand || !plate) return
    if (vehicles.some((item) => item.id !== editing.id && item.plate.toLocaleLowerCase() === plate.toLocaleLowerCase())) {
      setPlateError('เลขทะเบียนนี้มีอยู่ในระบบแล้ว')
      notifyError('เลขทะเบียนนี้มีอยู่ในระบบแล้ว')
      return
    }
    setSaving(true)
    try {
      if (editing.id) {
        await updateDoc(doc(db, 'vehicles', editing.id), { name, brand, model, plate, insuranceExpiry, updatedAt: serverTimestamp() })
        notifySuccess('แก้ไขข้อมูลรถเรียบร้อยแล้ว')
      } else {
        await addDoc(collection(db, 'vehicles'), { name, brand, model, plate, insuranceExpiry, active: true, activeCheckoutId: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
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
    setSavingSettings(true)
    try {
      await setDoc(doc(db, 'systemSettings', 'vehicleLog'), { maxCheckoutHours: value, updatedAt: serverTimestamp() }, { merge: true })
      setSavedMaxHours(value)
      notifySuccess('บันทึกเวลาคืนรถสูงสุดแล้ว')
    } catch (error) {
      notifyError(explainError('บันทึกการตั้งค่า', error))
    } finally {
      setSavingSettings(false)
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

  const activeVehicles = vehicles.filter((vehicle) => vehicle.active !== false)
  const inactiveVehicles = vehicles.filter((vehicle) => vehicle.active === false)
  const readyCount = activeVehicles.filter((vehicle) => !vehicle.activeCheckoutId).length
  const inUseCount = activeVehicles.length - readyCount
  const maxHoursChanged = Number(maxHours) !== savedMaxHours

  function openEditor(vehicle = null) {
    setPlateError('')
    setEditing(vehicle
      ? { id: vehicle.id, ...getVehicleNameParts(vehicle), plate: vehicle.plate, insuranceExpiry: vehicle.insuranceExpiry || '' }
      : { id: null, brand: '', model: '', plate: '', insuranceExpiry: '' })
  }

  function renderVehicleCard(vehicle) {
    const { brand, model } = getVehicleNameParts(vehicle)
    const inactive = vehicle.active === false
    const inUse = !inactive && Boolean(vehicle.activeCheckoutId)
    const insurance = getInsuranceStatus(vehicle.insuranceExpiry)
    const status = inactive
      ? { label: 'ปิดใช้งาน', className: 'bg-ink/5 text-ink-soft' }
      : inUse
        ? { label: 'ใช้งานอยู่', className: 'bg-pending-light text-pending' }
        : { label: 'พร้อมใช้งาน', className: 'bg-sage-light text-sage' }

    return (
      <article key={vehicle.id} className={`card flex min-w-0 flex-col justify-between gap-2 rounded-2xl p-3 sm:min-h-40 sm:gap-4 sm:p-5 ${inactive ? 'opacity-65' : ''}`}>
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-words font-display text-base font-bold text-ink">{brand || '-'}</p>
            <p className="mt-0.5 break-words text-sm text-ink-soft">{model || 'ไม่ระบุรุ่น'}</p>
            <span className="mt-2 inline-flex max-w-full items-center rounded-md border border-ink/10 bg-paper px-2 py-1 font-mono text-xs text-ink">ทะเบียน {vehicle.plate || '-'}</span>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
        </div>

        <div className="flex min-w-0 flex-wrap items-end justify-between gap-3 border-t border-ink/5 pt-3">
          <p className={`flex min-w-0 items-start gap-1.5 text-xs ${insurance.className}`}>
            {insurance.icon && <span aria-hidden="true" className="font-bold">{insurance.icon}</span>}
            <span className="break-words">{insurance.label}</span>
          </p>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => openEditor(vehicle)} aria-label={`แก้ไข ${vehicle.name}`} title="แก้ไขรถ" className="grid size-10 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline">
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
            </button>
            {!inactive ? (
              <details className="relative">
                <summary aria-label={`เมนูจัดการ ${vehicle.name}`} title="เมนูจัดการรถ" className="grid size-10 cursor-pointer list-none place-items-center rounded-lg text-xl leading-none text-ink-soft hover:bg-ink/5 focus-visible:outline">
                  <span aria-hidden="true">···</span>
                </summary>
                <div className="absolute right-0 top-full z-10 mt-1 min-w-36 rounded-xl border border-ink/10 bg-white p-1 shadow-stamp">
                  <button type="button" onClick={() => { if (confirm(`ยืนยันปิดใช้งานรถ ${vehicle.name} (${vehicle.plate}) ใช่หรือไม่?`)) toggleVehicle(vehicle) }} className="min-h-11 w-full rounded-lg px-3 text-left text-sm font-semibold text-clay hover:bg-clay-light">ปิดใช้งาน</button>
                </div>
              </details>
            ) : (
              <button type="button" onClick={() => toggleVehicle(vehicle)} className="btn-secondary min-h-10 px-3 py-2 text-xs">เปิดใช้งานอีกครั้ง</button>
            )}
          </div>
        </div>
      </article>
    )
  }

  return (
    <main className="page-container page-stack">
      <header className="page-section-head page-section-head--stacked border-b border-ink/10 pb-2 sm:pb-4">
        <p className="hidden font-mono text-[10px] uppercase text-ink-soft sm:block">Fleet settings</p>
        <div className="flex items-center gap-1">
          <h1 className="font-display text-lg font-semibold text-ink sm:text-2xl">จัดการรถบริษัท</h1>
          <span className="sm:hidden">
            <MobileInfo title="จัดการรถบริษัท">
              <p className="text-sm text-ink-soft">จัดการข้อมูลรถ สถานะการใช้งาน และกำหนดเวลาคืนสูงสุด</p>
            </MobileInfo>
          </span>
        </div>
        <p className="mt-1 hidden text-sm text-ink-soft sm:block">จัดการข้อมูลรถ สถานะการใช้งาน และกำหนดเวลาคืนสูงสุด</p>
      </header>

      <section aria-label="สรุปสถานะรถ" className="flex flex-wrap gap-2">
        <SummaryChip label="ทั้งหมด" count={vehicles.length} tone="neutral" />
        <SummaryChip label="พร้อมใช้งาน" count={readyCount} tone="ready" />
        <SummaryChip label="ใช้งานอยู่" count={inUseCount} tone="inUse" />
        <SummaryChip label="ปิดใช้งาน" count={inactiveVehicles.length} tone="inactive" />
      </section>

      <MobileSheetSection title="ตั้งค่าเวลาคืนรถ" summary={`${savedMaxHours} ชม.`}>
      <form onSubmit={saveMaxHours} className="card page-card min-w-0 space-y-3 rounded-2xl">
        <div>
          <h2 className="sheet-dup-title font-display text-base font-semibold text-ink">ตั้งค่าเวลาคืนรถ</h2>
          <p className="mt-0.5 text-xs text-ink-soft">ใช้กำหนดเวลาเกินกำหนดและเวลาคืนที่คำนวณจากเวลาเบิก</p>
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:max-w-lg sm:gap-3">
          <label className="mt-3 block max-w-xs text-xs font-medium text-ink-soft">
            เวลาคืนสูงสุด
            <span className="relative mt-1 block">
              <input type="number" min="0.25" max="168" step="0.25" value={maxHours} onChange={(event) => setMaxHours(event.target.value)} className="input-field pr-20" required />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-soft">ชั่วโมง</span>
            </span>
          </label>
          <button type="submit" disabled={!maxHoursChanged || savingSettings} className="btn-primary px-3 py-2 text-xs sm:px-4 sm:text-sm">
            {savingSettings ? 'กำลังบันทึก...' : maxHoursChanged ? 'บันทึก' : 'บันทึกแล้ว'}
          </button>
        </div>
      </form>
      </MobileSheetSection>

      <section aria-labelledby="vehicles-list-title">
        <div className="page-section-head mb-3 items-center">
          <h2 id="vehicles-list-title" className="font-display text-lg font-semibold text-ink">รายชื่อรถ ({vehicles.length})</h2>
          <button type="button" onClick={() => openEditor()} className="btn-primary min-h-11 px-4 py-2 text-sm">+ เพิ่มรถ</button>
        </div>
        {vehicles.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-ink/20 p-6 text-center text-sm text-ink-soft">ยังไม่มีรายชื่อรถ เพิ่มรถเพื่อให้พนักงานเริ่มบันทึกการใช้งานได้</p>
        ) : (
          <MobileList items={activeVehicles} limit={3} title="รถที่ใช้งานทั้งหมด" className="card-grid" renderItem={renderVehicleCard} />
        )}

        {inactiveVehicles.length > 0 && (
          <MobileSheetSection title={`รถที่ปิดใช้งาน (${inactiveVehicles.length})`} triggerClassName="mt-3">
            <section className="mt-6 max-sm:mt-0" aria-labelledby="inactive-vehicles-title">
              <h3 id="inactive-vehicles-title" className="sheet-dup-title mb-3 font-display text-base font-semibold text-ink-soft">รถที่ปิดใช้งาน ({inactiveVehicles.length})</h3>
              <div className="card-grid">
                {inactiveVehicles.map(renderVehicleCard)}
              </div>
            </section>
          </MobileSheetSection>
        )}
      </section>

      {editing && (
        <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-6" onClick={() => setEditing(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="vehicle-editor-title" onClick={(event) => event.stopPropagation()} className="vehicle-editor-modal card modal-frame w-full max-w-lg rounded-b-none sm:rounded-2xl">
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-ink/10 px-4 py-4 sm:px-6">
              <div>
                <h2 id="vehicle-editor-title" className="font-display text-lg font-semibold text-ink">{editing.id ? 'แก้ไขข้อมูลรถ' : 'เพิ่มรถ'}</h2>
                <p className="mt-0.5 text-xs text-ink-soft">กรอกข้อมูลรถและวันหมดอายุประกัน</p>
              </div>
              <button type="button" onClick={() => setEditing(null)} aria-label="ปิดฟอร์มรถ" className="grid size-11 shrink-0 place-items-center rounded-lg text-xl text-ink-soft hover:bg-ink/5">×</button>
            </header>
            <form onSubmit={saveVehicle} className="modal-scroll grid min-w-0 content-start gap-4 p-4 sm:grid-cols-2 sm:gap-3 sm:p-6">
              <label className="min-w-0 text-sm font-medium text-ink">ยี่ห้อ
                <input value={editing.brand} onChange={(event) => setEditing({ ...editing, brand: event.target.value })} className="input-field mt-1" placeholder="เช่น TOYOTA" required />
              </label>
              <label className="min-w-0 text-sm font-medium text-ink">รุ่น
                <input value={editing.model} onChange={(event) => setEditing({ ...editing, model: event.target.value })} className="input-field mt-1" placeholder="เช่น VIGO" />
              </label>
              <label className="min-w-0 text-sm font-medium text-ink sm:col-span-2">เลขทะเบียน
                <input value={editing.plate} onChange={(event) => { setEditing({ ...editing, plate: event.target.value }); setPlateError('') }} className="input-field mt-1" placeholder="เช่น กข 1234" aria-invalid={Boolean(plateError)} aria-describedby={plateError ? 'vehicle-plate-error' : undefined} required />
                {plateError && <span id="vehicle-plate-error" role="alert" className="mt-1 block text-xs font-normal text-clay">{plateError}</span>}
              </label>
              <label className="min-w-0 text-sm font-medium text-ink sm:col-span-2">วันที่ประกันหมดอายุ (ไม่บังคับ)
                <input type="date" value={editing.insuranceExpiry || ''} onChange={(event) => setEditing({ ...editing, insuranceExpiry: event.target.value })} className="input-field mt-1" />
              </label>
              <footer className="flex flex-col-reverse gap-2 border-t border-ink/10 pt-4 sm:col-span-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setEditing(null)} className="btn-secondary px-4 py-2 text-sm">ยกเลิก</button>
                <button disabled={saving} className="btn-primary px-4 py-2 text-sm">{saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}