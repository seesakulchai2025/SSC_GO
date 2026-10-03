import { useEffect, useState } from 'react'
import { collection, onSnapshot, updateDoc, doc } from 'firebase/firestore'
import { db } from '../firebase'
import { notifyError, notifySuccess } from '../components/ToastViewport'

function LeaveTypeRow({ type, onSave }) {
  const [days, setDays] = useState(String(type.defaultDays ?? 0))
  const [saving, setSaving] = useState(false)

  useEffect(() => setDays(String(type.defaultDays ?? 0)), [type.defaultDays])

  async function save() {
    const nextDays = Number(days)
    if (!Number.isFinite(nextDays) || nextDays < 0) {
      setDays(String(type.defaultDays ?? 0))
      notifyError('จำนวนวันโควตาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป')
      return
    }
    if (nextDays === Number(type.defaultDays ?? 0)) return
    setSaving(true)
    try {
      await onSave(type.id, { defaultDays: nextDays })
      notifySuccess(`บันทึกโควตา${type.name}แล้ว`)
    } catch (error) {
      notifyError(`บันทึกโควตาไม่สำเร็จ (${error.code || error.message || 'unknown'})`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card flex items-center gap-3 p-4">
      <p className="flex-1 font-display font-semibold text-ink">{type.name}</p>
      <input type="number" min={0} step={1} className="input-field w-24" value={days} disabled={saving} onChange={(event) => setDays(event.target.value)} onBlur={save} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
      <span className="shrink-0 text-xs text-ink-soft">วัน/ปี</span>
    </div>
  )
}

export default function AdminLeaveTypes() {
  const [types, setTypes] = useState([])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'leaveTypes'), (snap) =>
      setTypes(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
    )
    return unsub
  }, [])

  async function updateType(id, patch) {
    await updateDoc(doc(db, 'leaveTypes', id), patch)
  }

  return (
    <div className="page-container page-stack">
      <div className="page-section-head page-section-head--stacked">
        <h1 className="font-display text-2xl font-semibold text-ink">ประเภทการลา</h1>
        <p className="text-sm text-ink-soft">
          ระบบรองรับการลา 3 ประเภทเท่านั้น ปรับได้เฉพาะจำนวนวันโควตามาตรฐานต่อปี — โควตารายบุคคลปรับแยกได้ในหน้า "พนักงาน"
        </p>
      </div>

      <div className="space-y-3">
        {types.map((t) => (
          <LeaveTypeRow key={t.id} type={t} onSave={updateType} />
        ))}
      </div>

      <div className="card p-4 bg-brass/5 border-brass/20">
        <p className="text-sm text-ink-soft">
          <span className="font-semibold text-ink">หมายเหตุลาคลอดบุตร:</span> เนื่องจากจำนวนวันลาคลอดขึ้นกับกรณีของแต่ละคน
          ระบบจึงไม่ตั้งโควตากลางไว้ (0 วัน) — เมื่อพนักงานคนใดต้องใช้สิทธิ์ ให้เข้าไปกำหนดจำนวนวันให้คนนั้นเป็นรายบุคคลที่หน้า "พนักงาน"
        </p>
      </div>
    </div>
  )
}
