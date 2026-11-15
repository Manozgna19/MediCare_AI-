const COLORS = ['#D6453D', '#E8A317', '#2F9E6B', '#5B7FD6', '#A05BC9', '#1F9CA8']
const MALE = new Set(['father', 'brother', 'son', 'grandfather', 'uncle', 'nephew'])

type Entry = { relation: string; condition: string; age_at_diagnosis?: number | null; side?: string | null }
type Node = { key: string; rel: string; x: number; y: number; male: boolean }
const NODES: Node[] = [
  { key: 'pgf', rel: 'grandfather', x: 85, y: 44, male: true }, { key: 'pgm', rel: 'grandmother', x: 185, y: 44, male: false },
  { key: 'mgf', rel: 'grandfather', x: 415, y: 44, male: true }, { key: 'mgm', rel: 'grandmother', x: 515, y: 44, male: false },
  { key: 'father', rel: 'father', x: 135, y: 168, male: true }, { key: 'mother', rel: 'mother', x: 465, y: 168, male: false },
  { key: 'brother', rel: 'brother', x: 190, y: 292, male: true }, { key: 'me', rel: 'you', x: 300, y: 292, male: false }, { key: 'sister', rel: 'sister', x: 410, y: 292, male: false },
  { key: 'son', rel: 'son', x: 240, y: 400, male: true }, { key: 'daughter', rel: 'daughter', x: 360, y: 400, male: false },
]
const nodeFor = (e: Entry): string | null => {
  const r = e.relation.toLowerCase(); const maternal = e.side === 'maternal'
  if (r === 'grandfather') return maternal ? 'mgf' : 'pgf'
  if (r === 'grandmother') return maternal ? 'mgm' : 'pgm'
  return ['father', 'mother', 'brother', 'sister', 'son', 'daughter'].includes(r) ? r : null
}

export default function Pedigree({ entries }: { entries: Entry[] }) {
  const conditions = [...new Set(entries.map((e) => e.condition.toLowerCase()))]
  const color = (c: string) => COLORS[conditions.indexOf(c.toLowerCase()) % COLORS.length]
  const by: Record<string, Entry[]> = {}; const other: Entry[] = []
  entries.forEach((e) => { const k = nodeFor(e); if (k) (by[k] ??= []).push(e); else other.push(e) })
  const line = (x1: number, y1: number, x2: number, y2: number) => <path d={`M${x1} ${y1}V${(y1 + y2) / 2}H${x2}V${y2}`} fill="none" className="stroke-line" strokeWidth={2} />
  const summary = entries.length ? `Family tree showing ${entries.map((e) => `${e.relation} with ${e.condition}`).join(', ')}` : 'Empty family tree'

  return (
    <div>
      <svg viewBox="0 0 600 440" className="w-full" role="img" aria-label={summary}>
        <path d="M110 44h0H160" className="stroke-line" strokeWidth={2} /><path d="M440 44h50" className="stroke-line" strokeWidth={2} />
        {line(135, 44, 135, 146)}{line(465, 44, 465, 146)}
        <path d="M157 168H443" className="stroke-line" strokeWidth={2} />{line(300, 168, 300, 270)}{line(300, 292, 300, 378)}
        {line(300, 270, 190, 270)}{line(300, 270, 410, 270)}
        {NODES.map((n) => {
          const es = by[n.key] ?? []; const first = es[0]; const me = n.key === 'me'
          const fill = first ? color(first.condition) : 'rgb(var(--sunken))'
          return (
            <g key={n.key}>
              <title>{es.map((e) => `${e.condition}${e.age_at_diagnosis ? ` (age ${e.age_at_diagnosis})` : ''}`).join(', ') || n.rel}</title>
              {n.male ? <rect x={n.x - 22} y={n.y - 22} width={44} height={44} rx={6} fill={fill} className="stroke-ink/40" strokeWidth={me ? 3 : 1.5} /> : <circle cx={n.x} cy={n.y} r={22} fill={fill} className="stroke-ink/40" strokeWidth={me ? 3 : 1.5} />}
              {es.slice(1, 4).map((e, i) => <circle key={i} cx={n.x - 12 + i * 12} cy={n.y + 34} r={5} fill={color(e.condition)} />)}
              {first && es.length > 0 && <text x={n.x} y={n.y + 5} textAnchor="middle" className="fill-white text-[13px] font-bold">{es.length}</text>}
              <text x={n.x} y={n.y + (es.length > 1 ? 52 : 42)} textAnchor="middle" className="fill-ink text-[12px] font-semibold capitalize">{n.rel}</text>
            </g>)
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">{conditions.map((c) => <span key={c} className="inline-flex items-center gap-1.5 capitalize"><i className="h-3 w-3 rounded-full" style={{ background: color(c) }} />{c}</span>)}
        <span className="text-muted">Squares are male relatives, circles are female.</span></div>
      {other.length > 0 && <p className="mt-2 text-sm text-muted">Also recorded: {other.map((e) => `${e.relation} (${e.condition})`).join(', ')}.</p>}
    </div>
  )
}
