import { Link, useSearchParams } from 'react-router-dom'
import AdminReports from './AdminReports'
import AdminStatistics from './AdminStatistics'
import AdminAttendanceReport from './AdminAttendanceReport'

export default function AdminReportCenter() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedView = searchParams.get('view')
  const activeView = selectedView === 'statistics' || selectedView === 'attendance' ? selectedView : 'reports'

  function selectView(view) {
    setSearchParams(view === 'reports' ? {} : { view })
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-semibold text-ink">รายงาน</h1>
          <Link to="/admin" className="btn-secondary py-2 px-3 text-sm">← กลับหน้าอนุมัติ</Link>
        </div>
        <div className="mt-4 flex gap-1 border-b border-ink/10" role="tablist" aria-label="มุมมองรายงาน">
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'reports'}
            onClick={() => selectView('reports')}
            className={`border-b-2 px-4 py-2.5 text-sm font-semibold ${activeView === 'reports' ? 'border-ink text-ink' : 'border-transparent text-ink-soft hover:text-ink'}`}
          >
            รายงานวันลา
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'statistics'}
            onClick={() => selectView('statistics')}
            className={`border-b-2 px-4 py-2.5 text-sm font-semibold ${activeView === 'statistics' ? 'border-ink text-ink' : 'border-transparent text-ink-soft hover:text-ink'}`}
          >
            สถิติการลา
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'attendance'}
            onClick={() => selectView('attendance')}
            className={`border-b-2 px-4 py-2.5 text-sm font-semibold ${activeView === 'attendance' ? 'border-ink text-ink' : 'border-transparent text-ink-soft hover:text-ink'}`}
          >
            ลงเวลาเข้างาน
          </button>
        </div>
      </div>
      {activeView === 'reports' ? <AdminReports /> : activeView === 'statistics' ? <AdminStatistics /> : <AdminAttendanceReport />}
    </div>
  )
}
