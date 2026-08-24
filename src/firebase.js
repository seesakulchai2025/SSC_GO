import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, signInAnonymously } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)

// ประเภทการลาที่ระบบรองรับ — กำหนดตายตัวไว้ 3 ประเภทเท่านั้น
// ลากิจ/ลาป่วย มีโควตามาตรฐานต่อปี ส่วนลาคลอดไม่ตั้งค่าเริ่มต้นไว้
// เพราะต้องกำหนดจำนวนวันเพิ่มเติมเป็นรายบุคคล (ดูหน้า "พนักงาน" ในระบบแอดมิน)
export const FIXED_LEAVE_TYPES = [
  { name: 'ลาป่วย', defaultDays: 14, order: 0 },
  { name: 'ลากิจ', defaultDays: 7, order: 1 },
  { name: 'ลาคลอดบุตร', defaultDays: 0, order: 2 },
]

// เราใช้ PIN ของบริษัทเองเป็นระบบล็อกอินหลัก (ไม่ใช้อีเมล/รหัสผ่านของ Firebase)
// แต่ Firestore ยังต้องการให้ผู้ใช้ "sign in" แบบใดแบบหนึ่งก่อนถึงจะอ่าน/เขียนข้อมูลได้ตาม Security Rules
// จึงใช้ Anonymous Auth เป็นตั๋วผ่านประตูเบื้องหลัง โดยผู้ใช้ไม่เห็นขั้นตอนนี้เลย
export async function ensureAnonymousSession() {
  if (!auth.currentUser) {
    await signInAnonymously(auth)
  }
  return auth.currentUser
}
