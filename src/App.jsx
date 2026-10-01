import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { HolidaysProvider } from './context/HolidaysContext'
import PinLogin from './components/PinLogin'
import Navbar from './components/Navbar'
import EmployeeDashboard from './pages/EmployeeDashboard'
import AdminDashboard from './pages/AdminDashboard'
import AdminEmployees from './pages/AdminEmployees'
import AdminLeaveTypes from './pages/AdminLeaveTypes'
import AdminStatistics from './pages/AdminStatistics'
import AdminAddLeave from './pages/AdminAddLeave'
import AdminPayroll from './pages/AdminPayroll'
import AdminHolidays from './pages/AdminHolidays'
import AdminReportCenter from './pages/AdminReportCenter'
import TeamCalendar from './pages/TeamCalendar'
import PrintLeaveForm from './pages/PrintLeaveForm'
import Attendance from './pages/Attendance'
import { missingFirebaseConfig } from './firebase'

function RequireAdmin({ children }) {
  const { employee } = useAuth()
  if (employee.role !== 'admin') return <Navigate to="/" replace />
  return children
}

function Shell() {
  const { employee, loading, needsSetup, initError } = useAuth()

  if (initError) {
    return (
      <main className="min-h-screen bg-paper px-4 py-12 text-ink">
        <section className="card mx-auto max-w-xl p-6 sm:p-8">
          <p className="font-mono text-xs uppercase text-brass-dark">การตั้งค่าระบบ</p>
          <h1 className="mt-2 font-display text-2xl font-semibold">เชื่อมต่อ Firebase ไม่สำเร็จ</h1>
          <p className="mt-3 text-sm text-ink-soft">{initError}</p>
          <p className="mt-4 text-sm text-ink-soft">ตรวจสอบค่า Firebase ในไฟล์ .env แล้วหยุดและเริ่ม dev server ใหม่ หรืออัปเดต Environment variables ของเว็บไซต์ที่ deploy</p>
        </section>
      </main>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <p className="text-ink-soft font-mono text-sm">กำลังโหลด...</p>
      </div>
    )
  }

  if (needsSetup || !employee) {
    return <PinLogin />
  }

  return (
    <BrowserRouter>
      <Navbar />
      <div className="lg:pl-64 print:pl-0">
        <Routes>
          <Route path="/" element={<EmployeeDashboard />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route
            path="/calendar"
            element={
              <RequireAdmin>
                <TeamCalendar />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <AdminDashboard />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/add-leave"
            element={
              <RequireAdmin>
                <AdminAddLeave />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/payroll"
            element={
              <RequireAdmin>
                <AdminPayroll />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/employees"
            element={
              <RequireAdmin>
                <AdminEmployees />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/leave-types"
            element={
              <RequireAdmin>
                <AdminLeaveTypes />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/holidays"
            element={
              <RequireAdmin>
                <AdminHolidays />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/reports"
            element={
              <RequireAdmin>
                <AdminReportCenter />
              </RequireAdmin>
            }
          />
          <Route path="/admin/statistics" element={<Navigate to="/admin/reports?view=statistics" replace />} />
          <Route path="/print/:id" element={<PrintLeaveForm />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default function App() {
  if (missingFirebaseConfig.length > 0) {
    return (
      <main className="min-h-screen bg-paper px-4 py-12 text-ink">
        <section className="card mx-auto max-w-xl p-6 sm:p-8">
          <p className="font-mono text-xs uppercase text-brass-dark">ตั้งค่าก่อนเริ่มใช้งาน</p>
          <h1 className="mt-2 font-display text-2xl font-semibold">ยังไม่ได้ตั้งค่า Firebase</h1>
          <p className="mt-3 text-sm text-ink-soft">สร้างไฟล์ .env จาก .env.example แล้วใส่ค่าจาก Firebase Project settings:</p>
          <ul className="mt-3 list-inside list-disc space-y-1 font-mono text-sm">
            {missingFirebaseConfig.map((key) => <li key={key}>{key}</li>)}
          </ul>
          <p className="mt-4 text-sm text-ink-soft">บันทึกไฟล์แล้วเริ่ม dev server ใหม่ ส่วนเว็บไซต์ที่ deploy ให้เพิ่มค่าเดียวกันใน Environment variables แล้ว deploy อีกครั้ง</p>
        </section>
      </main>
    )
  }

  return (
    <AuthProvider>
      <HolidaysProvider>
        <Shell />
      </HolidaysProvider>
    </AuthProvider>
  )
}
