import { KeyboardEvent } from 'react'

export const REGIONS: Record<string, { label: string; symptoms: string[] }> = {
  head: { label: 'Head and eyes', symptoms: ['headache', 'dizziness', 'blurred_vision', 'confusion', 'slurred_speech', 'facial_droop'] },
  throat: { label: 'Throat and nose', symptoms: ['sore_throat', 'cough', 'runny_nose'] },
  chest: { label: 'Chest', symptoms: ['chest_pain', 'shortness_of_breath', 'palpitations', 'cough'] },
  abdomen: { label: 'Belly', symptoms: ['abdominal_pain', 'nausea', 'vomiting', 'diarrhea'] },
  urinary: { label: 'Urinary', symptoms: ['painful_urination', 'frequent_urination'] },
  limbs: { label: 'Arms, legs and joints', symptoms: ['joint_pain', 'limb_weakness', 'swelling_legs'] },
  back: { label: 'Back', symptoms: ['back_pain'] },
  body: { label: 'Whole body', symptoms: ['fever', 'fatigue', 'rash', 'excess_thirst', 'fainting', 'severe_bleeding'] },
}

type Shape = { id: string; el: 'circle' | 'rect'; p: Record<string, number> }
const SHAPES: Shape[] = [
  { id: 'head', el: 'circle', p: { cx: 100, cy: 38, r: 27 } },
  { id: 'throat', el: 'rect', p: { x: 88, y: 66, width: 24, height: 20, rx: 8 } },
  { id: 'chest', el: 'rect', p: { x: 62, y: 90, width: 76, height: 66, rx: 16 } },
  { id: 'abdomen', el: 'rect', p: { x: 66, y: 160, width: 68, height: 54, rx: 14 } },
  { id: 'urinary', el: 'rect', p: { x: 72, y: 218, width: 56, height: 34, rx: 14 } },
  { id: 'limbs', el: 'rect', p: { x: 30, y: 94, width: 26, height: 124, rx: 13 } },
  { id: 'limbs', el: 'rect', p: { x: 144, y: 94, width: 26, height: 124, rx: 13 } },
  { id: 'limbs', el: 'rect', p: { x: 72, y: 258, width: 26, height: 140, rx: 13 } },
  { id: 'limbs', el: 'rect', p: { x: 102, y: 258, width: 26, height: 140, rx: 13 } },
]

export default function BodyMap({ region, onSelect }: { region: string | null; onSelect: (r: string) => void }) {
  const key = (r: string) => (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(r) } }
  return (
    <svg viewBox="0 0 200 410" className="w-full max-w-[210px] mx-auto" role="group" aria-label="Body map. Choose where you feel symptoms.">
      {SHAPES.map((s, i) => {
        const on = region === s.id
        const common = {
          role: 'button', tabIndex: i === SHAPES.findIndex((x) => x.id === s.id) ? 0 : -1, 'aria-label': REGIONS[s.id].label, 'aria-pressed': on,
          onClick: () => onSelect(s.id), onKeyDown: key(s.id), strokeWidth: 2,
          className: `cursor-pointer transition-colors stroke-line ${on ? 'fill-primary' : 'fill-sunken hover:fill-primary-soft'}`,
        }
        return s.el === 'circle' ? <circle key={i} {...common} {...(s.p as any)} /> : <rect key={i} {...common} {...(s.p as any)} />
      })}
    </svg>
  )
}
