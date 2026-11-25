import { useEffect, useState } from 'react'
import { addDoc, collection, doc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { attendanceDay, attendanceMonth, bangkokTime, filterAttendanceByMonth, formatDateDMY, todayISO } from '../utils/dateUtils'
import { parseGoogleMapsCoordinates } from '../utils/googleMaps'
import { ATTENDANCE_EVENTS, attendanceTotals, calculateAttendanceLateMinutes, calculateOvertimeMinutes, correctAttendanceEvents, getAttendanceEvents, getAttendanceLateMinutes, getNextAttendanceEvent, hasAttendanceDeductionMismatch, improvesAttendance, isOffsite, isScheduledCheckInOpen, summarizeMonthlyAttendance, validateAttendanceMode, validateStepInterval } from '../utils/attendanceUtils'
import { notifyError, notifySuccess } from '../components/ToastViewport'
import MobileSheetSection, { MobileInfo } from '../components/MobileSheetSection'

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
  return bangkokTime(value, { seconds: true })
}

function formatDate(value) {
  return formatShortDate(value)
}

function formatShortDate(value) {
  const date = attendanceDay(value)
  return date ? formatDateDMY(date) : '-'
}

function attendanceDateTime(date, time) {
  return new Date(`${date}T${time}:00+07:00`)
}

function toTimeInput(value) {
  if (!value) return ''
  return bangkokTime(value)
}

function MapsLink({ scan }) {
  if (!scan) return <span className="text-ink-soft">-</span>
  if (!Number.isFinite(scan.latitude) || !Number.isFinite(scan.longitude)) return <span>{formatTime(scan.clientAt)}</span>
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
    minStepMinutes: '2',
    maxDailyEdits: '3',
  })
  const [googleMapsInput, setGoogleMapsInput] = useState('')
  const [todayRecord, setTodayRecord] = useState(null)
  const [records, setRecords] = useState([])
  const [attendanceEditing, setAttendanceEditing] = useState(null)
  const [attendanceEditTimes, setAttendanceEditTimes] = useState({})
  const [attendanceEditBusy, setAttendanceEditBusy] = useState(false)
  const [attendanceEditError, setAttendanceEditError] = useState('')
  const [attendanceEditReason, setAttendanceEditReason] = useState('')
  const [ownEdit, setOwnEdit] = useState(null)
  const [ownEditTime, setOwnEditTime] = useState('')
  const [ownEditReason, setOwnEditReason] = useState('')
  const [employees, setEmployees] = useState([])
  const [allEmployees, setAllEmployees] = useState([])
  const [manualEmployeeId, setManualEmployeeId] = useState('')
  const [manualDate, setManualDate] = useState(todayISO())
  const [manualTimes, setManualTimes] = useState({ checkIn: '08:00', lunchOut: '12:00', lunchReturn: '13:00', checkOut: '17:00' })
  const [manualBusy, setManualBusy] = useState(false)
  const [manualReason, setManualReason] = useState('')
  const [showAttendanceHistory, setShowAttendanceHistory] = useState(false)
  const [historyMonth, setHistoryMonth] = useState(() => attendanceMonth(new Date()))
  const [historyEmployee, setHistoryEmployee] = useState('')
  const [showCorrectionForm, setShowCorrectionForm] = useState(false)
  const [correctionDate, setCorrectionDate] = useState(todayISO())
  const [correctionEvent, setCorrectionEvent] = useState('checkIn')
  const [correctionTime, setCorrectionTime] = useState('')
  const [correctionReason, setCorrectionReason] = useState('')
  const [correctionBusy, setCorrectionBusy] = useState(false)
  const [correctionRequests, setCorrectionRequests] = useState([])
  const [legacyCorrections, setLegacyCorrections] = useState([])
  const [reviewNotes, setReviewNotes] = useState({})
  const [reviewingCorrectionId, setReviewingCorrectionId] = useState('')
  const [busy, setBusy] = useState(false)
  const [attendanceCooldown, setAttendanceCooldown] = useState(false)
  const [offSite, setOffSite] = useState(false)
  const [offSiteDetails, setOffSiteDetails] = useState('')
  const [offSiteDestination, setOffSiteDestination] = useState('')
  const [offSiteDate, setOffSiteDate] = useState(todayISO())
  const [offSiteEmployeeId, setOffSiteEmployeeId] = useState('')
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
    if (!attendanceCooldown) return undefined
    const timer = setTimeout(() => setAttendanceCooldown(false), 10000)
    return () => clearTimeout(timer)
  }, [attendanceCooldown])

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
        minStepMinutes: String(data?.minStepMinutes ?? 2),
        maxDailyEdits: String(data?.maxDailyEdits ?? 3),
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
    if (!isAdmin || !showAttendanceHistory || !historyMonth) return undefined
    const ref = collection(db, 'attendance')
    let monthly = []
    let legacy = []
    const update = () => {
      const combined = new Map([...monthly, ...legacy].map((item) => [item.id, item]))
      const rows = [...combined.values()]
      rows.sort((a, b) => (attendanceDay(b.attendanceDate) || '').localeCompare(attendanceDay(a.attendanceDate) || '') || (b.checkInClientAt || '').localeCompare(a.checkInClientAt || ''))
      setRecords(rows)
    }
    const onError = () => showError('โหลดรายงานเวลาเข้างานไม่สำเร็จ')
    const stopMonth = onSnapshot(query(ref, where('attendanceDate', '>=', `${historyMonth}-01`), where('attendanceDate', '<', `${historyMonth}-32`)), (snapshot) => {
      monthly = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
      update()
    }, onError)
    const stopLegacy = onSnapshot(ref, (snapshot) => {
      legacy = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => typeof item.attendanceDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.attendanceDate))
      update()
    }, onError)
    return () => { stopMonth(); stopLegacy() }
  }, [isAdmin, showAttendanceHistory, historyMonth])

  useEffect(() => {
    if (!isAdmin) return undefined
    return onSnapshot(collection(db, 'employees'), (snapshot) => {
      const all = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'th'))
      setAllEmployees(all)
      const activeEmployees = all
        .filter((item) => item.active !== false && item.role !== 'admin')
      setEmployees(activeEmployees)
      setManualEmployeeId((current) => current || activeEmployees[0]?.id || '')
    }, () => showError('โหลดรายชื่อพนักงานสำหรับลงเวลาแทนไม่สำเร็จ'))
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) return undefined
    const load = (name, setter) => onSnapshot(collection(db, name), (snapshot) => {
      setter(snapshot.docs.map((item) => ({ id: item.id, collectionName: name, ...item.data() })).filter((item) => item.status === 'pending'))
    }, () => showError('โหลดคำขอแก้ไขเวลาไม่สำเร็จ'))
    const stopNew = load('attendanceCorrections', setCorrectionRequests)
    const stopOld = load('attendanceCorrectionRequests', setLegacyCorrections)
    return () => { stopNew(); stopOld() }
  }, [isAdmin])

  async function submitCorrectionRequest(event) {
    event.preventDefault()
    if (correctionBusy) return
    if (!correctionDate || !correctionTime || !correctionReason.trim()) {
      showError('กรุณาระบุวันที่ เวลา และเหตุผล')
      return
    }
    setCorrectionBusy(true)
    try {
      await addDoc(collection(db, 'attendanceCorrections'), {
        employeeId: employee.id,
        employeeName: employee.name,
        department: employee.department || '',
        attendanceDate: correctionDate,
        eventId: correctionEvent,
        correctTime: correctionTime,
        reason: correctionReason.trim(),
        status: 'pending',
        createdAt: serverTimestamp(),
      })
      setCorrectionTime('')
      setCorrectionReason('')
      setShowCorrectionForm(false)
      notifySuccess('ส่งคำขอแก้ไขเวลาแล้ว')
    } catch (requestError) {
      showError(`ส่งคำขอแก้ไขเวลาไม่สำเร็จ (${requestError.code || requestError.message || 'unknown'})`)
    } finally {
      setCorrectionBusy(false)
    }
  }

  async function reviewCorrection(request, status) {
    if (reviewingCorrectionId) return
    const reviewNote = (reviewNotes[`${request.collectionName}:${request.id}`] || '').trim()
    if (status === 'rejected' && !reviewNote) {
      showError('กรุณาระบุเหตุผลที่ไม่อนุมัติ')
      return
    }
    setReviewingCorrectionId(request.id)
    try {
      const closed = await runTransaction(db, async (transaction) => {
        const requestRef = doc(db, request.collectionName, request.id)
        const requestSnapshot = await transaction.get(requestRef)
        if (!requestSnapshot.exists() || requestSnapshot.data().status !== 'pending') throw new Error('คำขอนี้ได้รับการพิจารณาแล้ว')
        const current = requestSnapshot.data()
        if (status === 'approved') {
          const attendanceRef = doc(db, 'attendance', `${current.employeeId}_${current.attendanceDate}`)
          const [attendanceSnapshot, payrollSnapshot, settingsSnapshot] = await Promise.all([
            transaction.get(attendanceRef),
            transaction.get(doc(db, 'payrollSnapshots', current.attendanceDate.slice(0, 7))),
            transaction.get(doc(db, 'meta', SETTINGS_ID)),
          ])
          const record = attendanceSnapshot.exists() ? attendanceSnapshot.data() : null
          validateAttendanceMode(record, false)
          const events = correctAttendanceEvents(record, current.attendanceDate, current.eventId, current.correctTime, settingsSnapshot.data() || {})
          const scans = Object.values(events)
          const lateMinutes = scans.reduce((total, scan) => total + (Number(scan.lateMinutes) || 0), 0)
          const deductionBaht = scans.reduce((total, scan) => total + (Number(scan.deductionBaht) || 0), 0)
          const overtimeMinutes = scans.reduce((total, scan) => total + (Number(scan.overtimeMinutes) || 0), 0)
          transaction.set(attendanceRef, {
            employeeId: current.employeeId,
            employeeName: current.employeeName,
            department: current.department || '',
            attendanceDate: current.attendanceDate,
            events,
            checkInClientAt: events.checkIn?.clientAt || null,
            checkInAt: events.checkIn?.serverAt || record?.checkInAt || null,
            lateMinutes,
            deductionBaht,
            overtimeMinutes,
            status: deductionBaht > 0 ? 'late' : 'on-time',
            edited: true,
            updatedByAdminId: employee.id,
            updatedAt: serverTimestamp(),
          }, { merge: true })
          transaction.set(doc(collection(db, 'attendanceAuditLogs')), {
            attendanceId: attendanceRef.id, employeeId: current.employeeId, attendanceDate: current.attendanceDate,
            action: 'approve_correction', before: record, after: { events, lateMinutes, deductionBaht, overtimeMinutes },
            actorId: employee.id, actorName: employee.name, reason: current.reason, createdAt: serverTimestamp(),
          })
          transaction.update(requestRef, { status, reviewedById: employee.id, reviewedBy: employee.name, reviewedAt: serverTimestamp(), reviewNote })
          return payrollSnapshot.exists()
        }
        transaction.update(requestRef, { status, reviewedById: employee.id, reviewedBy: employee.name, reviewedAt: serverTimestamp(), reviewNote })
        return false
      })
      if (closed) { setMessage('งวดนี้ปิดแล้ว ยอดเงินเดือนเดิมจะไม่เปลี่ยนอัตโนมัติ'); notifyError('งวดนี้ปิดแล้ว กรุณาตรวจสอบยอดเงินเดือนเดิม') }
      notifySuccess(status === 'approved' ? 'อนุมัติและแก้ไขเวลาแล้ว' : 'ปฏิเสธคำขอแก้ไขเวลาแล้ว')
    } catch (reviewError) {
      showError(`พิจารณาคำขอไม่สำเร็จ (${reviewError.code || reviewError.message || 'unknown'})`)
    } finally {
      setReviewingCorrectionId('')
    }
  }

  async function saveOwnEdit(event) {
    event.preventDefault()
    if (!ownEdit || correctionBusy) return
    if (!ownEditReason.trim() || !ownEditTime) {
      showError('กรุณาระบุเวลาและเหตุผล')
      return
    }
    const now = new Date()
    if (attendanceDay(now) !== today || attendanceDateTime(today, ownEditTime) > now) {
      showError('แก้ไขได้เฉพาะเวลาวันนี้ที่ไม่เกินเวลาปัจจุบัน')
      return
    }
    setCorrectionBusy(true)
    try {
      const result = await runTransaction(db, async (transaction) => {
        const attendanceRef = doc(db, 'attendance', recordId)
        const [snapshot, settingSnapshot, payrollSnapshot] = await Promise.all([
          transaction.get(attendanceRef),
          transaction.get(doc(db, 'meta', SETTINGS_ID)),
          transaction.get(doc(db, 'payrollSnapshots', today.slice(0, 7))),
        ])
        if (attendanceDay(new Date()) !== today || attendanceDateTime(today, ownEditTime) > new Date()) throw new Error('แก้ไขได้เฉพาะเวลาวันนี้ที่ไม่เกินเวลาปัจจุบัน')
        if (!snapshot.exists()) throw new Error('ไม่พบรายการลงเวลา')
        const record = snapshot.data()
        validateAttendanceMode(record, false)
        const previousEvents = getAttendanceEvents(record)
        if (!previousEvents[ownEdit]) throw new Error('ไม่พบเวลาขั้นที่ต้องการแก้ไข')
        const limit = settingSnapshot.data()?.maxDailyEdits ?? 3
        if (!Number.isInteger(limit) || limit < 0) throw new Error('ตั้งค่าจำนวนครั้งแก้เวลาไม่ถูกต้อง กรุณาติดต่อแอดมิน')
        const count = Number(record.selfEditCount) || 0
        if (count >= limit) throw new Error(`แก้เวลาได้สูงสุด ${limit} ครั้งต่อวัน`)
        const events = correctAttendanceEvents(record, today, ownEdit, ownEditTime, settingSnapshot.data() || {})
        const computedBefore = attendanceTotals(previousEvents)
        const before = {
          lateMinutes: getAttendanceLateMinutes(record),
          deductionBaht: record.deductionBaht == null ? computedBefore.deductionBaht : Number(record.deductionBaht),
          overtimeMinutes: record.overtimeMinutes == null ? computedBefore.overtimeMinutes : Number(record.overtimeMinutes),
        }
        if (!Object.values(before).every(Number.isFinite)) throw new Error('ข้อมูลยอดหักหรือ OT เดิมไม่ถูกต้อง กรุณาแจ้งแอดมิน')
        const after = attendanceTotals(events)
        const pending = improvesAttendance(before, after)
        const common = { selfEditCount: count + 1, updatedAt: serverTimestamp() }
        if (pending) {
          transaction.set(doc(collection(db, 'attendanceCorrections')), {
            employeeId: employee.id, employeeName: employee.name, department: employee.department || '',
            attendanceDate: today, eventId: ownEdit, correctTime: ownEditTime,
            reason: ownEditReason.trim(), status: 'pending', createdAt: serverTimestamp(),
          })
          transaction.update(attendanceRef, common)
          transaction.set(doc(collection(db, 'attendanceAuditLogs')), {
            attendanceId: attendanceRef.id, employeeId: employee.id, attendanceDate: today,
            action: 'request_correction', before: { events: previousEvents, ...before }, after: { events, ...after },
            actorId: employee.id, actorName: employee.name, reason: ownEditReason.trim(), createdAt: serverTimestamp(),
          })
        } else {
          transaction.update(attendanceRef, {
            ...common, events, ...after, checkInClientAt: events.checkIn?.clientAt || null,
            status: after.deductionBaht > 0 ? 'late' : 'on-time', edited: true,
          })
          transaction.set(doc(collection(db, 'attendanceAuditLogs')), {
            attendanceId: attendanceRef.id, employeeId: employee.id, attendanceDate: today,
            action: 'self_edit', before: { events: previousEvents, ...before }, after: { events, ...after },
            actorId: employee.id, actorName: employee.name, reason: ownEditReason.trim(), createdAt: serverTimestamp(),
          })
        }
        return { pending, closed: payrollSnapshot.exists() }
      })
      setOwnEdit(null)
      setOwnEditReason('')
      setMessage(result.closed ? 'งวดนี้ปิดแล้ว ยอดเงินเดือนเดิมจะไม่เปลี่ยนอัตโนมัติ' : '')
      if (result.closed) notifyError('งวดนี้ปิดแล้ว กรุณาตรวจสอบยอดเงินเดือนเดิม')
      notifySuccess(result.pending ? 'ส่งคำขอให้แอดมินอนุมัติแล้ว' : 'แก้เวลาเรียบร้อยแล้ว')
    } catch (editError) {
      showError(`แก้เวลาไม่สำเร็จ (${editError.message || editError.code || 'unknown'})`)
    } finally {
      setCorrectionBusy(false)
    }
  }

  async function saveOffsite(event) {
    event.preventDefault()
    if (busy) return
    const target = isAdmin && offSiteEmployeeId ? allEmployees.find((item) => item.id === offSiteEmployeeId) : employee
    if (!target || !offSiteDestination.trim() || !offSiteDetails.trim() || !attendanceDay(offSiteDate)) {
      showError('กรุณาระบุพนักงาน วันที่ ปลายทาง และเหตุผล')
      return
    }
    if (!isAdmin && offSiteDate < todayISO()) {
      showError('พนักงานกำหนดนอกสถานที่ย้อนหลังไม่ได้ กรุณาติดต่อแอดมิน')
      return
    }
    setBusy(true)
    try {
      const existing = await getDocs(query(collection(db, 'attendance'), where('employeeId', '==', target.id)))
      if (existing.docs.some((item) => item.id !== `${target.id}_${offSiteDate}` && attendanceDay(item.data().attendanceDate) === offSiteDate)) {
        throw new Error('พบรายการลงเวลาเดิมในรูปแบบเก่า กรุณาให้แอดมินตรวจสอบก่อน')
      }
      const current = existing.docs.find((item) => item.id === `${target.id}_${offSiteDate}`)
      if (isAdmin && current && Object.keys(getAttendanceEvents(current.data())).length && !confirm('วันนี้มีเวลาปกติอยู่แล้ว การกำหนดนอกสถานที่จะลบเวลาปกติของวันนี้ ยืนยันหรือไม่?')) return
      const checkedEvents = current ? JSON.stringify(getAttendanceEvents(current.data())) : null
      let coordinates = null
      try {
        const position = await getCurrentPosition()
        coordinates = { latitude: position.coords.latitude, longitude: position.coords.longitude }
      } catch (locationError) {
        setMessage(`ไม่สามารถบันทึกตำแหน่งอ้างอิง: ${locationError.message}`)
      }
      const result = await runTransaction(db, async (transaction) => {
        const ref = doc(db, 'attendance', `${target.id}_${offSiteDate}`)
        const [snapshot, payrollSnapshot] = await Promise.all([
          transaction.get(ref), transaction.get(doc(db, 'payrollSnapshots', offSiteDate.slice(0, 7))),
        ])
        const previous = snapshot.exists() ? snapshot.data() : null
        if (isAdmin && previous && Object.keys(getAttendanceEvents(previous)).length && JSON.stringify(getAttendanceEvents(previous)) !== checkedEvents) throw new Error('รายการลงเวลาเปลี่ยนแล้ว กรุณาตรวจสอบและลองใหม่')
        if (!isAdmin && offSiteDate < todayISO()) throw new Error('พนักงานกำหนดนอกสถานที่ย้อนหลังไม่ได้')
        if (!isAdmin) validateAttendanceMode(previous, true)
        if (isOffsite(previous)) throw new Error('มีรายการนอกสถานที่ในวันนี้แล้ว')
        const offsite = {
          status: 'approved', autoApproved: true, destination: offSiteDestination.trim(), reason: offSiteDetails.trim(),
          requestedBy: employee.id, requestedAt: serverTimestamp(),
          latitude: coordinates?.latitude ?? null, longitude: coordinates?.longitude ?? null,
          cancelledBy: null, cancelledAt: null, cancelReason: '',
        }
        const update = {
          employeeId: target.id, employeeName: target.name, department: target.department || '',
          attendanceDate: offSiteDate, offsite, status: 'off-site',
          events: {}, checkInClientAt: null, checkInAt: null, lateMinutes: 0, deductionBaht: 0, overtimeMinutes: 0, updatedAt: serverTimestamp(),
        }
        transaction.set(ref, update, { merge: true })
        transaction.set(doc(collection(db, 'attendanceAuditLogs')), {
          attendanceId: ref.id, employeeId: target.id, attendanceDate: offSiteDate, action: 'offsite_create',
          before: previous, after: { offsite, status: 'off-site', events: {}, lateMinutes: 0, deductionBaht: 0, overtimeMinutes: 0 },
          actorId: employee.id, actorName: employee.name, reason: offSiteDetails.trim(), createdAt: serverTimestamp(),
        })
        return payrollSnapshot.exists()
      })
      if (result) { setMessage('งวดนี้ปิดแล้ว ยอดเงินเดือนเดิมจะไม่เปลี่ยนอัตโนมัติ'); notifyError('งวดนี้ปิดแล้ว กรุณาตรวจสอบยอดเงินเดือนเดิม') }
      setOffSite(false)
      setOffSiteDetails('')
      setOffSiteDestination('')
      notifySuccess('บันทึกงานนอกสถานที่แล้ว')
    } catch (offsiteError) {
      showError(`บันทึกงานนอกสถานที่ไม่สำเร็จ (${offsiteError.message || offsiteError.code || 'unknown'})`)
    } finally {
      setBusy(false)
    }
  }

  async function cancelOffsite(record) {
    const reason = prompt('ระบุเหตุผลในการยกเลิกงานนอกสถานที่')
    if (reason == null) return
    if (!reason.trim()) { showError('กรุณาระบุเหตุผลในการยกเลิก'); return }
    try {
      const closed = await runTransaction(db, async (transaction) => {
        const ref = doc(db, 'attendance', record.id)
        const [snapshot, payrollSnapshot] = await Promise.all([
          transaction.get(ref), transaction.get(doc(db, 'payrollSnapshots', attendanceMonth(record.attendanceDate))),
        ])
        if (!snapshot.exists() || !isOffsite(snapshot.data())) throw new Error('ไม่พบรายการนอกสถานที่ที่อนุมัติ')
        const before = snapshot.data()
        const offsite = { ...(before.offsite || {}), status: 'cancelled', cancelledBy: employee.id, cancelledAt: serverTimestamp(), cancelReason: reason.trim() }
        transaction.update(ref, { offsite, status: 'cancelled', updatedAt: serverTimestamp() })
        transaction.set(doc(collection(db, 'attendanceAuditLogs')), {
          attendanceId: ref.id, employeeId: before.employeeId, attendanceDate: before.attendanceDate,
          action: 'offsite_cancel', before, after: { status: 'cancelled', offsite, lateMinutes: before.lateMinutes ?? 0, deductionBaht: before.deductionBaht ?? 0, overtimeMinutes: before.overtimeMinutes ?? 0 },
          actorId: employee.id, actorName: employee.name, reason: reason.trim(), createdAt: serverTimestamp(),
        })
        return payrollSnapshot.exists()
      })
      if (closed) { setMessage('งวดนี้ปิดแล้ว ยอดเงินเดือนเดิมจะไม่เปลี่ยนอัตโนมัติ'); notifyError('งวดนี้ปิดแล้ว กรุณาตรวจสอบยอดเงินเดือนเดิม') }
      notifySuccess('ยกเลิกงานนอกสถานที่แล้ว')
    } catch (cancelError) {
      showError(`ยกเลิกไม่สำเร็จ (${cancelError.message || cancelError.code || 'unknown'})`)
    }
  }

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
    const minStepMinutes = Number(settingsDraft.minStepMinutes)
    const maxDailyEdits = Number(settingsDraft.maxDailyEdits)
    if (!Number.isInteger(minStepMinutes) || minStepMinutes < 1 || !Number.isInteger(maxDailyEdits) || maxDailyEdits < 0) {
      showError('ระยะห่างต้องไม่น้อยกว่า 1 นาที และจำนวนครั้งแก้ไขต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป')
      return
    }
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
        minStepMinutes,
        maxDailyEdits,
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
    if (busy || attendanceCooldown) return
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
      if (attendanceDay(now) !== today) throw new Error('วันเปลี่ยนแล้ว กรุณาลองลงเวลาใหม่')
      if (!confirm(`บันทึก '${nextEvent.label}' เวลา ${bangkokTime(now)} ใช่ไหม`)) return
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
        validateAttendanceMode(currentRecord, false)
        const currentEvents = getAttendanceEvents(currentRecord)
        const expectedEvent = getNextAttendanceEvent(currentRecord)
        if (expectedEvent !== nextEventId) throw new Error('ลำดับการลงเวลาเปลี่ยนแล้ว กรุณาตรวจสอบสถานะล่าสุด')
        validateStepInterval(currentEvents, nextEventId, now, latestSettings.minStepMinutes ?? 2)
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
      setAttendanceCooldown(true)
      setMessage(successMessage)
      notifySuccess(successMessage)
    } catch (checkInError) {
      if (checkInError.code === 'permission-denied') {
        showError('ลงเวลาไม่ได้ อาจยังไม่ครบ 10 วินาทีหรือไม่มีสิทธิ์ กรุณารอแล้วลองใหม่ หรือใช้ปุ่มแจ้งแก้ไขเวลา / กดผิด')
      } else {
        showError(checkInError.message || 'ลงเวลาไม่สำเร็จ กรุณาลองอีกครั้ง')
      }
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
    if (!manualReason.trim()) { showError('กรุณาระบุเหตุผลในการลงเวลาแทน'); return }
    const timestamps = Object.fromEntries(ATTENDANCE_EVENTS.map(({ id }) => [id, attendanceDateTime(manualDate, manualTimes[id])]))
    if (timestamps.checkIn >= timestamps.lunchOut || timestamps.lunchOut >= timestamps.lunchReturn || timestamps.lunchReturn >= timestamps.checkOut) {
      showError('เวลาต้องเรียงจากเข้างาน พักกลางวัน กลับจากพัก และเลิกงาน')
      return
    }

    setManualBusy(true)
    try {
      const attendanceRef = doc(db, 'attendance', `${selectedEmployee.id}_${manualDate}`)
      const closed = await runTransaction(db, async (transaction) => {
        const [existingSnapshot, payrollSnapshot] = await Promise.all([
          transaction.get(attendanceRef), transaction.get(doc(db, 'payrollSnapshots', manualDate.slice(0, 7))),
        ])
        const existingRecord = existingSnapshot.exists() ? existingSnapshot.data() : {}
        validateAttendanceMode(existingSnapshot.exists() ? existingRecord : null, false)
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
        transaction.set(attendanceRef, {
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
          edited: existingSnapshot.exists(),
          updatedByAdminId: employee.id,
          updatedAt: serverTimestamp(),
        }, { merge: true })
        transaction.set(doc(collection(db, 'attendanceAuditLogs')), {
          attendanceId: attendanceRef.id, employeeId: selectedEmployee.id, attendanceDate: manualDate,
          action: 'admin_manual', before: existingSnapshot.exists() ? existingRecord : null,
          after: { events, ...attendanceTotals(events) },
          actorId: employee.id, actorName: employee.name, reason: manualReason.trim(), createdAt: serverTimestamp(),
        })
        return payrollSnapshot.exists()
      })
      if (closed) notifyError('งวดนี้ปิดแล้ว กรุณาตรวจสอบยอดเงินเดือนเดิม')
      setMessage(`บันทึกเวลาแทน ${selectedEmployee.name} วันที่ ${manualDate} แล้ว`)
      notifySuccess(`บันทึกเวลาแทน ${selectedEmployee.name} สำเร็จ`)
    } catch (manualError) {
      showError(`บันทึกเวลาแทนไม่สำเร็จ (${manualError.code || manualError.message || 'unknown'})`)
    } finally {
      setManualBusy(false)
    }
  }

  function beginEditAttendance(record) {
    if (isOffsite(record)) {
      showError('วันนอกสถานที่ไม่สามารถแก้เป็นเวลาลงงานปกติได้')
      return
    }
    const events = getAttendanceEvents(record)
    setAttendanceEditing(record)
    setAttendanceEditError('')
    setAttendanceEditReason('')
    setAttendanceEditTimes(Object.fromEntries(ATTENDANCE_EVENTS.map(({ id }) => [id, toTimeInput(events[id]?.clientAt)])))
  }

  async function saveEditedAttendance(event) {
    event.preventDefault()
    if (!attendanceEditing) return
    setAttendanceEditError('')
    if (!attendanceEditReason.trim()) {
      setAttendanceEditError('กรุณาระบุเหตุผลในการแก้ไข')
      return
    }
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
      const closed = await runTransaction(db, async (transaction) => {
        const attendanceRef = doc(db, 'attendance', attendanceEditing.id)
        const [current, payrollSnapshot] = await Promise.all([
          transaction.get(attendanceRef), transaction.get(doc(db, 'payrollSnapshots', attendanceMonth(attendanceEditing.attendanceDate))),
        ])
        if (!current.exists()) throw new Error('ไม่พบรายการลงเวลาแล้ว')
        validateAttendanceMode(current.data(), false)
        const previousEvents = getAttendanceEvents(current.data())
        const events = {}
        for (const { id } of ATTENDANCE_EVENTS) {
          const time = attendanceEditTimes[id]
          if (!time) continue
          const timestamp = attendanceDateTime(attendanceDay(attendanceEditing.attendanceDate), time)
          const lateMinutes = calculateAttendanceLateMinutes(id, timestamp, events, settings || {})
          events[id] = {
            ...previousEvents[id], clientAt: timestamp.toISOString(), lateMinutes, deductionBaht: lateMinutes,
            overtimeMinutes: id === 'checkOut' ? calculateOvertimeMinutes(timestamp, settings || {}) : 0,
          }
        }
        const { lateMinutes, deductionBaht, overtimeMinutes } = attendanceTotals(events)
        const checkInEvent = events.checkIn
        transaction.update(attendanceRef, {
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
          edited: true,
          updatedByAdminId: employee.id,
          updatedAt: serverTimestamp(),
        })
        transaction.set(doc(collection(db, 'attendanceAuditLogs')), {
          attendanceId: attendanceRef.id, employeeId: current.data().employeeId, attendanceDate: current.data().attendanceDate,
          action: 'admin_edit', before: current.data(), after: { events, lateMinutes, deductionBaht, overtimeMinutes },
          actorId: employee.id, actorName: employee.name, reason: attendanceEditReason.trim(), createdAt: serverTimestamp(),
        })
        return payrollSnapshot.exists()
      })
      if (closed) { setMessage('งวดนี้ปิดแล้ว ยอดเงินเดือนเดิมจะไม่เปลี่ยนอัตโนมัติ'); notifyError('งวดนี้ปิดแล้ว กรุณาตรวจสอบยอดเงินเดือนเดิม') }
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
    const reason = prompt('ระบุเหตุผลในการลบประวัติลงเวลา')
    if (reason == null) return
    if (!reason.trim()) { showError('กรุณาระบุเหตุผลในการลบ'); return }
    try {
      const closed = await runTransaction(db, async (transaction) => {
        const ref = doc(db, 'attendance', record.id)
        const [snapshot, payrollSnapshot] = await Promise.all([
          transaction.get(ref), transaction.get(doc(db, 'payrollSnapshots', attendanceMonth(record.attendanceDate))),
        ])
        if (!snapshot.exists()) throw new Error('ไม่พบรายการลงเวลาแล้ว')
        transaction.delete(ref)
        transaction.set(doc(collection(db, 'attendanceAuditLogs')), {
          attendanceId: ref.id, employeeId: snapshot.data().employeeId, attendanceDate: snapshot.data().attendanceDate,
          action: 'delete', before: snapshot.data(), after: null,
          actorId: employee.id, actorName: employee.name, reason: reason.trim(), createdAt: serverTimestamp(),
        })
        return payrollSnapshot.exists()
      })
      if (closed) notifyError('งวดนี้ปิดแล้ว กรุณาตรวจสอบยอดเงินเดือนเดิม')
      notifySuccess('ลบประวัติลงเวลาเรียบร้อยแล้ว')
    } catch (deleteError) {
      notifyError(`ลบประวัติลงเวลาไม่สำเร็จ (${deleteError.code || deleteError.message || 'unknown'})`)
    }
  }

  const displayedRecords = filterAttendanceByMonth(records, historyMonth).filter((record) => !historyEmployee || record.employeeId === historyEmployee)
  const invalidHistoryCount = records.filter((record) => !attendanceMonth(record.attendanceDate)).length
  const deductionMismatchCount = displayedRecords.filter(hasAttendanceDeductionMismatch).length
  const totalDeduction = summarizeMonthlyAttendance(displayedRecords, historyMonth).deductionBaht

  return (
    <div className={embedded ? 'space-y-6' : 'page-container page-stack'}>
      <div className="page-section-head items-start">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <h1 className="font-display text-lg font-semibold text-ink sm:text-2xl">ลงเวลาเข้างาน</h1>
            <span className="sm:hidden">
              <MobileInfo title="ข้อควรทราบการลงเวลา">
                <div className="space-y-3 text-sm text-ink-soft">
                  <p>{formatDate(today)} · เวลาเข้างาน {settings?.workStartTime || '08:00'}-{settings?.workEndTime || '17:00'} น. · เปิดเช็กอินก่อนเวลา 10 นาที</p>
                  {settings && <p>พื้นที่เช็กอินไม่เกิน {settings.radiusMeters} เมตร และต้องอนุญาตตำแหน่งของอุปกรณ์</p>}
                  <p>เวลาและ GPS ใช้ข้อมูลจากอุปกรณ์ที่เช็กอิน ควรตรวจสอบรายการก่อนใช้เป็นหลักฐานคำนวณค่าจ้าง</p>
                </div>
              </MobileInfo>
            </span>
          </div>
          <p className="mt-0.5 text-xs text-ink-soft sm:hidden">{formatDate(today)} · {settings?.workStartTime || '08:00'}-{settings?.workEndTime || '17:00'} น.</p>
          <p className="mt-1 hidden text-sm text-ink-soft sm:block">{formatDate(today)} · เวลาเข้างาน {settings?.workStartTime || '08:00'}-{settings?.workEndTime || '17:00'} น. · เปิดเช็กอินก่อนเวลา 10 นาที</p>
        </div>
        {isAdmin && (
          <button type="button" onClick={() => setShowAttendanceHistory(true)} className="btn-secondary shrink-0 py-2 px-3 text-sm">
            ดูประวัติลงเวลา {correctionRequests.length + legacyCorrections.length > 0 && `(${correctionRequests.length + legacyCorrections.length} คำขอ)`}
          </button>
        )}
      </div>

      <section className="card page-card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-ink">{employee.name}</p>
            <p className="text-sm text-ink-soft">{employee.department || 'ไม่ระบุแผนก'}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-ink-soft">สถานะวันนี้</p>
            <p className="font-semibold text-ink">{isOffsite(todayRecord) ? 'นอกสถานที่' : nextEvent ? `ขั้นตอน ${ATTENDANCE_EVENTS.findIndex((event) => event.id === nextEventId) + 1} จาก 4` : 'ลงเวลาครบแล้ว'}</p>
          </div>
        </div>
        {isOffsite(todayRecord) ? (
          <div className="rounded-md bg-sage-light p-3 text-sm">วันนี้ทำงานนอกสถานที่ · {todayRecord.offsite?.destination || todayRecord.offSiteDetails}</div>
        ) : <div className="grid grid-cols-2 gap-2">
          {ATTENDANCE_EVENTS.map((event, index) => {
            const scan = todayEvents[event.id]
            return (
              <div key={event.id} className={`flex flex-col items-start gap-1 rounded-md border p-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:p-3 ${scan ? 'border-sage/30 bg-sage-light/50' : event.id === nextEventId ? 'border-brass/40 bg-brass/5' : 'border-ink/10 bg-white'}`}>
                <div className="min-w-0">
                  <p className="text-xs text-ink-soft">{index + 1}. {event.label}</p>
                  {scan ? <div className="mt-1"><MapsLink scan={scan} /></div> : <p className="mt-1 text-sm text-ink-soft">ยังไม่ลงเวลา</p>}
                  {scan && <button type="button" className="text-xs font-semibold text-brass-dark underline" onClick={() => { setOwnEdit(event.id); setOwnEditTime(toTimeInput(scan.clientAt)); setOwnEditReason('') }}>แก้เวลา</button>}
                </div>
                <span className={`shrink-0 text-xs font-semibold ${scan ? 'text-sage' : event.id === nextEventId ? 'text-brass-dark' : 'text-ink-soft'}`}>
                  {scan ? 'บันทึกแล้ว' : event.id === nextEventId ? 'ขั้นตอนถัดไป' : 'รอลำดับ'}
                </span>
              </div>
            )
          })}
        </div>}
        {nextEvent ? (
          <button type="button" onClick={recordAttendanceEvent} disabled={busy || attendanceCooldown || !settingsReady} className="btn-primary w-full sm:w-auto">
            {busy ? 'กำลังตรวจสอบตำแหน่ง...' : attendanceCooldown ? 'กรุณารอสักครู่...' : nextEvent.label}
          </button>
        ) : !isOffsite(todayRecord) ? (
          <div className="rounded-md bg-sage-light p-3 text-sm font-semibold text-ink">ลงเวลาครบทั้ง 4 ขั้นตอนแล้ว</div>
        ) : null}
        <p className="text-xs text-ink-soft">เวลาที่บันทึกล่าสุด: {ATTENDANCE_EVENTS.slice().reverse().map((item) => todayEvents[item.id]).find(Boolean)?.clientAt ? formatTime(ATTENDANCE_EVENTS.slice().reverse().map((item) => todayEvents[item.id]).find(Boolean).clientAt) : '-'}</p>
        {(!isOffsite(todayRecord) || isAdmin) && <button type="button" className="btn-secondary px-3 py-2 text-sm" onClick={() => setOffSite((value) => !value)}>ออกงานนอกสถานที่</button>}
        {offSite && <form onSubmit={saveOffsite} className="space-y-3">
          {isAdmin && <label className="block text-sm">พนักงาน<select className="input-field mt-1" value={offSiteEmployeeId} onChange={(event) => setOffSiteEmployeeId(event.target.value)}><option value="">ตัวเอง</option>{allEmployees.map((item) => <option key={item.id} value={item.id}>{item.name}{item.active === false ? ' (ระงับใช้งาน)' : ''}</option>)}</select></label>}
          <label className="block text-sm">วันที่<input type="date" min={isAdmin ? undefined : today} className="input-field mt-1" value={offSiteDate} onChange={(event) => setOffSiteDate(event.target.value)} required /></label>
          <label className="block text-sm">ปลายทาง<input className="input-field mt-1" value={offSiteDestination} onChange={(event) => setOffSiteDestination(event.target.value)} maxLength={200} required /></label>
          <label className="block text-sm">เหตุผล<input className="input-field mt-1" value={offSiteDetails} onChange={(event) => setOffSiteDetails(event.target.value)} maxLength={200} required /></label>
          <button type="submit" className="btn-primary px-3 py-2 text-sm" disabled={busy}>บันทึกนอกสถานที่เต็มวัน</button>
        </form>}
        {ownEdit && <form onSubmit={saveOwnEdit} className="space-y-3 border-t border-ink/10 pt-3">
          <p className="font-semibold">แก้เวลา {ATTENDANCE_EVENTS.find((item) => item.id === ownEdit)?.label}</p>
          <label className="block text-sm">เวลาที่ถูกต้อง<input type="time" className="input-field mt-1" value={ownEditTime} onChange={(event) => setOwnEditTime(event.target.value)} required /></label>
          <label className="block text-sm">เหตุผล<input className="input-field mt-1" value={ownEditReason} onChange={(event) => setOwnEditReason(event.target.value)} required /></label>
          <button type="submit" className="btn-primary px-3 py-2 text-sm" disabled={correctionBusy}>บันทึกแก้เวลา</button>
          <button type="button" className="btn-secondary ml-2 px-3 py-2 text-sm" onClick={() => setOwnEdit(null)}>ยกเลิก</button>
        </form>}
        {settings && <p className="hidden text-xs text-ink-soft sm:block">พื้นที่เช็กอินไม่เกิน {settings.radiusMeters} เมตร และต้องอนุญาตตำแหน่งของอุปกรณ์</p>}
        <p className="hidden text-xs text-ink-soft sm:block">เวลาและ GPS ใช้ข้อมูลจากอุปกรณ์ที่เช็กอิน ควรตรวจสอบรายการก่อนใช้เป็นหลักฐานคำนวณค่าจ้าง</p>
        {error && <p role="alert" className="text-sm text-clay">{error}</p>}
        {message && <p role="status" className="text-sm text-sage">{message}</p>}
        <button type="button" className="text-xs font-semibold text-brass-dark underline" onClick={() => setShowCorrectionForm((current) => !current)}>แจ้งแก้ไขเวลา / กดผิด</button>
        {showCorrectionForm && (
          <form onSubmit={submitCorrectionRequest} className="space-y-3 border-t border-ink/10 pt-3">
            <label className="block text-sm">วันที่<input type="date" className="input-field mt-1" value={correctionDate} onChange={(event) => setCorrectionDate(event.target.value)} required /></label>
            <label className="block text-sm">ประเภทเวลา<select className="input-field mt-1" value={correctionEvent} onChange={(event) => setCorrectionEvent(event.target.value)}>{ATTENDANCE_EVENTS.map((event) => <option key={event.id} value={event.id}>{event.label}</option>)}</select></label>
            <label className="block text-sm">เวลาที่ถูกต้อง<input type="time" className="input-field mt-1" value={correctionTime} onChange={(event) => setCorrectionTime(event.target.value)} required /></label>
            <label className="block text-sm">เหตุผล<input className="input-field mt-1" value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} required /></label>
            <button type="submit" className="btn-secondary px-3 py-2 text-sm" disabled={correctionBusy}>{correctionBusy ? 'กำลังส่ง...' : 'ส่งคำขอ'}</button>
          </form>
        )}
      </section>

      {isAdmin && (
        <>
          <MobileSheetSection title="ลงเวลาแทนพนักงาน">
          <section className="card space-y-4 p-5">
            <div>
              <h2 className="sheet-dup-title font-display text-lg font-semibold text-ink">ลงเวลาแทนพนักงาน</h2>
              <p className="mt-1 text-sm text-ink-soft">บันทึกย้อนหลังเพื่อทดสอบรายงานและเงินเดือน โดยไม่ใช้ตำแหน่ง GPS</p>
            </div>
            <form onSubmit={saveManualAttendance} className="space-y-3">
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="min-w-0 text-sm text-ink-soft">พนักงาน
                  <select className="input-field mt-1" value={manualEmployeeId} onChange={(event) => setManualEmployeeId(event.target.value)} required>
                    <option value="">เลือกพนักงาน</option>
                    {employees.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.department || 'ไม่ระบุแผนก'}</option>)}
                  </select>
                </label>
                <label className="min-w-0 text-sm text-ink-soft">วันที่ลงเวลา
                  <input type="date" className="input-field mt-1" value={manualDate} onChange={(event) => setManualDate(event.target.value)} required />
                </label>
              </div>
              <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                {ATTENDANCE_EVENTS.map((attendanceEvent) => (
                  <label key={attendanceEvent.id} className="min-w-0 text-sm text-ink-soft">{attendanceEvent.label}
                    <input type="time" className="input-field mt-1" value={manualTimes[attendanceEvent.id]} onChange={(event) => setManualTimes((current) => ({ ...current, [attendanceEvent.id]: event.target.value }))} required />
                  </label>
                ))}
              </div>
              <label className="block text-sm">เหตุผล<input className="input-field mt-1" value={manualReason} onChange={(event) => setManualReason(event.target.value)} required /></label>
              <button type="submit" className="btn-primary px-4 py-2 text-sm" disabled={manualBusy || employees.length === 0}>
                {manualBusy ? 'กำลังบันทึก...' : 'บันทึกเวลาแทนพนักงาน'}
              </button>
            </form>
          </section>
          </MobileSheetSection>

          <MobileSheetSection title="ตั้งค่าพิกัดร้าน">
          <section className="card p-5 space-y-4">
            <div>
              <h2 className="sheet-dup-title font-display text-lg font-semibold text-ink">ตั้งค่าพิกัดร้าน</h2>
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
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="text-sm text-ink-soft">เวลาเข้างาน
                    <input type="time" value={settingsDraft.workStartTime} onChange={(event) => setSettingsDraft({ ...settingsDraft, workStartTime: event.target.value })} className="input-field mt-1" required />
                  </label>
                  <label className="text-sm text-ink-soft">เวลาเลิกงาน
                    <input type="time" value={settingsDraft.workEndTime} onChange={(event) => setSettingsDraft({ ...settingsDraft, workEndTime: event.target.value })} className="input-field mt-1" required />
                  </label>
                </div>
                <label className="block text-sm">ระยะห่างขั้นต่ำระหว่างขั้น (นาที)<input type="number" min="1" step="1" className="input-field mt-1" value={settingsDraft.minStepMinutes} onChange={(event) => setSettingsDraft({ ...settingsDraft, minStepMinutes: event.target.value })} required /></label>
                <label className="block text-sm">จำนวนครั้งแก้เวลาต่อวัน<input type="number" min="0" step="1" className="input-field mt-1" value={settingsDraft.maxDailyEdits} onChange={(event) => setSettingsDraft({ ...settingsDraft, maxDailyEdits: event.target.value })} required /></label>
              </div>
              <label className="flex items-center gap-2 border-t border-ink/10 pt-4 text-sm font-semibold text-ink">
                <input type="checkbox" checked={settingsDraft.overtimeOpen} onChange={(event) => setSettingsDraft({ ...settingsDraft, overtimeOpen: event.target.checked })} />
                เปิดช่วงเวลาพิเศษสำหรับ OT
              </label>
              {settingsDraft.overtimeOpen && (
                <div className="grid grid-cols-2 gap-3">
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
          </MobileSheetSection>

        </>
      )}

      {isAdmin && showAttendanceHistory && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-3 sm:p-6" onClick={() => setShowAttendanceHistory(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="attendance-history-title" onClick={(event) => event.stopPropagation()} className="card modal-frame w-full max-w-[96vw]">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-4 py-3 sm:px-6">
              <div>
                <h2 id="attendance-history-title" className="font-display text-lg font-semibold text-ink">ประวัติลงเวลาเข้า-ออก</h2>
                <p className="text-sm text-ink-soft">ยอดหักจากรายการที่แสดง {totalDeduction} บาท</p>
                {invalidHistoryCount > 0 && <p role="alert" className="text-sm text-clay">มี {invalidHistoryCount} รายการที่มีวันที่ไม่ถูกต้องและไม่รวมในรายงาน กรุณาตรวจสอบข้อมูล</p>}
                {deductionMismatchCount > 0 && <p role="alert" className="text-sm text-clay">มี {deductionMismatchCount} รายการที่ยอดหักเดิมไม่ตรงกับนาทีสาย ระบบแสดงยอดตามนาทีสาย</p>}
              </div>
              <label className="text-sm text-ink-soft">เดือน
                <input type="month" className="input-field mt-1" value={historyMonth} onChange={(event) => setHistoryMonth(event.target.value)} />
              </label>
              <label className="text-sm text-ink-soft">พนักงาน<select className="input-field mt-1" value={historyEmployee} onChange={(event) => setHistoryEmployee(event.target.value)}><option value="">ทุกคน</option>{allEmployees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <button type="button" onClick={() => setShowAttendanceHistory(false)} aria-label="ปิดประวัติลงเวลา" className="px-2 text-2xl leading-none text-ink-soft">×</button>
            </header>
            <div className="modal-scroll">
              <section className="space-y-3 border-b border-ink/10 p-4">
                <h3 className="font-semibold">คำขอแก้ไขเวลารออนุมัติ ({correctionRequests.length + legacyCorrections.length})</h3>
                {[...correctionRequests, ...legacyCorrections].map((request) => (
                  <div key={`${request.collectionName}:${request.id}`} className="space-y-2 border-t border-ink/10 pt-3 text-sm">
                    <p className="font-semibold">{request.employeeName} · {formatDate(request.attendanceDate)}</p>
                    <p>{ATTENDANCE_EVENTS.find((item) => item.id === request.eventId)?.label || request.eventId} · {request.correctTime} น. · {request.reason}</p>
                    <input className="input-field" placeholder="เหตุผลที่ไม่อนุมัติ" value={reviewNotes[`${request.collectionName}:${request.id}`] || ''} onChange={(event) => setReviewNotes((current) => ({ ...current, [`${request.collectionName}:${request.id}`]: event.target.value }))} />
                    <div className="flex gap-2"><button type="button" className="btn-primary px-3 py-2 text-sm" disabled={Boolean(reviewingCorrectionId)} onClick={() => reviewCorrection(request, 'approved')}>อนุมัติ</button><button type="button" className="btn-secondary px-3 py-2 text-sm" disabled={Boolean(reviewingCorrectionId)} onClick={() => reviewCorrection(request, 'rejected')}>ปฏิเสธ</button></div>
                  </div>
                ))}
              </section>
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
                  {displayedRecords.map((record) => (
                    <tr key={record.id} className="border-b border-ink/5 last:border-0">
                      <td className="whitespace-nowrap p-3 text-center font-mono">{formatShortDate(record.attendanceDate)}</td>
                      <td className="whitespace-nowrap p-3 text-center"><span className="font-semibold">{record.employeeName}</span><span className="block text-xs text-ink-soft">{record.department || ''}</span>{isOffsite(record) && <span className="block text-xs font-semibold">งานนอกสถานที่ · {record.offsite?.destination || record.offSiteDetails}</span>}{record.edited && <span className="block text-xs font-semibold">แก้ไขแล้ว</span>}</td>
                      {ATTENDANCE_EVENTS.map((event) => <td key={event.id} className="whitespace-nowrap p-3 text-center"><MapsLink scan={getAttendanceEvents(record)[event.id]} /></td>)}
                      <td className="whitespace-nowrap p-3 text-center font-mono">{getAttendanceLateMinutes(record)} นาที</td>
                      <td className="whitespace-nowrap p-3 text-center font-mono">{getAttendanceLateMinutes(record)}</td>
                      <td className="whitespace-nowrap p-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {isOffsite(record) ? <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => cancelOffsite(record)}>ยกเลิกนอกสถานที่</button> : <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => beginEditAttendance(record)}>แก้ไข</button>}
                          <button type="button" className="px-2 py-1 text-xs font-semibold text-clay hover:bg-clay-light" onClick={() => deleteAttendanceRecord(record)}>ลบ</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {displayedRecords.length === 0 && <tr><td colSpan={ATTENDANCE_EVENTS.length + 5} className="p-8 text-center text-ink-soft">ไม่มีรายการลงเวลาในเดือนที่เลือก</td></tr>}
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
              <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3">
                {ATTENDANCE_EVENTS.map((attendanceEvent) => (
                  <label key={attendanceEvent.id} className="min-w-0 text-sm text-ink-soft">{attendanceEvent.label}
                    <input type="time" className="input-field mt-1" value={attendanceEditTimes[attendanceEvent.id] || ''} onChange={(event) => setAttendanceEditTimes((current) => ({ ...current, [attendanceEvent.id]: event.target.value }))} />
                  </label>
                ))}
              </div>
              <label className="block text-sm">เหตุผล<input className="input-field mt-1" value={attendanceEditReason} onChange={(event) => setAttendanceEditReason(event.target.value)} required /></label>
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
