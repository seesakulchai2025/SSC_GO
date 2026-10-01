import { useEffect, useRef, useState } from 'react'
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteField, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'

const GENDER_LABELS = { female: 'หญิง', male: 'ชาย' }
const EMPLOYMENT_STATUS_LABELS = { permanent: 'บรรจุ', probation: 'ทดลองงาน', intern: 'ฝึกงาน' }
const PAYROLL_FIELDS = ['baseSalary', 'employmentDeposit', 'socialSecurityDeduction', 'attendanceBonus']

function createEmployeeForm() {
  return {
    name: '',
    pin: '',
    department: '',
    role: 'employee',
    gender: '',
    employmentStatus: '',
    baseSalary: '',
    employmentDeposit: '0',
    socialSecurityDeduction: '0',
    attendanceBonus: '0',
  }
}

function splitEmployeeData(form) {
  const { baseSalary, employmentDeposit, socialSecurityDeduction, attendanceBonus, ...employee } = form
  return {
    employee,
    payroll: {
      baseSalary: Number(baseSalary) || 0,
      employmentDeposit: Number(employmentDeposit) || 0,
      socialSecurityDeduction: Number(socialSecurityDeduction) || 0,
      attendanceBonus: Number(attendanceBonus) || 0,
    },
  }
}

function PayrollFields({ form, setForm }) {
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const salaryLabel = form.employmentStatus === 'permanent' ? 'ฐานเงินเดือน/เดือน' : 'ค่าแรง/วัน'

  return (
    <section className="space-y-3 border-t border-ink/10 pt-4">
      <h3 className="font-semibold text-ink">ข้อมูลเงินเดือน</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-ink-soft">
          {salaryLabel}
          <input type="number" min="0" step="0.01" className="input-field" value={form.baseSalary} onChange={(event) => update('baseSalary', event.target.value)} placeholder="0.00" />
        </label>
        <label className="space-y-1 text-xs text-ink-soft">
          เงินประกันการทำงาน (หัก/เดือน)
          <input type="number" min="0" step="0.01" className="input-field" value={form.employmentDeposit} onChange={(event) => update('employmentDeposit', event.target.value)} placeholder="0.00" />
        </label>
        <label className="space-y-1 text-xs text-ink-soft">
          ประกันสังคม (หัก/เดือน)
          <input type="number" min="0" step="0.01" className="input-field" value={form.socialSecurityDeduction} onChange={(event) => update('socialSecurityDeduction', event.target.value)} placeholder="0.00" />
        </label>
        <label className="space-y-1 text-xs text-ink-soft sm:col-span-2">
          เบี้ยขยัน (ได้รับเมื่อสายรวมไม่เกิน 100 นาที/เดือน)
          <input type="number" min="0" step="0.01" className="input-field sm:max-w-sm" value={form.attendanceBonus} onChange={(event) => update('attendanceBonus', event.target.value)} placeholder="0.00" />
        </label>
      </div>
    </section>
  )
}

function EmploymentStatusField({ value, onChange }) {
  return (
    <label className="space-y-1 text-xs text-ink-soft">
      สถานะพนักงาน
      <select className="input-field" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">เลือกสถานะ</option>
        <option value="permanent">บรรจุ</option>
        <option value="probation">ทดลองงาน</option>
        <option value="intern">ฝึกงาน</option>
      </select>
    </label>
  )
}

function EmployeeRow({ emp, payrollProfile, leaveTypes, onSave }) {
  const [editing, setEditing] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [form, setForm] = useState({
    name: emp.name,
    pin: emp.pin,
    department: emp.department || '',
    role: emp.role,
    gender: emp.gender || '',
    employmentStatus: emp.employmentStatus || payrollProfile?.employmentStatus || '',
    baseSalary: payrollProfile?.baseSalary == null ? '' : String(payrollProfile.baseSalary),
    employmentDeposit: String(payrollProfile?.employmentDeposit ?? 0),
    socialSecurityDeduction: String(payrollProfile?.socialSecurityDeduction ?? 0),
    attendanceBonus: String(payrollProfile?.attendanceBonus ?? 0),
    active: emp.active !== false,
    balances: { ...(emp.balances || {}) },
  })

  useEffect(() => {
    if (editing) return
    setForm({
      name: emp.name,
      pin: emp.pin,
      department: emp.department || '',
      role: emp.role,
      gender: emp.gender || '',
      employmentStatus: emp.employmentStatus || payrollProfile?.employmentStatus || '',
      baseSalary: payrollProfile?.baseSalary == null ? '' : String(payrollProfile.baseSalary),
      employmentDeposit: String(payrollProfile?.employmentDeposit ?? 0),
      socialSecurityDeduction: String(payrollProfile?.socialSecurityDeduction ?? 0),
      attendanceBonus: String(payrollProfile?.attendanceBonus ?? 0),
      active: emp.active !== false,
      balances: { ...(emp.balances || {}) },
    })
  }, [emp, payrollProfile, editing])

  async function save() {
    setSaveError('')
    try {
      const saved = await onSave(emp.id, form)
      if (saved !== false) setEditing(false)
    } catch (error) {
      setSaveError(`บันทึกข้อมูลพนักงานไม่สำเร็จ (${error.code || error.message || 'unknown'})`)
    }
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
          <p className="mt-1 text-xs text-ink-soft">
            {EMPLOYMENT_STATUS_LABELS[emp.employmentStatus || payrollProfile?.employmentStatus] || 'ยังไม่ระบุสถานะ'}
            {payrollProfile?.baseSalary > 0 && ` · ${Number(payrollProfile.baseSalary).toLocaleString('th-TH')} บาท${(emp.employmentStatus || payrollProfile.employmentStatus) === 'permanent' ? '/เดือน' : '/วัน'}`}
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
        <EmploymentStatusField value={form.employmentStatus} onChange={(employmentStatus) => setForm((current) => ({ ...current, employmentStatus }))} />
      </div>
      <p className="text-xs text-ink-soft -mt-1">ระบุเพศเพื่อเปิดสิทธิ์ "ลาคลอดบุตร" ให้เฉพาะพนักงานหญิงเท่านั้น</p>

      <PayrollFields form={form} setForm={setForm} />

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

      {saveError && <p role="alert" className="text-sm text-clay">{saveError}</p>}

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
  const [payrollProfiles, setPayrollProfiles] = useState([])
  const [leaveTypes, setLeaveTypes] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [newEmp, setNewEmp] = useState(createEmployeeForm)
  const [error, setError] = useState('')
  const [payrollError, setPayrollError] = useState('')
  const [payrollProfilesLoaded, setPayrollProfilesLoaded] = useState(false)
  const migrationStarted = useRef(false)

  useEffect(() => {
    const unsubscribeEmployees = onSnapshot(collection(db, 'employees'), (snap) =>
      setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name, 'th'))),
    () => setError('โหลดข้อมูลพนักงานไม่สำเร็จ'))
    const unsubscribeLeaveTypes = onSnapshot(collection(db, 'leaveTypes'), (snap) =>
      setLeaveTypes(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
    )
    const unsubscribePayrollProfiles = onSnapshot(collection(db, 'payrollProfiles'), (snap) => {
      setPayrollProfiles(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setPayrollProfilesLoaded(true)
      setPayrollError('')
    }, (error) => {
      setPayrollProfilesLoaded(true)
      setPayrollError(`โหลดข้อมูลเงินเดือนไม่สำเร็จ (${error.code || error.message || 'unknown'}). ตรวจ Firestore Rules ที่เผยแพร่จริง`)
    })
    return () => {
      unsubscribeEmployees()
      unsubscribeLeaveTypes()
      unsubscribePayrollProfiles()
    }
  }, [])

  useEffect(() => {
    if (!payrollProfilesLoaded || migrationStarted.current) return
    const profilesById = new Map(payrollProfiles.map((profile) => [profile.id, profile]))
    const employeesToMigrate = employees.filter((employee) =>
      PAYROLL_FIELDS.some((field) => Object.hasOwn(employee, field))
      || (!employee.employmentStatus && profilesById.get(employee.id)?.employmentStatus)
    )
    if (employeesToMigrate.length === 0) return

    migrationStarted.current = true
    const batches = []
    let batch = writeBatch(db)
    let operationCount = 0
    employeesToMigrate.forEach((employee) => {
      const hasLegacyPayroll = PAYROLL_FIELDS.some((field) => Object.hasOwn(employee, field))
      if (hasLegacyPayroll && !profilesById.has(employee.id)) {
        const { payroll } = splitEmployeeData(employee)
        batch.set(doc(db, 'payrollProfiles', employee.id), payroll)
        operationCount++
      }
      const employmentStatus = employee.employmentStatus || profilesById.get(employee.id)?.employmentStatus
      batch.update(doc(db, 'employees', employee.id), {
        ...(employmentStatus ? { employmentStatus } : {}),
        ...Object.fromEntries(PAYROLL_FIELDS.map((field) => [field, deleteField()])),
      })
      operationCount++
      if (operationCount >= 450) {
        batches.push(batch.commit())
        batch = writeBatch(db)
        operationCount = 0
      }
    })
    if (operationCount > 0) batches.push(batch.commit())
    Promise.all(batches).catch((error) => {
      migrationStarted.current = false
      setPayrollError(`ย้ายข้อมูลเงินเดือนเดิมไม่สำเร็จ (${error.code || error.message || 'unknown'}). ตรวจ Firestore Rules ที่เผยแพร่จริง`)
    })
  }, [employees, payrollProfiles, payrollProfilesLoaded])

  async function saveEmployee(id, form) {
    const { employee, payroll } = splitEmployeeData(form)
    await updateDoc(doc(db, 'employees', id), employee)
    try {
      await setDoc(doc(db, 'payrollProfiles', id), payroll, { merge: true })
      setPayrollError('')
      return true
    } catch (error) {
      setPayrollError(`บันทึกข้อมูลเงินเดือนไม่สำเร็จ (${error.code || error.message || 'unknown'}). ตรวจ Firestore Rules ที่เผยแพร่จริง`)
      return false
    }
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
    const { employee, payroll } = splitEmployeeData(newEmp)
    let employeeRef
    try {
      employeeRef = await addDoc(collection(db, 'employees'), {
        ...employee,
        active: true,
        balances: {},
        createdAt: serverTimestamp(),
      })
    } catch (error) {
      setError(`บันทึกพนักงานไม่สำเร็จ (${error.code || error.message || 'unknown'}). ตรวจ Firestore Rules ที่เผยแพร่จริง`)
      return
    }
    try {
      await setDoc(doc(db, 'payrollProfiles', employeeRef.id), payroll)
      setPayrollError('')
    } catch (error) {
      setPayrollError(`บันทึกข้อมูลเงินเดือนไม่สำเร็จ (${error.code || error.message || 'unknown'}). ตรวจ Firestore Rules ที่เผยแพร่จริง`)
    }
    setNewEmp(createEmployeeForm())
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

      {payrollError && <p role="alert" className="text-sm text-clay">{payrollError}</p>}

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
            <EmploymentStatusField value={newEmp.employmentStatus} onChange={(employmentStatus) => setNewEmp((current) => ({ ...current, employmentStatus }))} />
          </div>
          <p className="text-xs text-ink-soft">ระบุเพศเพื่อเปิดสิทธิ์ "ลาคลอดบุตร" ให้เฉพาะพนักงานหญิงเท่านั้น</p>
          <PayrollFields form={newEmp} setForm={setNewEmp} />
          {error && <p className="text-clay text-sm">{error}</p>}
          <button className="btn-primary py-2 px-4 text-sm">บันทึกพนักงานใหม่</button>
        </form>
      )}

      <div className="space-y-3">
        {employees.map((emp) => (
          <EmployeeRow key={emp.id} emp={emp} payrollProfile={payrollProfiles.find((profile) => profile.id === emp.id)} leaveTypes={leaveTypes} onSave={saveEmployee} />
        ))}
      </div>
    </div>
  )
}
