import sharp from 'sharp'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = resolve(ROOT, 'public/brand/ssc-go-icon-source.png')
const PREVIEW_DIR = resolve(ROOT, 'dist/ssc-go-icon-previews')
const MASTER_VARIANT = process.env.SSC_GO_MASTER_VARIANT || 'A'
const APPLE_METHOD = process.env.SSC_GO_APPLE_METHOD || 'gradient'
const IS_PREVIEW = process.argv.includes('--preview-only')
const MASTER_SIZE = 1024
const SAFE_MARGIN = 0.06
const BACKGROUND = ['#1CF7FD', '#0968D2', '#011979']

function colorChroma(red, green, blue) {
  return Math.max(red, green, blue) - Math.min(red, green, blue)
}

function findBounds(data, width, height, predicate) {
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4
      if (predicate(data[offset], data[offset + 1], data[offset + 2], data[offset + 3])) {
        left = Math.min(left, x)
        top = Math.min(top, y)
        right = Math.max(right, x)
        bottom = Math.max(bottom, y)
      }
    }
  }
  if (right < left || bottom < top) throw new Error('Could not find icon content bounds in source image.')
  return { left, top, width: right - left + 1, height: bottom - top + 1 }
}

function expandBounds(bounds, padding, width, height) {
  const left = Math.max(0, bounds.left - padding)
  const top = Math.max(0, bounds.top - padding)
  const right = Math.min(width, bounds.left + bounds.width + padding)
  const bottom = Math.min(height, bounds.top + bounds.height + padding)
  return { left, top, width: right - left, height: bottom - top }
}

function cleanLowAlpha(data) {
  for (let index = 3; index < data.length; index += 4) {
    const alpha = data[index]
    if (alpha < 52) data[index] = 0
    else if (alpha < 112) data[index] = Math.round(((alpha - 52) / 60) * alpha)
  }
  return data
}

function roundedMask(width, height, radius) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" rx="${radius}" fill="#fff"/></svg>`
  return Buffer.from(svg)
}

async function createMaster(sourceRaw, variant, bounds) {
  const cropBounds = variant === 'A' ? bounds.content : bounds.blueBody
  const crop = await sharp(sourceRaw.data, { raw: sourceRaw.info })
    .extract(cropBounds)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const pixels = cleanLowAlpha(crop.data)
  let artwork = sharp(pixels, { raw: crop.info })
  if (variant === 'B') {
    artwork = artwork.composite([{
      input: roundedMask(crop.info.width, crop.info.height, Math.round(Math.min(crop.info.width, crop.info.height) * 0.235)),
      blend: 'dest-in',
    }])
  }
  const artBuffer = await artwork.png().toBuffer()
  const available = Math.round(MASTER_SIZE * (1 - SAFE_MARGIN * 2))
  const resized = await sharp(artBuffer)
    .resize(available, available, { fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' })
    .png()
    .toBuffer()
  const resizedMeta = await sharp(resized).metadata()
  const left = Math.round((MASTER_SIZE - resizedMeta.width) / 2)
  const top = Math.round((MASTER_SIZE - resizedMeta.height) / 2)
  return sharp({
    create: { width: MASTER_SIZE, height: MASTER_SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: resized, left, top }]).png().toBuffer()
}

function gradientSvg(size) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${BACKGROUND[0]}"/><stop offset="48%" stop-color="${BACKGROUND[1]}"/><stop offset="100%" stop-color="${BACKGROUND[2]}"/></linearGradient></defs><rect width="${size}" height="${size}" fill="url(#g)"/></svg>`)
}

async function composeGradient(master, size, scale = 1) {
  const scaledSize = Math.round(size * scale)
  let foreground = await sharp(master).resize(scaledSize, scaledSize, { fit: 'contain' }).png().toBuffer()
  if (scaledSize > size) {
    const crop = Math.floor((scaledSize - size) / 2)
    foreground = await sharp(foreground).extract({ left: crop, top: crop, width: size, height: size }).png().toBuffer()
  }
  return sharp(gradientSvg(size)).composite([{ input: foreground, left: 0, top: 0 }]).png().toBuffer()
}

async function simulateMask(image, size, shape) {
  const maskMarkup = shape === 'circle'
    ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.4}" fill="#fff"/>`
    : `<rect x="0" y="0" width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="#fff"/>`
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${maskMarkup}</svg>`)
  return sharp(image).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
}

async function checkerPreview(image, size = 256) {
  const tile = 16
  const checker = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="#eef2f7"/><path d="M0 0h${tile}v${tile}H0zM${tile} ${tile}h${tile}v${tile}H${tile}z" fill="#dce3ec"/></svg>`)
  const foreground = await sharp(image).resize(size, size, { fit: 'contain' }).png().toBuffer()
  return sharp(checker).composite([{ input: foreground }]).png().toBuffer()
}

async function makeSheet(items, outputPath, { columns = 2, cellWidth = 330, cellHeight = 340 } = {}) {
  const padding = 20
  const headerHeight = 48
  const rows = Math.ceil(items.length / columns)
  const width = padding * 2 + columns * cellWidth
  const height = headerHeight + padding + rows * cellHeight + padding
  const elements = [`<rect width="100%" height="100%" fill="#f3f6fa"/>`]
  elements.push(`<text x="${padding}" y="32" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#1B2A4A">SSC GO ICON PREVIEW</text>`)
  const composites = []
  for (let index = 0; index < items.length; index++) {
    const column = index % columns
    const row = Math.floor(index / columns)
    const x = padding + column * cellWidth
    const y = headerHeight + padding + row * cellHeight
    elements.push(`<rect x="${x}" y="${y}" width="${cellWidth - 12}" height="${cellHeight - 12}" rx="12" fill="#fff" stroke="#d8e0e9"/>`)
    elements.push(`<text x="${x + 12}" y="${y + 23}" font-family="Arial,sans-serif" font-size="13" font-weight="600" fill="#1B2A4A">${items[index].label}</text>`)
    composites.push({ input: items[index].image, left: x + Math.round((cellWidth - 12 - 256) / 2), top: y + 36 })
  }
  const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${elements.join('')}</svg>`)
  const output = await sharp(background).composite(composites).png().toBuffer()
  await writeFile(outputPath, output)
  return output
}

function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1CF7FD"/><stop offset="52%" stop-color="#0968D2"/><stop offset="100%" stop-color="#011979"/></linearGradient></defs><rect x="2" y="2" width="60" height="60" rx="15" fill="url(#g)"/><rect x="13" y="17" width="38" height="35" rx="6" fill="#fff"/><path d="M13 24h38" stroke="#b9ebf7" stroke-width="7"/><path d="M22 15v8M42 15v8" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="m22 38 6 6 14-15" fill="none" stroke="#16a34a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
}

async function makeIco(entries) {
  const header = Buffer.alloc(6 + entries.length * 16)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)
  let offset = header.length
  const payloads = []
  entries.forEach(({ size, png }, index) => {
    const base = 6 + index * 16
    header.writeUInt8(size === 256 ? 0 : size, base)
    header.writeUInt8(size === 256 ? 0 : size, base + 1)
    header.writeUInt8(0, base + 2)
    header.writeUInt8(0, base + 3)
    header.writeUInt16LE(1, base + 4)
    header.writeUInt16LE(32, base + 6)
    header.writeUInt32LE(png.length, base + 8)
    header.writeUInt32LE(offset, base + 12)
    offset += png.length
    payloads.push(png)
  })
  return Buffer.concat([header, ...payloads])
}

async function generatePreviews(masters, faviconPngs) {
  await mkdir(PREVIEW_DIR, { recursive: true })
  const anyItems = []
  for (const variant of ['A', 'B']) {
    for (const size of [192, 512]) {
      const icon = await sharp(masters[variant]).resize(size, size).png().toBuffer()
      await writeFile(resolve(PREVIEW_DIR, `icon-${variant}-${size}-any.png`), icon)
      anyItems.push({ label: `ICON ${variant} / ${size}px any`, image: await checkerPreview(icon) })
    }
  }
  await makeSheet(anyItems, resolve(PREVIEW_DIR, 'any-icon-sizes.png'))

  const masterItems = []
  for (const variant of ['A', 'B']) {
    masterItems.push({ label: `MASTER ${variant} (transparent corners)`, image: await checkerPreview(masters[variant]) })
  }
  await makeSheet(masterItems, resolve(PREVIEW_DIR, 'master-options.png'))

  const appleItems = []
  for (const variant of ['A', 'B']) {
    for (const [method, scale, label] of [['gradient', 1, 'gradient fill'], ['crop', 1.1, '110% crop']]) {
      const square = await composeGradient(masters[variant], 180, scale)
      const simulated = await simulateMask(square, 180, 'rounded')
      appleItems.push({ label: `iOS ${variant} / ${label}`, image: await checkerPreview(simulated) })
    }
  }
  await makeSheet(appleItems, resolve(PREVIEW_DIR, 'apple-options.png'))

  const adaptiveItems = []
  for (const variant of ['A', 'B']) {
    const maskable = await composeGradient(masters[variant], 512, 0.82)
    const circle = await simulateMask(maskable, 512, 'circle')
    const rounded = await simulateMask(maskable, 512, 'rounded')
    adaptiveItems.push({ label: `MASKABLE ${variant} / circle crop`, image: await checkerPreview(circle) })
    adaptiveItems.push({ label: `MASKABLE ${variant} / rounded crop`, image: await checkerPreview(rounded) })
  }
  await makeSheet(adaptiveItems, resolve(PREVIEW_DIR, 'maskable-options.png'), { columns: 2, cellWidth: 330, cellHeight: 340 })

  const faviconItems = []
  faviconItems.push({ label: 'FAVICON 32px', image: await checkerPreview(faviconPngs[32]) })
  faviconItems.push({ label: 'FAVICON 16px (nearest-neighbor enlarged)', image: await checkerPreview(await sharp(faviconPngs[16]).resize(256, 256, { kernel: 'nearest' }).png().toBuffer()) })
  await makeSheet(faviconItems, resolve(PREVIEW_DIR, 'favicon-options.png'))

  for (const variant of ['A', 'B']) await writeFile(resolve(PREVIEW_DIR, `master-${variant}.png`), masters[variant])
  for (const variant of ['A', 'B']) {
    for (const [method, scale] of [['gradient', 1], ['crop', 1.1]]) {
      const square = await composeGradient(masters[variant], 180, scale)
      await writeFile(resolve(PREVIEW_DIR, `apple-${variant}-${method}-square.png`), square)
    }
    const maskable = await composeGradient(masters[variant], 512, 0.82)
    await writeFile(resolve(PREVIEW_DIR, `maskable-${variant}-512.png`), maskable)
  }
  await writeFile(resolve(PREVIEW_DIR, 'favicon-32.png'), faviconPngs[32])
  await writeFile(resolve(PREVIEW_DIR, 'favicon-16.png'), faviconPngs[16])
}

async function main() {
  const source = await readFile(SOURCE)
  const decoded = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = decoded.info
  const content = findBounds(decoded.data, width, height, (red, green, blue, alpha) => alpha > 180 && colorChroma(red, green, blue) > 55)
  const blueBody = findBounds(decoded.data, width, height, (red, green, blue, alpha) => alpha > 180 && blue > red * 1.15 && blue > green * 0.85 && blue - red > 25)
  const bounds = { content: expandBounds(content, 4, width, height), blueBody: expandBounds(blueBody, 4, width, height) }
  console.log(`Source: ${width}x${height}, alpha=${decoded.info.channels === 4}`)
  console.log(`Artwork A bounds: ${JSON.stringify(bounds.content)}`)
  console.log(`Rounded base B bounds: ${JSON.stringify(bounds.blueBody)}`)

  const masters = {
    A: await createMaster(decoded, 'A', bounds),
    B: await createMaster(decoded, 'B', bounds),
  }
  const favicon = Buffer.from(faviconSvg())
  const faviconPngs = {
    16: await sharp(favicon).resize(16, 16).png().toBuffer(),
    32: await sharp(favicon).resize(32, 32).png().toBuffer(),
  }

  if (IS_PREVIEW) {
    await generatePreviews(masters, faviconPngs)
    console.log(`Preview images written to ${PREVIEW_DIR}`)
    return
  }

  if (!['A', 'B'].includes(MASTER_VARIANT)) throw new Error('SSC_GO_MASTER_VARIANT must be A or B.')
  if (!['gradient', 'crop'].includes(APPLE_METHOD)) throw new Error('SSC_GO_APPLE_METHOD must be gradient or crop.')

  const master = masters[MASTER_VARIANT]
  await mkdir(resolve(ROOT, 'public/brand'), { recursive: true })
  await writeFile(resolve(ROOT, 'public/brand/ssc-go-master.png'), master)
  await writeFile(resolve(ROOT, 'public/icon-192.png'), await sharp(master).resize(192, 192).png().toBuffer())
  await writeFile(resolve(ROOT, 'public/icon-512.png'), await sharp(master).resize(512, 512).png().toBuffer())
  await writeFile(resolve(ROOT, 'public/apple-touch-icon.png'), await composeGradient(master, 180, APPLE_METHOD === 'crop' ? 1.1 : 1))
  await writeFile(resolve(ROOT, 'public/icon-maskable-512.png'), await composeGradient(master, 512, 0.82))
  await writeFile(resolve(ROOT, 'public/favicon.svg'), favicon)
  await writeFile(resolve(ROOT, 'public/favicon-32.png'), faviconPngs[32])
  await writeFile(resolve(ROOT, 'public/favicon.ico'), await makeIco([
    { size: 16, png: faviconPngs[16] },
    { size: 32, png: faviconPngs[32] },
  ]))
  console.log(`Generated SSC GO icons using master ${MASTER_VARIANT} and iOS ${APPLE_METHOD} method.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
