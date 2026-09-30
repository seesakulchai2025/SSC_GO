export function parseGoogleMapsCoordinates(input) {
  if (!input?.trim()) return null
  let value = input.trim()
  try {
    value = decodeURIComponent(value.replace(/\+/g, ' '))
  } catch {
    return null
  }

  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i,
    /[?&](?:q|query|center)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i,
    /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/,
  ]

  for (const pattern of patterns) {
    const match = value.match(pattern)
    if (!match) continue
    const latitude = Number(match[1])
    const longitude = Number(match[2])
    if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
      return { latitude, longitude }
    }
  }

  return null
}
