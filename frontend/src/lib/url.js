/**
 * Returns true only for absolute http/https URLs.
 * Pure ESM — no browser or Vue dependencies.
 */
export function isHttpUrl(val) {
  if (typeof val !== 'string') return false
  const trimmed = val.trim()
  if (!trimmed) return false
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
