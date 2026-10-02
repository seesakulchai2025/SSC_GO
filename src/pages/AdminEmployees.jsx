import { useEffect, useRef, useState } from 'react'
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteField, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { notifyError, notifySuccess } from '../components/ToastViewport'

const GENDER_LABELS = { female: 'หญิง', male: 'ชาย' }
const EMPLOYMENT_STATUS_LABELS = { permanent: 'บรรจุ', permanent_pc: 'บรรจุ(PC)', probation: 'ทดลองงาน', intern: 'ฝึกงาน' }
const PAYROLL_FIELDS = ['baseSalary', 'employmentDeposit', 'socialSecurityDeduction', 'attendanceBonus', 'overtimeRatePerHour']

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
    overtimeRatePerHour: '0',
  }
}

function splitEmployeeData(form) {
  const { baseSalary, employmentDeposit, socialSecurityDeduction, attendanceBonus, overtimeRatePerHour, ...employee } = form
  return {
    employee,
    payroll: {
      baseSalary: Number(baseSalary) || 0,
      employmentDeposit: Number(employmentDeposit) || 0,
      socialSecurityDeduction: Number(socialSecurityDeduction) || 0,
      attendanceBonus: Number(attendanceBonus) || 0,
      overtimeRatePerHour: Number(overtimeRatePerHour) || 0,
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
          {form.employmentStatus === 'permanent_pc' ? 'ฐานเงินเดือน' : salaryLabel}
          {form.employmentStatus === 'permanent_pc'
            ? <span className="input-field block bg-ink/5 text-ink-soft">บริษัทเป็นผู้กำหนด</span>
            : <input type="number" min="0" step="0.01" className="input-field" value={form.baseSalary} onChange={(event) => update('baseSalary', event.target.value)} placeholder="0.00" />}
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
        <label className="space-y-1 text-xs text-ink-soft sm:col-span-2">
          อัตราค่า OT/ชั่วโมง
          <input type="number" min="0" step="0.01" className="input-field sm:max-w-sm" value={form.overtimeRatePerHour} onChange={(event) => update('overtimeRatePerHour', event.target.value)} placeholder="0.00" />
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
        <option value="permanent_pc">บรรจุ(PC)</option>
        <option value="probation">ทดลองงาน</option>
        <option value="intern">ฝึกงาน</option>
      </select>
    </label>
  )
}

function EmployeeRow({ emp, payrollProfile, leaveTypes, onSave, startEditing = false, onSaved }) {
  const [editing, setEditing] = useState(startEditing)
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
    overtimeRatePerHour: String(payrollProfile?.overtimeRatePerHour ?? 0),
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
      overtimeRatePerHour: String(payrollProfile?.overtimeRatePerHour ?? 0),
      active: emp.active !== false,
      balances: { ...(emp.balances || {}) },
    })
  }, [emp, payrollProfile, editing])

  async function save() {
    setSaveError('')
    try {
      const saved = await onSave(emp.id, form)
      if (saved !== false) {
        setEditing(false)
        onSaved?.()
      } else {
        setSaveError('บันทึกข้อมูลพนักงานแล้ว แต่ข้อมูลเงินเดือนบันทึกไม่สำเร็จ')
      }
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
    <div className="space-y-3">
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
  const [activeDirectory, setActiveDirectory] = useState('')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
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
      const message = `ย้ายข้อมูลเงินเดือนเดิมไม่สำเร็จ (${error.code || error.message || 'unknown'}). ตรวจ Firestore Rules ที่เผยแพร่จริง`
      setPayrollError(message)
      notifyError(message)
    })
  }, [employees, payrollProfiles, payrollProfilesLoaded])

  async function saveEmployee(id, form) {
    const { employee, payroll } = splitEmployeeData(form)
    try {
      await updateDoc(doc(db, 'employees', id), employee)
    } catch (error) {
      notifyError(`บันทึกข้อมูลพนักงานไม่สำเร็จ (${error.code || error.message || 'unknown'})`)
      throw error
    }
    try {
      await setDoc(doc(db, 'payrollProfiles', id), payroll, { merge: true })
      setPayrollError('')
      notifySuccess('บันทึกข้อมูลพนักงานและเงินเดือนเรียบร้อยแล้ว')
      return true
    } catch (error) {
      setPayrollError(`บันทึกข้อมูลเงินเดือนไม่สำเร็จ (${error.code || error.message || 'unknown'}). ตรวจ Firestore Rules ที่เผยแพร่จริง`)
      notifyError(`บันทึกข้อมูลเงินเดือนไม่สำเร็จ (${error.code || error.message || 'unknown'})`)
      return false
    }
  }

  async function addEmployee(e) {
    e.preventDefault()
    setError('')
    if (newEmp.pin.length < 4) {
      setError('PIN ต้องมีอย่างน้อย 4 หลัก')
      notifyError('PIN ต้องมีอย่างน้อย 4 หลัก')
      return
    }
    if (employees.some((emp) => emp.pin === newEmp.pin)) {
      setError('PIN นี้ถูกใช้แล้ว กรุณาเลือก PIN อื่น')
      notifyError('PIN นี้ถูกใช้แล้ว กรุณาเลือก PIN อื่น')
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
      notifyError(`บันทึกพนักงานไม่สำเร็จ (${error.code || error.message || 'unknown'})`)
      return
    }
    try {
      await setDoc(doc(db, 'payrollProfiles', employeeRef.id), payroll)
      setPayrollError('')
      notifySuccess(`เพิ่ม${employee.role === 'admin' ? 'แอดมิน' : 'พนักงาน'}เรียบร้อยแล้ว`)
    } catch (error) {
      setPayrollError(`บันทึกข้อมูลเงินเดือนไม่สำเร็จ (${error.code || error.message || 'unknown'}). ตรวจ Firestore Rules ที่เผยแพร่จริง`)
      notifyError(`สร้างพนักงานแล้ว แต่บันทึกข้อมูลเงินเดือนไม่สำเร็จ (${error.code || error.message || 'unknown'})`)
    }
    setNewEmp(createEmployeeForm())
    setSelectedEmployeeId('')
  }

  const directoryEmployees = employees.filter((employee) => activeDirectory === 'admins'
    ? employee.role === 'admin'
    : employee.role !== 'admin')
  const selectedEmployee = directoryEmployees.find((employee) => employee.id === selectedEmployeeId)

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-ink">ข้อมูลบุคลากร</h1>
        <p className="mt-1 text-sm text-ink-soft">แยกรายชื่อพนักงานและผู้ดูแลระบบ</p>
      </header>

      {payrollError && <p role="alert" className="text-sm text-clay">{payrollError}</p>}
      {error && <p role="alert" className="text-sm text-clay">{error}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => { setActiveDirectory('employees'); setSelectedEmployeeId('') }} className="flex min-h-24 items-center justify-between border-y border-ink/15 px-4 py-4 text-left hover:bg-ink/5">
          <span>
            <span className="block font-display text-lg font-semibold text-ink">พนักงาน</span>
            <span className="mt-1 block text-sm text-ink-soft">{employees.filter((employee) => employee.role !== 'admin').length} รายชื่อ</span>
          </span>
          <span aria-hidden="true" className="text-xl text-ink-soft">›</span>
        </button>
        <button type="button" onClick={() => { setActiveDirectory('admins'); setSelectedEmployeeId('') }} className="flex min-h-24 items-center justify-between border-y border-ink/15 px-4 py-4 text-left hover:bg-ink/5">
          <span>
            <span className="block font-display text-lg font-semibold text-ink">แอดมิน</span>
            <span className="mt-1 block text-sm text-ink-soft">{employees.filter((employee) => employee.role === 'admin').length} รายชื่อ</span>
          </span>
          <span aria-hidden="true" className="text-xl text-ink-soft">›</span>
        </button>
      </div>

      {activeDirectory && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-3 sm:p-6" onClick={() => setActiveDirectory('')}>
          <section role="dialog" aria-modal="true" aria-labelledby="employee-directory-title" onClick={(event) => event.stopPropagation()} className="card modal-frame w-full max-w-3xl">
            <header className="flex shrink-0 items-center justify-between border-b border-ink/10 px-5 py-4">
              <div>
                <h2 id="employee-directory-title" className="font-display text-lg font-semibold text-ink">{activeDirectory === 'admins' ? 'รายชื่อแอดมิน' : 'รายชื่อพนักงาน'}</h2>
                <p className="mt-1 text-xs text-ink-soft">{directoryEmployees.length} รายชื่อ</p>
              </div>
              <button type="button" onClick={() => setActiveDirectory('')} aria-label="ปิดรายชื่อ" className="px-2 text-xl text-ink-soft">×</button>
            </header>
            <div className="overflow-hidden">
              <div className={`flex w-[200%] transition-transform duration-300 ease-out ${selectedEmployeeId ? '-translate-x-1/2' : 'translate-x-0'}`}>
                <section className="max-h-[72vh] w-1/2 shrink-0 overflow-y-auto px-5 py-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-ink">{activeDirectory === 'admins' ? 'ผู้ดูแลระบบ' : 'พนักงานทั้งหมด'}</p>
                    <button type="button" className="btn-primary px-3 py-2 text-sm" onClick={() => {
                      setError('')
                      setNewEmp({ ...createEmployeeForm(), role: activeDirectory === 'admins' ? 'admin' : 'employee' })
                      setSelectedEmployeeId('__new__')
                    }}>
                      เพิ่ม{activeDirectory === 'admins' ? 'แอดมิน' : 'พนักงาน'}
                    </button>
                  </div>
                  {directoryEmployees.length === 0 ? <p className="py-8 text-center text-sm text-ink-soft">ยังไม่มีรายชื่อ</p> : (
                    <div className="divide-y divide-ink/10">
                      {directoryEmployees.map((person) => (
                        <button key={person.id} type="button" onClick={() => setSelectedEmployeeId(person.id)} className="flex min-h-16 w-full items-center justify-between gap-3 py-3 text-left hover:bg-ink/5">
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-ink">{person.name}</span>
                            <span className="mt-0.5 block truncate text-xs text-ink-soft">{person.department || 'ไม่ระบุแผนก'}{person.active === false ? ' · ระงับใช้งาน' : ''}</span>
                          </span>
                          <span aria-hidden="true" className="shrink-0 text-xl text-ink-soft">›</span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
                <section className="max-h-[72vh] w-1/2 shrink-0 overflow-y-auto px-5 py-4">
                  <button type="button" onClick={() => setSelectedEmployeeId('')} className="mb-4 text-sm font-semibold text-ink-soft hover:text-ink">‹ กลับรายชื่อ</button>
                  {selectedEmployeeId === '__new__' ? (
                    <form onSubmit={addEmployee} className="space-y-4">
                      <h3 className="font-display text-lg font-semibold text-ink">เพิ่ม{activeDirectory === 'admins' ? 'แอดมิน' : 'พนักงาน'}</h3>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <input required className="input-field" placeholder="ชื่อ-นามสกุล" value={newEmp.name} onChange={(event) => setNewEmp((current) => ({ ...current, name: event.target.value }))} />
                        <input required className="input-field font-mono" placeholder="PIN (4-6 หลัก)" value={newEmp.pin} onChange={(event) => setNewEmp((current) => ({ ...current, pin: event.target.value.replace(/\D/g, '') }))} />
                        <input className="input-field" placeholder="แผนก" value={newEmp.department} onChange={(event) => setNewEmp((current) => ({ ...current, department: event.target.value }))} />
                        <select className="input-field" value={newEmp.gender} onChange={(event) => setNewEmp((current) => ({ ...current, gender: event.target.value }))}>
                          <option value="">ไม่ระบุเพศ</option>
                          <option value="female">หญิง</option>
                          <option value="male">ชาย</option>
                        </select>
                        <EmploymentStatusField value={newEmp.employmentStatus} onChange={(employmentStatus) => setNewEmp((current) => ({ ...current, employmentStatus }))} />
                      </div>
                      <PayrollFields form={newEmp} setForm={setNewEmp} />
                      {error && <p role="alert" className="text-sm text-clay">{error}</p>}
                      <button className="btn-primary px-4 py-2 text-sm">บันทึก</button>
                    </form>
                  ) : selectedEmployee ? (
                    <EmployeeRow
                      key={selectedEmployee.id}
                      emp={selectedEmployee}
                      payrollProfile={payrollProfiles.find((profile) => profile.id === selectedEmployee.id)}
                      leaveTypes={leaveTypes}
                      onSave={saveEmployee}
                      startEditing
                      onSaved={() => setSelectedEmployeeId('')}
                    />
                  ) : <p className="py-8 text-center text-sm text-ink-soft">เลือกรายชื่อเพื่อแก้ไขข้อมูล</p>}
                </section>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
