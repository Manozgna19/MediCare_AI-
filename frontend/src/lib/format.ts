export const label = (s: string) => s.replace(/_/g, ' ')
export const fmtDate = (s: string) => new Date(s).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
export const fmtTime = (s: string) => new Date(s).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
export const fmtDateTime = (s: string) => `${fmtDate(s)}, ${fmtTime(s)}`

export function dayLabel(s: string): string {
  const d = new Date(s); const t = new Date(); t.setHours(0, 0, 0, 0)
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - t.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
}
export const whenLabel = (s: string) => `${dayLabel(s)} at ${fmtTime(s)}`
export const initials = (n: string) => n.replace(/^Dr\.?\s*/i, '').split(' ').map((w) => w[0]).slice(0, 2).join('')
export const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' }
