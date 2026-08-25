import { useEffect, useState } from 'react'
import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

const GENDER_LABELS = { female: 'หญิง', male: 'ชาย' }

function EmployeeRow({ emp, leaveTypes, onSave }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    name: emp.name,
    pin: emp.pin,
    department: emp.department || '',
    role: emp.role,
    gender: emp.gender || '',
    active: emp.active !== false,
    balances: { ...(emp.balances || {}) },
  })

  async function save() {
    await onSave(emp.id, form)
    setEditing(false)
  }

  if (!editing) {
    return (
      <div className="card p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-ink">
            {emp.name} <span className="text-ink-soft font-normal text-sm">· {emp.department}</span>
            {emp.role === 'admin' && <span className="ml-2 text-xs stamp-pending">แอดมิน</span>}
            {emp.active === false && <span className="ml-2 text-xs text-clay font-semibold">ระงับใช้งาน</span>}
          </p>
          <p className="text-xs text-ink-soft font-mono">
            PIN: {emp.pin} {emp.gender && `· ${GENDER_LABELS[emp.gender] || emp.gender}`}
          </p>
        </div>
        <button onClick={() => setEditing(true)} className="btn-secondary py-2 px-4 text-sm">
          แก้ไข
        </button>
      </div>
    )
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input className="input-field" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="ชื่อ" />
        <input className="input-field font-mono" value={form.pin} onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, '') }))} placeholder="PIN" />
        <input className="input-field" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} placeholder="แผนก" />
        <select className="input-field" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
          <option value="employee">พนักงาน</option>
          <option value="admin">แอดมิน</option>
        </select>
        <select className="input-field" value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}>
          <option value="">ไม่ระบุเพศ</option>
          <option value="female">หญิง</option>
          <option value="male">ชาย</option>
        </select>
      </div>
      <p className="text-xs text-ink-soft -mt-1">ระบุเพศเพื่อเปิดสิทธิ์ "ลาคลอดบุตร" ให้เฉพาะพนักงานหญิงเท่านั้น</p>

      <div>
        <p className="text-sm text-ink-soft mb-2">โควตาวันลาต่อปี (เว้นว่าง = ใช้ค่าเริ่มต้น)</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {leaveTypes.map((t) => (
            <div key={t.id}>
              <label className="text-xs text-ink-soft">{t.name}</label>
              <input
                type="number"
                min={0}
                className="input-field py-1.5"
                placeholder={String(t.defaultDays ?? 0)}
                value={form.balances[t.id] ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    balances: { ...f.balances, [t.id]: e.target.value === '' ? undefined : Number(e.target.value) },
                  }))
                }
              />
            </div>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink-soft">
        <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
        เปิดใช้งานบัญชีนี้
      </label>

      <div className="flex gap-2">
        <button onClick={save} className="btn-primary py-2 px-4 text-sm">
          บันทึก
        </button>
        <button onClick={() => setEditing(false)} className="btn-secondary py-2 px-4 text-sm">
          ยกเลิก
        </button>
      </div>
    </div>
  )
}

export default function AdminEmployees() {
  const [employees, setEmployees] = useState([])
  const [leaveTypes, setLeaveTypes] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [newEmp, setNewEmp] = useState({ name: '', pin: '', department: '', role: 'employee', gender: '' })
  const [error, setError] = useState('')

  useEffect(() => {
    const unsub1 = onSnapshot(collection(db, 'employees'), (snap) =>
      setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name, 'th')))
    )
    const unsub2 = onSnapshot(collection(db, 'leaveTypes'), (snap) =>
      setLeaveTypes(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
    )
    return () => {
      unsub1()
      unsub2()
    }
  }, [])

  async function saveEmployee(id, form) {
    await updateDoc(doc(db, 'employees', id), form)
  }

  async function addEmployee(e) {
    e.preventDefault()
    setError('')
    if (newEmp.pin.length < 4) {
      setError('PIN ต้องมีอย่างน้อย 4 หลัก')
      return
    }
    if (employees.some((emp) => emp.pin === newEmp.pin)) {
      setError('PIN นี้ถูกใช้แล้ว กรุณาเลือก PIN อื่น')
      return
    }
    await addDoc(collection(db, 'employees'), {
      ...newEmp,
      active: true,
      balances: {},
      createdAt: serverTimestamp(),
    })
    setNewEmp({ name: '', pin: '', department: '', role: 'employee', gender: '' })
    setShowAdd(false)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">พนักงาน</h1>
        <button onClick={() => setShowAdd((s) => !s)} className="btn-primary py-2 px-4 text-sm">
          + เพิ่มพนักงาน
        </button>
      </div>

      {showAdd && (
        <form onSubmit={addEmployee} className="card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input required className="input-field" placeholder="ชื่อ-นามสกุล" value={newEmp.name} onChange={(e) => setNewEmp((f) => ({ ...f, name: e.target.value }))} />
            <input required className="input-field font-mono" placeholder="PIN (4-6 หลัก)" value={newEmp.pin} onChange={(e) => setNewEmp((f) => ({ ...f, pin: e.target.value.replace(/\D/g, '') }))} />
            <input className="input-field" placeholder="แผนก" value={newEmp.department} onChange={(e) => setNewEmp((f) => ({ ...f, department: e.target.value }))} />
            <select className="input-field" value={newEmp.role} onChange={(e) => setNewEmp((f) => ({ ...f, role: e.target.value }))}>
              <option value="employee">พนักงาน</option>
              <option value="admin">แอดมิน</option>
            </select>
            <select className="input-field" value={newEmp.gender} onChange={(e) => setNewEmp((f) => ({ ...f, gender: e.target.value }))}>
              <option value="">ไม่ระบุเพศ</option>
              <option value="female">หญิง</option>
              <option value="male">ชาย</option>
            </select>
          </div>
          <p className="text-xs text-ink-soft">ระบุเพศเพื่อเปิดสิทธิ์ "ลาคลอดบุตร" ให้เฉพาะพนักงานหญิงเท่านั้น</p>
          {error && <p className="text-clay text-sm">{error}</p>}
          <button className="btn-primary py-2 px-4 text-sm">บันทึกพนักงานใหม่</button>
        </form>
      )}

      <div className="space-y-3">
        {employees.map((emp) => (
          <EmployeeRow key={emp.id} emp={emp} leaveTypes={leaveTypes} onSave={saveEmployee} />
        ))}
      </div>
    </div>
  )
}
