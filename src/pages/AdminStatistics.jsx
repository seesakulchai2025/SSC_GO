import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import LeaveBalanceCard from '../components/LeaveBalanceCard'
import { filterVisibleLeaveTypes } from '../utils/leaveTypeAccess'

export default function AdminStatistics() {
  const [employees, setEmployees] = useState([])
  const [leaveTypes, setLeaveTypes] = useState([])
  const [requests, setRequests] = useState([])

  useEffect(() => {
    const unsub1 = onSnapshot(query(collection(db, 'employees'), where('payrollProfileReady', '==', true)), (snap) =>
      setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name, 'th')))
    )
    const unsub2 = onSnapshot(collection(db, 'leaveTypes'), (snap) =>
      setLeaveTypes(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
    )
    const unsub3 = onSnapshot(collection(db, 'leaveRequests'), (snap) =>
      setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    )
    return () => {
      unsub1()
      unsub2()
      unsub3()
    }
  }, [])

  const currentYear = new Date().getFullYear()

  function usedFor(employeeId, typeId) {
    return requests
      .filter(
        (r) =>
          r.employeeId === employeeId &&
          r.leaveTypeId === typeId &&
          r.status === 'approved' &&
          new Date(r.startDate).getFullYear() === currentYear
      )
      .reduce((sum, r) => sum + r.days, 0)
  }

  const activeEmployees = employees.filter((e) => e.active !== false)

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">สถิติการลารายบุคคล</h1>
        <p className="text-sm text-ink-soft mt-1">จำนวนวันลาคงเหลือของพนักงานแต่ละคน แยกตามประเภทการลา (ปี พ.ศ. {currentYear + 543})</p>
      </div>

      {activeEmployees.length === 0 && <p className="text-ink-soft text-sm py-6 text-center">ยังไม่มีพนักงานในระบบ</p>}

      <div className="space-y-6">
        {activeEmployees.map((emp) => (
          <div key={emp.id} className="card p-4">
            <p className="font-display font-semibold text-ink mb-3">
              {emp.name} <span className="text-ink-soft font-normal text-sm">· {emp.department}</span>
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filterVisibleLeaveTypes(emp, leaveTypes).map((t) => {
                const quota = emp.balances?.[t.id] ?? t.defaultDays ?? 0
                const used = usedFor(emp.id, t.id)
                return <LeaveBalanceCard key={t.id} leaveType={t} used={used} quota={quota} />
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
