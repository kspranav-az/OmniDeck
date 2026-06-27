import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso))
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (!Number.isFinite(bytes) || bytes < 0) return '-'

  const k = 1024
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), BYTE_UNITS.length - 1)
  const value = bytes / Math.pow(k, i)
  return `${value.toFixed(i === 0 ? 0 : 1)} ${BYTE_UNITS[i]}`
}

export function formatRelativeTime(date: Date | string): string {
  const rtf = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' })
  const now = Date.now()
  const then = new Date(date).getTime()
  const seconds = Math.round((then - now) / 1000)

  const abs = Math.abs(seconds)
  if (abs < 60) return rtf.format(seconds, 'second')
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour')
  if (abs < 604800) return rtf.format(Math.round(seconds / 86400), 'day')
  if (abs < 2628000) return rtf.format(Math.round(seconds / 604800), 'week')
  if (abs < 31536000) return rtf.format(Math.round(seconds / 2628000), 'month')
  return rtf.format(Math.round(seconds / 31536000), 'year')
}

export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'absolute'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    document.execCommand('copy')
  } finally {
    document.body.removeChild(textarea)
  }
}

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function credentialsToEnv(credentials: Record<string, any>): string {
  return Object.entries(credentials)
    .map(([key, value]) => {
      const envKey = key.replace(/\s+/g, '_').toUpperCase()
      let envValue = ''
      if (value !== undefined && value !== null) {
        envValue = typeof value === 'object' ? JSON.stringify(value) : String(value)
      }
      return `${envKey}=${envValue}`
    })
    .join('\n')
}
