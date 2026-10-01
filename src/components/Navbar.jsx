import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLeaveNotifications } from '../hooks/useLeaveNotifications'
import { useAdminPendingCount } from '../hooks/useAdminPendingCount'
import ProfileModal from './ProfileModal'

const ADMIN_NAV_ITEMS = [
  { to: '/admin', end: true, label: 'อนุมัติ', badge: 'pending' },
  { to: '/admin/employees', end: false, label: 'พนักงาน' },
  { to: '/admin/payroll', end: false, label: 'เงินเดือน' },
]

function Badge({ count }) {
  if (!count) return null
  return (
    <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-clay px-1.5 text-[10px] font-bold leading-5 text-white">
      {count > 9 ? '9+' : count}
    </span>
  )
}

export default function Navbar() {
  const { employee, logout } = useAuth()
  const isAdmin = employee?.role === 'admin'
  const [showProfile, setShowProfile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { unseenCount, markAllSeen } = useLeaveNotifications(employee?.id)
  const { count: pendingCount, notice, dismissNotice } = useAdminPendingCount(isAdmin)
  const badgeFor = (badge) => (badge === 'unseen' ? unseenCount : badge === 'pending' ? pendingCount : 0)
  const linkClass = ({ isActive }) =>
    `flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
      isActive ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-ink/5 hover:text-ink'
    }`
  function handleNavigation(to) {
    if (to === '/') markAllSeen()
    setMenuOpen(false)
  }

  function Navigation() {
    return (
      <>
        <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase text-ink-soft/70">การใช้งาน</p>
        <NavLink to="/" end className={linkClass} onClick={() => handleNavigation('/')}>
          <span>ลงวันลา</span>
          <Badge count={badgeFor('unseen')} />
        </NavLink>
        <NavLink to="/attendance" className={linkClass} onClick={() => handleNavigation('/attendance')}>ลงเวลาเข้างาน</NavLink>
        {isAdmin && (
          <NavLink to="/admin/add-leave" className={linkClass} onClick={() => handleNavigation('/admin/add-leave')}>
            ลงวันลาให้พนักงาน
          </NavLink>
        )}

        {isAdmin && (
          <>
            <p className="px-3 pb-1 pt-5 text-[11px] font-semibold uppercase text-ink-soft/70">จัดการระบบ</p>
            {ADMIN_NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={linkClass} onClick={() => handleNavigation(item.to)}>
                <span>{item.label}</span>
                <Badge count={badgeFor(item.badge)} />
              </NavLink>
            ))}
            <NavLink to="/calendar" end className={linkClass} onClick={() => handleNavigation('/calendar')}>ปฏิทิน</NavLink>
            <NavLink to="/admin/reports" className={linkClass} onClick={() => handleNavigation('/admin/reports')}>รายงาน</NavLink>
          </>
        )}
      </>
    )
  }

  function AccountActions({ mobile = false }) {
    return (
      <div className={`border-ink/10 ${mobile ? 'border-t p-3' : 'border-t p-4'}`}>
        <button onClick={() => setShowProfile(true)} className="mb-2 block w-full truncate text-left text-sm font-semibold text-ink hover:underline">
          {employee?.name || 'บัญชีของฉัน'}
        </button>
        {employee?.department && <p className="mb-3 truncate text-xs text-ink-soft">{employee.department}</p>}
        <button onClick={logout} className="w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-clay hover:bg-clay-light">
          ออกจากระบบ
        </button>
      </div>
    )
  }

  return (
    <>
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-ink/10 bg-paper lg:flex">
        <div className="border-b border-ink/10 px-5 py-5">
          <p className="font-display text-base font-semibold text-ink">ระบบพนักงานสีสกุลไชย</p>
          <p className="mt-1 text-xs text-ink-soft">ระบบงานพนักงาน</p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          <Navigation />
        </nav>
        <AccountActions />
      </aside>

      <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-ink/10 bg-paper/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={() => setMenuOpen(true)} className="shrink-0 p-1 text-ink" aria-label="เปิดเมนู">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="truncate font-display font-semibold text-ink">ระบบพนักงานสีสกุลไชย</span>
        </div>
        <button onClick={() => setShowProfile(true)} className="max-w-[45%] truncate text-sm text-ink-soft underline decoration-dotted">
          {employee?.name}
        </button>
      </header>

      {menuOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-ink/40" />
          <aside onClick={(event) => event.stopPropagation()} className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-paper shadow-stamp">
            <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
              <div>
                <p className="font-display text-base font-semibold text-ink">ระบบพนักงานสีสกุลไชย</p>
                <p className="mt-1 max-w-52 truncate text-xs text-ink-soft">{employee?.name}</p>
              </div>
              <button onClick={() => setMenuOpen(false)} className="p-2 text-xl leading-none text-ink-soft" aria-label="ปิดเมนู">×</button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              <Navigation />
            </nav>
            <AccountActions mobile />
          </aside>
        </div>
      )}

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      {isAdmin && notice && (
        <aside role="alert" className="no-print fixed right-4 top-16 z-[60] w-[calc(100%-2rem)] max-w-sm rounded-lg border border-sage/30 bg-white p-4 shadow-stamp lg:left-[17rem] lg:right-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-ink">มีคำขอลาใหม่รออนุมัติ</p>
              <p className="mt-1 text-sm text-ink-soft">
                {notice.count > 1 ? `เข้ามา ${notice.count} รายการ` : `${notice.employeeName || 'พนักงาน'} ยื่นใบลา`}
              </p>
              <Link to="/admin" onClick={dismissNotice} className="mt-2 inline-block text-sm font-semibold text-brass-dark underline">ไปหน้าอนุมัติ</Link>
            </div>
            <button type="button" onClick={dismissNotice} aria-label="ปิดการแจ้งเตือน" className="shrink-0 px-1 text-xl leading-none text-ink-soft">×</button>
          </div>
        </aside>
      )}
    </>
  )
}