import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, getDoc, onSnapshot, runTransaction, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { formatDateDMY, todayISO } from '../utils/dateUtils'
import { parseGoogleMapsCoordinates } from '../utils/googleMaps'
import { ATTENDANCE_EVENTS, calculateAttendanceLateMinutes, calculateOvertimeMinutes, getAttendanceEvents, getNextAttendanceEvent, isScheduledCheckInOpen } from '../utils/attendanceUtils'
import { notifyError, notifySuccess } from '../components/ToastViewport'

const SETTINGS_ID = 'attendanceSettings'
const EARTH_RADIUS_METERS = 6371000

function calculateDistanceMeters(latitudeA, longitudeA, latitudeB, longitudeB) {
  const radians = (degrees) => (degrees * Math.PI) / 180
  const latitudeDelta = radians(latitudeB - latitudeA)
  const longitudeDelta = radians(longitudeB - longitudeA)
  const haversine = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, (error) => {
      const messages = {
        1: 'กรุณาอนุญาตการเข้าถึงตำแหน่งเพื่อเช็กอิน',
        2: 'ไม่สามารถระบุตำแหน่งได้ กรุณาเปิด GPS แล้วลองอีกครั้ง',
        3: 'ใช้เวลาระบุตำแหน่งนานเกินไป กรุณาลองอีกครั้ง',
      }
      reject(new Error(messages[error.code] || 'ไม่สามารถระบุตำแหน่งได้'))
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 })
  })
}

function formatTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDate(value) {
  return formatDateDMY(value)
}

function formatShortDate(value) {
  return formatDateDMY(value)
}

function attendanceDateTime(date, time) {
  return new Date(`${date}T${time}:00`)
}

function toTimeInput(value) {
  if (!value) return ''
  const date = new Date(value)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function MapsLink({ scan }) {
  if (!scan || !Number.isFinite(scan.latitude) || !Number.isFinite(scan.longitude)) return <span className="text-ink-soft">-</span>
  const mapsUrl = `https://www.google.com/maps?q=${scan.latitude},${scan.longitude}`
  return (
    <a href={mapsUrl} target="_blank" rel="noreferrer" className="font-semibold text-brass-dark underline">
      {formatTime(scan.clientAt)} · {scan.distanceMeters} ม.
    </a>
  )
}

export default function Attendance({ embedded = false }) {
  const { employee } = useAuth()
  const isAdmin = employee?.role === 'admin'
  const [settings, setSettings] = useState(null)
  const [settingsReady, setSettingsReady] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState({
    latitude: '',
    longitude: '',
    radiusMeters: '100',
    workStartTime: '08:00',
    workEndTime: '17:00',
    overtimeOpen: false,
    overtimeStartTime: '17:00',
    overtimeEndTime: '20:00',
  })
  const [googleMapsInput, setGoogleMapsInput] = useState('')
  const [todayRecord, setTodayRecord] = useState(null)
  const [records, setRecords] = useState([])
  const [attendanceEditing, setAttendanceEditing] = useState(null)
  const [attendanceEditTimes, setAttendanceEditTimes] = useState({})
  const [attendanceEditBusy, setAttendanceEditBusy] = useState(false)
  const [attendanceEditError, setAttendanceEditError] = useState('')
  const [employees, setEmployees] = useState([])
  const [manualEmployeeId, setManualEmployeeId] = useState('')
  const [manualDate, setManualDate] = useState(todayISO())
  const [manualTimes, setManualTimes] = useState({ checkIn: '08:00', lunchOut: '12:00', lunchReturn: '13:00', checkOut: '17:00' })
  const [manualBusy, setManualBusy] = useState(false)
  const [showAttendanceHistory, setShowAttendanceHistory] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const showError = (text) => {
    setError(text)
    notifyError(text)
  }

  const today = todayISO()
  const recordId = `${employee.id}_${today}`
  const todayEvents = getAttendanceEvents(todayRecord)
  const nextEventId = getNextAttendanceEvent(todayRecord)
  const nextEvent = ATTENDANCE_EVENTS.find((event) => event.id === nextEventId)

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'meta', SETTINGS_ID), (snapshot) => {
      const data = snapshot.exists() ? snapshot.data() : null
      setSettings(data)
      setSettingsDraft({
        latitude: data?.latitude ?? '',
        longitude: data?.longitude ?? '',
        radiusMeters: String(data?.radiusMeters ?? 100),
        workStartTime: data?.workStartTime || '08:00',
        workEndTime: data?.workEndTime || '17:00',
        overtimeOpen: data?.overtimeOpen === true,
        overtimeStartTime: data?.overtimeStartTime || data?.workEndTime || '17:00',
        overtimeEndTime: data?.overtimeEndTime || '20:00',
      })
      setSettingsReady(true)
    }, () => {
      showError('โหลดพิกัดร้านไม่สำเร็จ')
      setSettingsReady(true)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'attendance', recordId), (snapshot) => {
      setTodayRecord(snapshot.exists() ? snapshot.data() : null)
    }, () => showError('โหลดข้อมูลลงเวลาวันนี้ไม่สำเร็จ'))
    return unsubscribe
  }, [recordId])

  useEffect(() => {
    if (!isAdmin) return undefined
    const unsubscribe = onSnapshot(collection(db, 'attendance'), (snapshot) => {
      const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
      rows.sort((a, b) => (b.attendanceDate || '').localeCompare(a.attendanceDate || '') || (b.checkInClientAt || '').localeCompare(a.checkInClientAt || ''))
      setRecords(rows.slice(0, 200))
    }, () => showError('โหลดรายงานเวลาเข้างานไม่สำเร็จ'))
    return unsubscribe
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) return undefined
    return onSnapshot(collection(db, 'employees'), (snapshot) => {
      const activeEmployees = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => item.active !== false && item.role !== 'admin')
        .sort((a, b) => a.name.localeCompare(b.name, 'th'))
      setEmployees(activeEmployees)
      setManualEmployeeId((current) => current || activeEmployees[0]?.id || '')
    }, () => showError('โหลดรายชื่อพนักงานสำหรับลงเวลาแทนไม่สำเร็จ'))
  }, [isAdmin])

  async function saveSettings(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    const latitude = Number(settingsDraft.latitude)
    const longitude = Number(settingsDraft.longitude)
    const radiusMeters = Number(settingsDraft.radiusMeters)
    const workStart = settingsDraft.workStartTime.split(':').map(Number)
    const workEnd = settingsDraft.workEndTime.split(':').map(Number)
    const overtimeStart = settingsDraft.overtimeStartTime.split(':').map(Number)
    const overtimeEnd = settingsDraft.overtimeEndTime.split(':').map(Number)
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      showError('กรุณากรอกละติจูดและลองจิจูดให้ถูกต้อง')
      return
    }
    if (!Number.isFinite(radiusMeters) || radiusMeters < 1 || radiusMeters > 1000) {
      showError('ระยะเช็กอินต้องอยู่ระหว่าง 1 ถึง 1,000 เมตร')
      return
    }
    if (workEnd[0] * 60 + workEnd[1] <= workStart[0] * 60 + workStart[1]) {
      showError('เวลาเลิกงานต้องอยู่หลังเวลาเข้างาน')
      return
    }
    if (settingsDraft.overtimeOpen && overtimeEnd[0] * 60 + overtimeEnd[1] <= overtimeStart[0] * 60 + overtimeStart[1]) {
      showError('เวลาสิ้นสุด OT ต้องอยู่หลังเวลาเริ่ม OT')
      return
    }
    setBusy(true)
    try {
      await setDoc(doc(db, 'meta', SETTINGS_ID), {
        latitude,
        longitude,
        radiusMeters,
        workStartTime: settingsDraft.workStartTime,
        workEndTime: settingsDraft.workEndTime,
        overtimeOpen: settingsDraft.overtimeOpen,
        overtimeStartTime: settingsDraft.overtimeStartTime,
        overtimeEndTime: settingsDraft.overtimeEndTime,
        updatedBy: employee.id,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setMessage('บันทึกพิกัดร้านแล้ว')
      notifySuccess('บันทึกการตั้งค่าเวลาและ OT เรียบร้อยแล้ว')
    } catch (saveError) {
      showError(saveError.message || 'บันทึกพิกัดร้านไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function useCurrentLocationForSettings() {
    setError('')
    setMessage('')
    try {
      const position = await getCurrentPosition()
      setSettingsDraft((current) => ({
        ...current,
        latitude: String(position.coords.latitude),
        longitude: String(position.coords.longitude),
      }))
      setMessage('อ่านพิกัดปัจจุบันแล้ว กดบันทึกเพื่อใช้เป็นหมุดร้าน')
      notifySuccess('อ่านตำแหน่งร้านสำเร็จ')
    } catch (locationError) {
      showError(locationError.message)
    }
  }

  function importGoogleMapsLocation(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    const coordinates = parseGoogleMapsCoordinates(googleMapsInput)
    if (!coordinates) {
      showError('ไม่พบพิกัดในข้อความนี้ ให้วางลิงก์ Google Maps ที่มีพิกัด หรือวางตัวเลขละติจูด, ลองจิจูด')
      return
    }
    setSettingsDraft((current) => ({
      ...current,
      latitude: String(coordinates.latitude),
      longitude: String(coordinates.longitude),
    }))
    setMessage('เลือกพิกัดจาก Google Maps แล้ว กดบันทึกเพื่อใช้เป็นหมุดร้าน')
    notifySuccess('เลือกพิกัดร้านแล้ว')
  }

  async function recordAttendanceEvent() {
    setError('')
    setMessage('')
    if (!nextEventId) {
      showError('ลงเวลาครบทั้ง 4 ขั้นตอนแล้ว')
      return
    }
    if (nextEventId === 'checkIn' && !isScheduledCheckInOpen(new Date(), settings?.workStartTime)) {
      showError(`ยังลงเวลาไม่ได้ ระบบเปิดให้เช็กอินก่อนเวลาเข้างาน 10 นาที (${settings?.workStartTime || '08:00'} น.)`)
      return
    }
    if (!Number.isFinite(settings?.latitude) || !Number.isFinite(settings?.longitude) || !settings?.radiusMeters) {
      showError('ยังไม่ได้ตั้งพิกัดร้าน กรุณาติดต่อแอดมิน')
      return
    }

    setBusy(true)
    try {
      const position = await getCurrentPosition()
      const { latitude, longitude, accuracy } = position.coords
      const distanceMeters = calculateDistanceMeters(latitude, longitude, settings.latitude, settings.longitude)
      if (distanceMeters > settings.radiusMeters) {
        showError(`อยู่นอกพื้นที่ร้าน ${Math.round(distanceMeters)} เมตร (กำหนดไม่เกิน ${settings.radiusMeters} เมตร)`)
        return
      }

      const now = new Date()
      const attendanceRef = doc(db, 'attendance', recordId)
      const settingsRef = doc(db, 'meta', SETTINGS_ID)
      const result = await runTransaction(db, async (transaction) => {
        const [existing, latestSettingsSnapshot] = await Promise.all([
          transaction.get(attendanceRef),
          transaction.get(settingsRef),
        ])
        if (!latestSettingsSnapshot.exists()) throw new Error('ยังไม่ได้ตั้งพิกัดร้าน กรุณาติดต่อแอดมิน')
        const latestSettings = latestSettingsSnapshot.data()
        const verifiedDistance = calculateDistanceMeters(latitude, longitude, latestSettings.latitude, latestSettings.longitude)
        if (verifiedDistance > latestSettings.radiusMeters) {
          throw new Error(`อยู่นอกพื้นที่ร้าน ${Math.round(verifiedDistance)} เมตร (กำหนดไม่เกิน ${latestSettings.radiusMeters} เมตร)`)
        }

        const currentRecord = existing.exists() ? existing.data() : null
        const currentEvents = getAttendanceEvents(currentRecord)
        const expectedEvent = getNextAttendanceEvent(currentRecord)
        if (expectedEvent !== nextEventId) throw new Error('ลำดับการลงเวลาเปลี่ยนแล้ว กรุณาตรวจสอบสถานะล่าสุด')
        if (nextEventId === 'checkIn' && !isScheduledCheckInOpen(now, latestSettings.workStartTime)) {
          throw new Error(`ยังลงเวลาไม่ได้ ระบบเปิดให้เช็กอินก่อนเวลาเข้างาน 10 นาที (${latestSettings.workStartTime || '08:00'} น.)`)
        }

        const lateMinutes = calculateAttendanceLateMinutes(nextEventId, now, currentEvents, latestSettings)
        const overtimeMinutes = nextEventId === 'checkOut' ? calculateOvertimeMinutes(now, latestSettings) : 0
        const event = {
          clientAt: now.toISOString(),
          serverAt: serverTimestamp(),
          latitude,
          longitude,
          accuracyMeters: Math.round(accuracy),
          distanceMeters: Math.round(verifiedDistance),
          radiusMeters: latestSettings.radiusMeters,
          lateMinutes,
          deductionBaht: lateMinutes,
          overtimeMinutes,
        }
        const events = { ...currentEvents, [nextEventId]: event }
        const totalDeduction = Object.values(events).reduce((total, scan) => total + (scan.deductionBaht || 0), 0)
        transaction.set(attendanceRef, {
          employeeId: employee.id,
          employeeName: employee.name,
          department: employee.department || '',
          attendanceDate: today,
          events,
          checkInClientAt: events.checkIn?.clientAt || null,
          checkInAt: events.checkIn?.serverAt || null,
          latitude: events.checkIn?.latitude ?? null,
          longitude: events.checkIn?.longitude ?? null,
          accuracyMeters: events.checkIn?.accuracyMeters ?? null,
          distanceMeters: events.checkIn?.distanceMeters ?? null,
          radiusMeters: events.checkIn?.radiusMeters ?? latestSettings.radiusMeters,
          lateMinutes: Object.values(events).reduce((total, scan) => total + (scan.lateMinutes || 0), 0),
          deductionBaht: totalDeduction,
          overtimeMinutes: Object.values(events).reduce((total, scan) => total + (scan.overtimeMinutes || 0), 0),
          status: totalDeduction > 0 ? 'late' : 'on-time',
          updatedAt: serverTimestamp(),
        }, { merge: true })
        return { lateMinutes, totalDeduction }
      })
      const successMessage = result.lateMinutes > 0
        ? `${nextEvent.label}แล้ว สาย ${result.lateMinutes} นาที`
        : `${nextEvent.label}เรียบร้อย`
      setMessage(successMessage)
      notifySuccess(successMessage)
    } catch (checkInError) {
      showError(checkInError.message || 'ลงเวลาไม่สำเร็จ กรุณาลองอีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  async function saveManualAttendance(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    const selectedEmployee = employees.find((item) => item.id === manualEmployeeId)
    if (!selectedEmployee) {
      showError('กรุณาเลือกพนักงาน')
      return
    }
    if (Object.values(manualTimes).some((time) => !time)) {
      showError('กรุณากรอกเวลาให้ครบทั้ง 4 ขั้นตอน')
      return
    }
    const timestamps = Object.fromEntries(ATTENDANCE_EVENTS.map(({ id }) => [id, attendanceDateTime(manualDate, manualTimes[id])]))
    if (timestamps.checkIn >= timestamps.lunchOut || timestamps.lunchOut >= timestamps.lunchReturn || timestamps.lunchReturn >= timestamps.checkOut) {
      showError('เวลาต้องเรียงจากเข้างาน พักกลางวัน กลับจากพัก และเลิกงาน')
      return
    }

    setManualBusy(true)
    try {
      const attendanceRef = doc(db, 'attendance', `${selectedEmployee.id}_${manualDate}`)
      const existingSnapshot = await getDoc(attendanceRef)
      const existingRecord = existingSnapshot.exists() ? existingSnapshot.data() : {}
      const events = getAttendanceEvents(existingRecord)
      for (const attendanceEvent of ATTENDANCE_EVENTS) {
        const { id } = attendanceEvent
        const lateMinutes = calculateAttendanceLateMinutes(id, timestamps[id], events, settings || {})
        events[id] = {
          ...events[id],
          clientAt: timestamps[id].toISOString(),
          lateMinutes,
          deductionBaht: lateMinutes,
          overtimeMinutes: id === 'checkOut' ? calculateOvertimeMinutes(timestamps[id], settings || {}) : 0,
          recordedByAdminId: employee.id,
          manuallyRecorded: true,
        }
      }
      const deductionBaht = Object.values(events).reduce((total, scan) => total + (scan.deductionBaht || 0), 0)
      await setDoc(attendanceRef, {
        employeeId: selectedEmployee.id,
        employeeName: selectedEmployee.name,
        department: selectedEmployee.department || '',
        attendanceDate: manualDate,
        events,
        checkInClientAt: events.checkIn?.clientAt || null,
        checkInAt: serverTimestamp(),
        lateMinutes: Object.values(events).reduce((total, scan) => total + (scan.lateMinutes || 0), 0),
        deductionBaht,
        overtimeMinutes: Object.values(events).reduce((total, scan) => total + (scan.overtimeMinutes || 0), 0),
        status: deductionBaht > 0 ? 'late' : 'on-time',
        updatedByAdminId: employee.id,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setMessage(`บันทึกเวลาแทน ${selectedEmployee.name} วันที่ ${manualDate} แล้ว`)
      notifySuccess(`บันทึกเวลาแทน ${selectedEmployee.name} สำเร็จ`)
    } catch (manualError) {
      showError(`บันทึกเวลาแทนไม่สำเร็จ (${manualError.code || manualError.message || 'unknown'})`)
    } finally {
      setManualBusy(false)
    }
  }

  function beginEditAttendance(record) {
    const events = getAttendanceEvents(record)
    setAttendanceEditing(record)
    setAttendanceEditError('')
    setAttendanceEditTimes(Object.fromEntries(ATTENDANCE_EVENTS.map(({ id }) => [id, toTimeInput(events[id]?.clientAt)])))
  }

  async function saveEditedAttendance(event) {
    event.preventDefault()
    if (!attendanceEditing) return
    setAttendanceEditError('')
    const suppliedTimes = ATTENDANCE_EVENTS.map(({ id }) => attendanceEditTimes[id]).filter(Boolean)
    if (suppliedTimes.length === 0) {
      setAttendanceEditError('กรุณาระบุเวลาอย่างน้อยหนึ่งรายการ')
      notifyError('กรุณาระบุเวลาอย่างน้อยหนึ่งรายการ')
      return
    }
    const orderedMinutes = suppliedTimes.map((time) => {
      const [hours, minutes] = time.split(':').map(Number)
      return hours * 60 + minutes
    })
    if (orderedMinutes.some((minutes, index) => index > 0 && minutes <= orderedMinutes[index - 1])) {
      setAttendanceEditError('เวลาเข้า-ออกต้องเรียงตามลำดับเวลา')
      notifyError('เวลาเข้า-ออกต้องเรียงตามลำดับเวลา')
      return
    }

    setAttendanceEditBusy(true)
    try {
      const previousEvents = getAttendanceEvents(attendanceEditing)
      const events = {}
      for (const attendanceEvent of ATTENDANCE_EVENTS) {
        const { id } = attendanceEvent
        const time = attendanceEditTimes[id]
        if (!time) continue
        const timestamp = attendanceDateTime(attendanceEditing.attendanceDate, time)
        const lateMinutes = calculateAttendanceLateMinutes(id, timestamp, events, settings || {})
        events[id] = {
          ...previousEvents[id],
          clientAt: timestamp.toISOString(),
          lateMinutes,
          deductionBaht: lateMinutes,
          overtimeMinutes: id === 'checkOut' ? calculateOvertimeMinutes(timestamp, settings || {}) : 0,
        }
      }
      const lateMinutes = Object.values(events).reduce((total, scan) => total + (scan.lateMinutes || 0), 0)
      const deductionBaht = Object.values(events).reduce((total, scan) => total + (scan.deductionBaht || 0), 0)
      const overtimeMinutes = Object.values(events).reduce((total, scan) => total + (scan.overtimeMinutes || 0), 0)
      const checkInEvent = events.checkIn
      await updateDoc(doc(db, 'attendance', attendanceEditing.id), {
        events,
        checkInClientAt: checkInEvent?.clientAt || null,
        checkInAt: checkInEvent?.serverAt || attendanceEditing.checkInAt || null,
        latitude: checkInEvent?.latitude ?? null,
        longitude: checkInEvent?.longitude ?? null,
        accuracyMeters: checkInEvent?.accuracyMeters ?? null,
        distanceMeters: checkInEvent?.distanceMeters ?? null,
        radiusMeters: checkInEvent?.radiusMeters ?? attendanceEditing.radiusMeters ?? null,
        lateMinutes,
        deductionBaht,
        overtimeMinutes,
        status: deductionBaht > 0 ? 'late' : 'on-time',
        updatedByAdminId: employee.id,
        updatedAt: serverTimestamp(),
      })
      setAttendanceEditing(null)
      setAttendanceEditError('')
      notifySuccess(`แก้ไขประวัติลงเวลาของ ${attendanceEditing.employeeName} แล้ว`)
    } catch (editError) {
      const message = `แก้ไขประวัติลงเวลาไม่สำเร็จ (${editError.code || editError.message || 'unknown'})`
      setAttendanceEditError(message)
      notifyError(message)
    } finally {
      setAttendanceEditBusy(false)
    }
  }

  async function deleteAttendanceRecord(record) {
    if (!confirm(`ลบประวัติลงเวลาของ ${record.employeeName} วันที่ ${formatDate(record.attendanceDate)} หรือไม่?`)) return
    try {
      await deleteDoc(doc(db, 'attendance', record.id))
      notifySuccess('ลบประวัติลงเวลาเรียบร้อยแล้ว')
    } catch (deleteError) {
      notifyError(`ลบประวัติลงเวลาไม่สำเร็จ (${deleteError.code || deleteError.message || 'unknown'})`)
    }
  }

  const totalDeduction = records.reduce((total, record) => total + (record.deductionBaht || 0), 0)

  return (
    <div className={embedded ? 'space-y-6' : 'max-w-4xl mx-auto px-4 py-6 space-y-6'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">ลงเวลาเข้างาน</h1>
          <p className="mt-1 text-sm text-ink-soft">{formatDate(today)} · เวลาเข้างาน {settings?.workStartTime || '08:00'}-{settings?.workEndTime || '17:00'} น. · เปิดเช็กอินก่อนเวลา 10 นาที</p>
        </div>
        {isAdmin && (
          <button type="button" onClick={() => setShowAttendanceHistory(true)} className="btn-secondary shrink-0 py-2 px-3 text-sm">
            ดูประวัติลงเวลา
          </button>
        )}
      </div>

      <section className="card p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-ink">{employee.name}</p>
            <p className="text-sm text-ink-soft">{employee.department || 'ไม่ระบุแผนก'}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-ink-soft">สถานะวันนี้</p>
            <p className="font-semibold text-ink">{nextEvent ? `ขั้นตอน ${ATTENDANCE_EVENTS.findIndex((event) => event.id === nextEventId) + 1} จาก 4` : 'ลงเวลาครบแล้ว'}</p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {ATTENDANCE_EVENTS.map((event, index) => {
            const scan = todayEvents[event.id]
            return (
              <div key={event.id} className={`flex items-center justify-between gap-3 rounded-md border p-3 ${scan ? 'border-sage/30 bg-sage-light/50' : event.id === nextEventId ? 'border-brass/40 bg-brass/5' : 'border-ink/10 bg-white'}`}>
                <div className="min-w-0">
                  <p className="text-xs text-ink-soft">{index + 1}. {event.label}</p>
                  {scan ? <div className="mt-1"><MapsLink scan={scan} /></div> : <p className="mt-1 text-sm text-ink-soft">ยังไม่ลงเวลา</p>}
                </div>
                <span className={`shrink-0 text-xs font-semibold ${scan ? 'text-sage' : event.id === nextEventId ? 'text-brass-dark' : 'text-ink-soft'}`}>
                  {scan ? 'บันทึกแล้ว' : event.id === nextEventId ? 'ขั้นตอนถัดไป' : 'รอลำดับ'}
                </span>
              </div>
            )
          })}
        </div>
        {nextEvent ? (
          <button type="button" onClick={recordAttendanceEvent} disabled={busy || !settingsReady} className="btn-primary w-full sm:w-auto">
            {busy ? 'กำลังตรวจสอบตำแหน่ง...' : nextEvent.label}
          </button>
        ) : (
          <div className="rounded-md bg-sage-light p-3 text-sm font-semibold text-ink">ลงเวลาครบทั้ง 4 ขั้นตอนแล้ว</div>
        )}
        {settings && <p className="text-xs text-ink-soft">พื้นที่เช็กอินไม่เกิน {settings.radiusMeters} เมตร และต้องอนุญาตตำแหน่งของอุปกรณ์</p>}
        <p className="text-xs text-ink-soft">เวลาและ GPS ใช้ข้อมูลจากอุปกรณ์ที่เช็กอิน ควรตรวจสอบรายการก่อนใช้เป็นหลักฐานคำนวณค่าจ้าง</p>
        {error && <p role="alert" className="text-sm text-clay">{error}</p>}
        {message && <p role="status" className="text-sm text-sage">{message}</p>}
      </section>

      {isAdmin && (
        <>
          <section className="card space-y-4 p-5">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">ลงเวลาแทนพนักงาน</h2>
              <p className="mt-1 text-sm text-ink-soft">บันทึกย้อนหลังเพื่อทดสอบรายงานและเงินเดือน โดยไม่ใช้ตำแหน่ง GPS</p>
            </div>
            <form onSubmit={saveManualAttendance} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-sm text-ink-soft">พนักงาน
                  <select className="input-field mt-1" value={manualEmployeeId} onChange={(event) => setManualEmployeeId(event.target.value)} required>
                    <option value="">เลือกพนักงาน</option>
                    {employees.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.department || 'ไม่ระบุแผนก'}</option>)}
                  </select>
                </label>
                <label className="text-sm text-ink-soft">วันที่ลงเวลา
                  <input type="date" className="input-field mt-1" value={manualDate} onChange={(event) => setManualDate(event.target.value)} required />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {ATTENDANCE_EVENTS.map((attendanceEvent) => (
                  <label key={attendanceEvent.id} className="text-sm text-ink-soft">{attendanceEvent.label}
                    <input type="time" className="input-field mt-1" value={manualTimes[attendanceEvent.id]} onChange={(event) => setManualTimes((current) => ({ ...current, [attendanceEvent.id]: event.target.value }))} required />
                  </label>
                ))}
              </div>
              <button type="submit" className="btn-primary px-4 py-2 text-sm" disabled={manualBusy || employees.length === 0}>
                {manualBusy ? 'กำลังบันทึก...' : 'บันทึกเวลาแทนพนักงาน'}
              </button>
            </form>
          </section>

          <section className="card p-5 space-y-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">ตั้งค่าพิกัดร้าน</h2>
              <p className="mt-1 text-sm text-ink-soft">ตั้งค่าที่ร้านหรือกรอกพิกัดเอง เปลี่ยนพิกัดและระยะได้ภายหลัง</p>
            </div>
            <div className="rounded-lg border border-ink/10 bg-paper/60 p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-ink">เลือกพิกัดจาก Google Maps</p>
                <p className="mt-1 text-xs text-ink-soft">เปิดแผนที่ เลือกจุดร้าน แล้ววางลิงก์ที่มีพิกัดหรือคัดลอกตัวเลขละติจูด, ลองจิจูดด้านล่าง</p>
              </div>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settingsDraft.latitude && settingsDraft.longitude ? `${settingsDraft.latitude},${settingsDraft.longitude}` : 'Thailand')}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-10 items-center rounded-md border border-ink/15 bg-white px-3 text-sm font-semibold text-ink hover:border-ink/30"
              >
                เปิด Google Maps ↗
              </a>
              <form onSubmit={importGoogleMapsLocation} className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={googleMapsInput}
                  onChange={(event) => setGoogleMapsInput(event.target.value)}
                  className="input-field min-w-0 flex-1"
                  placeholder="วางลิงก์ หรือ 13.7563, 100.5018"
                  aria-label="พิกัดหรือลิงก์จาก Google Maps"
                />
                <button type="submit" className="btn-secondary shrink-0 py-2 px-4 text-sm">ใช้พิกัดนี้</button>
              </form>
            </div>
            <form onSubmit={saveSettings} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="text-sm text-ink-soft">ละติจูด
                  <input type="number" step="any" value={settingsDraft.latitude} onChange={(event) => setSettingsDraft({ ...settingsDraft, latitude: event.target.value })} className="input-field mt-1" placeholder="เช่น 13.7563" required />
                </label>
                <label className="text-sm text-ink-soft">ลองจิจูด
                  <input type="number" step="any" value={settingsDraft.longitude} onChange={(event) => setSettingsDraft({ ...settingsDraft, longitude: event.target.value })} className="input-field mt-1" placeholder="เช่น 100.5018" required />
                </label>
                <label className="text-sm text-ink-soft">รัศมี (เมตร)
                  <input type="number" min="1" max="1000" value={settingsDraft.radiusMeters} onChange={(event) => setSettingsDraft({ ...settingsDraft, radiusMeters: event.target.value })} className="input-field mt-1" required />
                </label>
              </div>
              <div className="border-t border-ink/10 pt-4">
                <h3 className="text-sm font-semibold text-ink">เวลาเข้างานปกติ</h3>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-sm text-ink-soft">เวลาเข้างาน
                    <input type="time" value={settingsDraft.workStartTime} onChange={(event) => setSettingsDraft({ ...settingsDraft, workStartTime: event.target.value })} className="input-field mt-1" required />
                  </label>
                  <label className="text-sm text-ink-soft">เวลาเลิกงาน
                    <input type="time" value={settingsDraft.workEndTime} onChange={(event) => setSettingsDraft({ ...settingsDraft, workEndTime: event.target.value })} className="input-field mt-1" required />
                  </label>
                </div>
              </div>
              <label className="flex items-center gap-2 border-t border-ink/10 pt-4 text-sm font-semibold text-ink">
                <input type="checkbox" checked={settingsDraft.overtimeOpen} onChange={(event) => setSettingsDraft({ ...settingsDraft, overtimeOpen: event.target.checked })} />
                เปิดช่วงเวลาพิเศษสำหรับ OT
              </label>
              {settingsDraft.overtimeOpen && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-sm text-ink-soft">เริ่ม OT
                    <input type="time" value={settingsDraft.overtimeStartTime} onChange={(event) => setSettingsDraft({ ...settingsDraft, overtimeStartTime: event.target.value })} className="input-field mt-1" required />
                  </label>
                  <label className="text-sm text-ink-soft">สิ้นสุด OT
                    <input type="time" value={settingsDraft.overtimeEndTime} onChange={(event) => setSettingsDraft({ ...settingsDraft, overtimeEndTime: event.target.value })} className="input-field mt-1" required />
                  </label>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={useCurrentLocationForSettings} className="btn-secondary py-2 px-4 text-sm">ใช้ตำแหน่งนี้เป็นหมุดร้าน</button>
                <button type="submit" disabled={busy} className="btn-primary py-2 px-4 text-sm">{busy ? 'กำลังบันทึก...' : 'บันทึกพิกัด'}</button>
              </div>
            </form>
            {!settingsReady && <p className="text-sm text-ink-soft">กำลังโหลดค่าพิกัด...</p>}
          </section>

        </>
      )}

      {isAdmin && showAttendanceHistory && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-3 sm:p-6" onClick={() => setShowAttendanceHistory(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="attendance-history-title" onClick={(event) => event.stopPropagation()} className="card modal-frame w-full max-w-[96vw]">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-4 py-3 sm:px-6">
              <div>
                <h2 id="attendance-history-title" className="font-display text-lg font-semibold text-ink">ประวัติลงเวลาเข้า-ออก</h2>
                <p className="text-sm text-ink-soft">ยอดหักจากรายการที่แสดง {totalDeduction} บาท</p>
              </div>
              <button type="button" onClick={() => setShowAttendanceHistory(false)} aria-label="ปิดประวัติลงเวลา" className="px-2 text-2xl leading-none text-ink-soft">×</button>
            </header>
            <div className="modal-scroll">
              <table className="w-full min-w-[1120px] text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-ink/10 text-center text-ink-soft">
                    <th className="whitespace-nowrap p-3 font-semibold">วันที่</th>
                    <th className="whitespace-nowrap p-3 font-semibold">พนักงาน</th>
                    <th className="whitespace-nowrap p-3 font-semibold">เข้า</th>
                    <th className="whitespace-nowrap p-3 font-semibold">ออกพัก</th>
                    <th className="whitespace-nowrap p-3 font-semibold">กลับพัก</th>
                    <th className="whitespace-nowrap p-3 font-semibold">ออกงาน</th>
                    <th className="whitespace-nowrap p-3 font-semibold">สาย</th>
                    <th className="whitespace-nowrap p-3 font-semibold">หัก (บาท)</th>
                    <th className="whitespace-nowrap p-3 font-semibold">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.id} className="border-b border-ink/5 last:border-0">
                      <td className="whitespace-nowrap p-3 text-center font-mono">{formatShortDate(record.attendanceDate)}</td>
                      <td className="whitespace-nowrap p-3 text-center"><span className="font-semibold">{record.employeeName}</span><span className="block text-xs text-ink-soft">{record.department || ''}</span></td>
                      {ATTENDANCE_EVENTS.map((event) => <td key={event.id} className="whitespace-nowrap p-3 text-center"><MapsLink scan={getAttendanceEvents(record)[event.id]} /></td>)}
                      <td className="whitespace-nowrap p-3 text-center font-mono">{record.lateMinutes || 0} นาที</td>
                      <td className="whitespace-nowrap p-3 text-center font-mono">{record.deductionBaht || 0}</td>
                      <td className="whitespace-nowrap p-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => beginEditAttendance(record)}>แก้ไข</button>
                          <button type="button" className="px-2 py-1 text-xs font-semibold text-clay hover:bg-clay-light" onClick={() => deleteAttendanceRecord(record)}>ลบ</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {records.length === 0 && <tr><td colSpan={ATTENDANCE_EVENTS.length + 5} className="p-8 text-center text-ink-soft">ยังไม่มีรายการลงเวลา</td></tr>}
                </tbody>
              </table>
            </div>
            <footer className="flex justify-end border-t border-ink/10 px-4 py-3 sm:px-6">
              <button type="button" onClick={() => setShowAttendanceHistory(false)} className="btn-secondary py-2 px-4 text-sm">ปิด</button>
            </footer>
          </section>
        </div>
      )}

      {isAdmin && attendanceEditing && (
        <div className="no-print fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-3 sm:p-6" onClick={() => setAttendanceEditing(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="attendance-edit-title" onClick={(event) => event.stopPropagation()} className="card modal-frame w-full max-w-lg">
            <header className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
              <div>
                <h2 id="attendance-edit-title" className="font-display text-lg font-semibold text-ink">แก้ไขประวัติลงเวลา</h2>
                <p className="mt-1 text-xs text-ink-soft">{attendanceEditing.employeeName} · {formatDate(attendanceEditing.attendanceDate)}</p>
              </div>
              <button type="button" onClick={() => setAttendanceEditing(null)} aria-label="ปิดแก้ไขเวลา" className="px-2 text-xl text-ink-soft">×</button>
            </header>
            <form onSubmit={saveEditedAttendance} className="space-y-4 px-5 py-4">
              <div className="grid grid-cols-2 gap-3">
                {ATTENDANCE_EVENTS.map((attendanceEvent) => (
                  <label key={attendanceEvent.id} className="text-sm text-ink-soft">{attendanceEvent.label}
                    <input type="time" className="input-field mt-1" value={attendanceEditTimes[attendanceEvent.id] || ''} onChange={(event) => setAttendanceEditTimes((current) => ({ ...current, [attendanceEvent.id]: event.target.value }))} />
                  </label>
                ))}
              </div>
              {attendanceEditError && <p role="alert" className="text-sm text-clay">{attendanceEditError}</p>}
              <footer className="flex justify-end gap-2 border-t border-ink/10 pt-4">
                <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={() => setAttendanceEditing(null)}>ยกเลิก</button>
                <button type="submit" className="btn-primary px-4 py-2 text-sm" disabled={attendanceEditBusy}>{attendanceEditBusy ? 'กำลังบันทึก...' : 'บันทึกเวลา'}</button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
