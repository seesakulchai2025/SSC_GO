import { Link, useSearchParams } from 'react-router-dom'
import AdminReports from './AdminReports'
import AdminStatistics from './AdminStatistics'
import AdminAttendanceReport from './AdminAttendanceReport'
import AdminVehicleReports from './AdminVehicleReports'

export default function AdminReportCenter() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedView = searchParams.get('view')
  const activeView = ['statistics', 'attendance', 'vehicles'].includes(selectedView) ? selectedView : 'reports'

  function selectView(view) {
    setSearchParams(view === 'reports' ? {} : { view })
  }

  return (
    <div className="report-center mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="report-compact-heading font-display text-2xl font-semibold text-ink">รายงาน</h1>
          <Link to="/admin" className="report-compact-back btn-secondary py-2 px-3 text-sm">← กลับหน้าอนุมัติ</Link>
        </div>
        <div className="report-compact-tabs mt-4 flex gap-1 overflow-x-auto border-b border-ink/10" role="tablist" aria-label="มุมมองรายงาน">
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
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'vehicles'}
            onClick={() => selectView('vehicles')}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold ${activeView === 'vehicles' ? 'border-ink text-ink' : 'border-transparent text-ink-soft hover:text-ink'}`}
          >
            รายงานใช้รถ
          </button>
        </div>
      </div>
      {activeView === 'reports' ? <AdminReports /> : activeView === 'statistics' ? <AdminStatistics /> : activeView === 'attendance' ? <AdminAttendanceReport /> : <AdminVehicleReports />}
    </div>
  )
}
