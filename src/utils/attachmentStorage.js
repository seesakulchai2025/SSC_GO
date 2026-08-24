// เก็บไฟล์แนบไว้ใน Firestore โดยตรง (ไม่ใช้ Firebase Storage เพื่อไม่ต้องอัปเกรดเป็น Blaze Plan)
// Firestore แต่ละเอกสารมีขนาดจำกัดไม่เกิน 1MB จึงต้องบีบอัดไฟล์ก่อนแปลงเป็น base64
const MAX_BASE64_LENGTH = 700 * 1024 // ประมาณ ~500KB ไฟล์จริงหลังถอดรหัส เผื่อพื้นที่ให้ข้อมูลอื่นในเอกสาร

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = dataUrl
  })
}

async function compressImage(file, maxDim, quality) {
  const original = await readAsDataURL(file)
  const img = await loadImage(original)
  let { width, height } = img
  if (width > maxDim || height > maxDim) {
    if (width > height) {
      height = Math.round((height * maxDim) / width)
      width = maxDim
    } else {
      width = Math.round((width * maxDim) / height)
      height = maxDim
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', quality)
}

// แปลงไฟล์ (รูปภาพหรือ PDF) ให้เป็น data URL พร้อมบีบอัดถ้าจำเป็น
// คืนค่า { data, name, type } หรือโยน error พร้อมข้อความที่แสดงให้ผู้ใช้เห็นได้เลย
export async function fileToAttachment(file) {
  if (file.type === 'application/pdf') {
    const dataUrl = await readAsDataURL(file)
    if (dataUrl.length > MAX_BASE64_LENGTH) {
      throw new Error('ไฟล์ PDF ใหญ่เกินไป (ควรมีขนาดไม่เกิน 500KB) กรุณาบีบอัดไฟล์ หรือถ่ายภาพหน้าจอแนบเป็นรูปภาพแทน')
    }
    return { data: dataUrl, name: file.name, type: file.type }
  }

  if (file.type.startsWith('image/')) {
    let maxDim = 1400
    let quality = 0.75
    let dataUrl = await compressImage(file, maxDim, quality)
    let attempts = 0
    while (dataUrl.length > MAX_BASE64_LENGTH && attempts < 5) {
      quality = Math.max(quality - 0.15, 0.3)
      maxDim = Math.max(maxDim - 200, 500)
      dataUrl = await compressImage(file, maxDim, quality)
      attempts++
    }
    if (dataUrl.length > MAX_BASE64_LENGTH) {
      throw new Error('ไฟล์รูปภาพใหญ่เกินไปแม้บีบอัดแล้ว กรุณาเลือกรูปอื่นหรือถ่ายใหม่ให้ไฟล์เล็กลง')
    }
    return { data: dataUrl, name: file.name.replace(/\.[^.]+$/, '.jpg'), type: 'image/jpeg' }
  }

  throw new Error('รองรับเฉพาะไฟล์รูปภาพหรือ PDF เท่านั้น')
}
