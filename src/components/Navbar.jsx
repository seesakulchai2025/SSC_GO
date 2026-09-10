import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLeaveNotifications } from '../hooks/useLeaveNotifications'
import { useAdminPendingCount } from '../hooks/useAdminPendingCount'
import ProfileModal from './ProfileModal'

const NAV_ITEMS = [
  { to: '/', end: true, label: 'หน้าหลัก', badge: 'unseen' },
  { to: '/calendar', end: false, label: 'ปฏิทิน' },
]

const ADMIN_NAV_ITEMS = [
  { to: '/admin', end: false, label: 'อนุมัติ', badge: 'pending' },
  { to: '/admin/add-leave', end: false, label: 'ลงวันลาให้พนักงาน' },
  { to: '/admin/employees', end: false, label: 'พนักงาน' },
  { to: '/admin/leave-types', end: false, label: 'ประเภทลา' },
  { to: '/admin/holidays', end: false, label: 'วันหยุด' },
  { to: '/admin/statistics', end: false, label: 'สถิติ' },
  { to: '/admin/reports', end: false, label: 'รายงาน' },
]

function Badge({ count }) {
  if (!count) return null
  return (
    <span className="absolute -top-1.5 -right-2.5 w-4 h-4 rounded-full bg-clay text-white text-[10px] font-bold flex items-center justify-center leading-none">
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
  const pendingCount = useAdminPendingCount(isAdmin)

  const badgeFor = (badge) => (badge === 'unseen' ? unseenCount : badge === 'pending' ? pendingCount : 0)

  const desktopLinkCls = ({ isActive }) =>
    `px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
      isActive ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-ink/5'
    }`

  const mobileLinkCls = ({ isActive }) =>
    `block px-3 py-2.5 text-sm font-semibold rounded-lg transition-colors ${
      isActive ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-ink/5'
    }`

  function handleHomeClick() {
    markAllSeen()
    setMenuOpen(false)
  }

  const allItems = [...NAV_ITEMS, ...(isAdmin ? ADMIN_NAV_ITEMS : [])]

  return (
    <>
      <header className="no-print sticky top-0 z-20 bg-paper/95 backdrop-blur border-b border-ink/10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setMenuOpen(true)}
              className="sm:hidden -ml-1.5 p-1.5 text-ink shrink-0"
              aria-label="เปิดเมนู"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <span className="font-display font-semibold text-ink text-lg shrink-0">ใบลา</span>
            <button onClick={() => setShowProfile(true)} className="text-ink-soft text-sm truncate hidden sm:inline underline decoration-dotted">
              · {employee?.name}
            </button>
          </div>

          {/* เมนูแนวนอนสำหรับหน้าจอกว้าง (แท็บเล็ต/คอมพิวเตอร์) */}
          <nav className="hidden sm:flex items-center gap-1 flex-wrap justify-end">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={desktopLinkCls} onClick={item.to === '/' ? markAllSeen : undefined}>
                <span className="relative inline-block">
                  {item.label}
                  <Badge count={badgeFor(item.badge)} />
                </span>
              </NavLink>
            ))}
            {isAdmin &&
              ADMIN_NAV_ITEMS.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={desktopLinkCls}>
                  <span className="relative inline-block">
                    {item.label}
                    <Badge count={badgeFor(item.badge)} />
                  </span>
                </NavLink>
              ))}
            <button onClick={logout} className="px-3 py-2 text-sm font-semibold rounded-lg text-clay hover:bg-clay-light transition-colors">
              ออกจากระบบ
            </button>
          </nav>
        </div>
      </header>

      {/* Sidebar แบบเลื่อนออกจากซ้าย สำหรับหน้าจอมือถือ */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 sm:hidden no-print" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-ink/40" />
          <div onClick={(e) => e.stopPropagation()} className="absolute left-0 top-0 bottom-0 w-72 max-w-[82%] bg-paper shadow-stamp flex flex-col">
            <div className="p-4 border-b border-ink/10 flex items-center justify-between shrink-0">
              <div className="min-w-0">
                <p className="font-display font-semibold text-ink text-lg">ใบลา</p>
                <button
                  onClick={() => {
                    setShowProfile(true)
                    setMenuOpen(false)
                  }}
                  className="text-ink-soft text-sm truncate underline decoration-dotted"
                >
                  {employee?.name}
                </button>
              </div>
              <button onClick={() => setMenuOpen(false)} className="text-ink-soft text-2xl leading-none shrink-0 pl-3">
                ×
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
              {allItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={mobileLinkCls}
                  onClick={item.to === '/' ? handleHomeClick : () => setMenuOpen(false)}
                >
                  <span className="relative inline-block">
                    {item.label}
                    <Badge count={badgeFor(item.badge)} />
                  </span>
                </NavLink>
              ))}
            </nav>

            <div className="p-2 border-t border-ink/10 shrink-0">
              <button
                onClick={logout}
                className="w-full text-left px-3 py-2.5 text-sm font-semibold rounded-lg text-clay hover:bg-clay-light transition-colors"
              >
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      )}

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </>
  )
}
