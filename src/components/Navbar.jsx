import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLeaveNotifications } from '../hooks/useLeaveNotifications'
import { useAdminPendingCount } from '../hooks/useAdminPendingCount'
import ProfileModal from './ProfileModal'

export default function Navbar() {
  const { employee, logout } = useAuth()
  const isAdmin = employee?.role === 'admin'
  const [showProfile, setShowProfile] = useState(false)
  const { unseenCount, markAllSeen } = useLeaveNotifications(employee?.id)
  const pendingCount = useAdminPendingCount(isAdmin)

  const linkCls = ({ isActive }) =>
    `px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
      isActive ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-ink/5'
    }`

  return (
    <>
      <header className="no-print sticky top-0 z-20 bg-paper/95 backdrop-blur border-b border-ink/10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="font-display font-semibold text-ink text-lg shrink-0">ใบลา</span>
            <button onClick={() => setShowProfile(true)} className="text-ink-soft text-sm truncate hidden sm:inline underline decoration-dotted">
              · {employee?.name}
            </button>
          </div>
          <nav className="flex items-center gap-1 flex-wrap justify-end">
            <NavLink to="/" end className={linkCls} onClick={markAllSeen}>
              <span className="relative inline-block">
                หน้าหลัก
                {unseenCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 w-4 h-4 rounded-full bg-clay text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {unseenCount > 9 ? '9+' : unseenCount}
                  </span>
                )}
              </span>
            </NavLink>
            <NavLink to="/calendar" className={linkCls}>
              ปฏิทิน
            </NavLink>
            <button onClick={() => setShowProfile(true)} className="px-3 py-2 text-sm font-semibold rounded-lg text-ink-soft hover:bg-ink/5 transition-colors sm:hidden">
              ข้อมูลของฉัน
            </button>
            {isAdmin && (
              <>
                <NavLink to="/admin" className={linkCls}>
                  <span className="relative inline-block">
                    อนุมัติ
                    {pendingCount > 0 && (
                      <span className="absolute -top-1.5 -right-2.5 w-4 h-4 rounded-full bg-clay text-white text-[10px] font-bold flex items-center justify-center leading-none">
                        {pendingCount > 9 ? '9+' : pendingCount}
                      </span>
                    )}
                  </span>
                </NavLink>
                <NavLink to="/admin/add-leave" className={linkCls}>
                  ลงวันลาให้พนักงาน
                </NavLink>
                <NavLink to="/admin/employees" className={linkCls}>
                  พนักงาน
                </NavLink>
                <NavLink to="/admin/leave-types" className={linkCls}>
                  ประเภทลา
                </NavLink>
                <NavLink to="/admin/holidays" className={linkCls}>
                  วันหยุด
                </NavLink>
                <NavLink to="/admin/statistics" className={linkCls}>
                  สถิติ
                </NavLink>
                <NavLink to="/admin/reports" className={linkCls}>
                  รายงาน
                </NavLink>
              </>
            )}
            <button onClick={logout} className="px-3 py-2 text-sm font-semibold rounded-lg text-clay hover:bg-clay-light transition-colors">
              ออกจากระบบ
            </button>
          </nav>
        </div>
      </header>
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </>
  )
}
