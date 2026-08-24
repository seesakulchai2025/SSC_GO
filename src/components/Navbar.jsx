import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Navbar() {
  const { employee, logout } = useAuth()
  const isAdmin = employee?.role === 'admin'

  const linkCls = ({ isActive }) =>
    `px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
      isActive ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-ink/5'
    }`

  return (
    <header className="no-print sticky top-0 z-20 bg-paper/95 backdrop-blur border-b border-ink/10">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="font-display font-semibold text-ink text-lg shrink-0">ใบลา</span>
          <span className="text-ink-soft text-sm truncate hidden sm:inline">· {employee?.name}</span>
        </div>
        <nav className="flex items-center gap-1">
          <NavLink to="/" end className={linkCls}>
            หน้าหลัก
          </NavLink>
          <NavLink to="/calendar" className={linkCls}>
            ปฏิทิน
          </NavLink>
          {isAdmin && (
            <>
              <NavLink to="/admin" className={linkCls}>
                อนุมัติ
              </NavLink>
              <NavLink to="/admin/employees" className={linkCls}>
                พนักงาน
              </NavLink>
              <NavLink to="/admin/leave-types" className={linkCls}>
                ประเภทลา
              </NavLink>
              <NavLink to="/admin/statistics" className={linkCls}>
                สถิติ
              </NavLink>
            </>
          )}
          <button onClick={logout} className="px-3 py-2 text-sm font-semibold rounded-lg text-clay hover:bg-clay-light transition-colors">
            ออกจากระบบ
          </button>
        </nav>
      </div>
    </header>
  )
}
