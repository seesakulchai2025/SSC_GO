import { useEffect, useState } from 'react'
import { collection, onSnapshot, updateDoc, doc } from 'firebase/firestore'
import { db } from '../firebase'

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
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <h1 className="font-display text-2xl font-semibold text-ink">ประเภทการลา</h1>
      <p className="text-sm text-ink-soft -mt-4">
        ระบบรองรับการลา 3 ประเภทเท่านั้น ปรับได้เฉพาะจำนวนวันโควตามาตรฐานต่อปี — โควตารายบุคคลปรับแยกได้ในหน้า "พนักงาน"
      </p>

      <div className="space-y-3">
        {types.map((t) => (
          <div key={t.id} className="card p-4 flex items-center gap-3">
            <p className="font-display font-semibold text-ink flex-1">{t.name}</p>
            <input
              type="number"
              min={0}
              className="input-field w-24"
              value={t.defaultDays ?? 0}
              onChange={(e) => updateType(t.id, { defaultDays: Number(e.target.value) })}
            />
            <span className="text-xs text-ink-soft shrink-0">วัน/ปี</span>
          </div>
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
