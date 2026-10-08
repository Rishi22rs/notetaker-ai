export const DOWNLOADS = {
  mac: {
    name: 'macOS',
    detail: 'Apple silicon · macOS 14.2+',
    url: import.meta.env.VITE_MAC_DOWNLOAD_URL || '/downloads/UNYON-1.0.0-arm64.dmg',
    available: import.meta.env.VITE_MAC_DOWNLOAD_ENABLED !== 'false',
  },
  windows: {
    name: 'Windows',
    detail: '64-bit · Windows 10+',
    url: import.meta.env.VITE_WINDOWS_DOWNLOAD_URL || '/downloads/UNYON-Setup-1.0.0.exe',
    available: import.meta.env.VITE_WINDOWS_DOWNLOAD_ENABLED === 'true',
  },
}

export function detectPlatform() {
  if (typeof navigator === 'undefined') return 'other'
  const platform = navigator.userAgentData?.platform || navigator.platform || ''
  const userAgent = navigator.userAgent || ''
  if (/mac/i.test(platform) || /macintosh|mac os x/i.test(userAgent)) return 'mac'
  if (/win/i.test(platform) || /windows/i.test(userAgent)) return 'windows'
  return 'other'
}
