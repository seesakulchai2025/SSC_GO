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
import AdminHolidays from './pages/AdminHolidays'
import AdminReports from './pages/AdminReports'
import TeamCalendar from './pages/TeamCalendar'
import PrintLeaveForm from './pages/PrintLeaveForm'

function RequireAdmin({ children }) {
  const { employee } = useAuth()
  if (employee.role !== 'admin') return <Navigate to="/" replace />
  return children
}

function Shell() {
  const { employee, loading, needsSetup } = useAuth()

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
      <Routes>
        <Route path="/" element={<EmployeeDashboard />} />
        <Route path="/calendar" element={<TeamCalendar />} />
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
              <AdminReports />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/statistics"
          element={
            <RequireAdmin>
              <AdminStatistics />
            </RequireAdmin>
          }
        />
        <Route path="/print/:id" element={<PrintLeaveForm />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <HolidaysProvider>
        <Shell />
      </HolidaysProvider>
    </AuthProvider>
  )
}
