import { WEEKDAY_SHORT } from '@/domain/dates'
import { describeRecurrence } from '@/domain/recurrence'
import type { Pool, Recurrence, Weekday } from '@/domain/types'
import { cn } from '@/lib/cn'
import { Field, Input } from './ui'

export type RecurrenceValue = Pick<Pool, 'recurrence' | 'visitDays' | 'monthDays' | 'anchorDate' | 'preferredTime'>

const MODES: Array<{ value: Exclude<Recurrence, 'none'>; label: string }> = [
  { value: 'weekly', label: 'Toda semana' },
  { value: 'biweekly', label: 'A cada 2 sem.' },
  { value: 'monthly', label: 'Todo mês' },
]
// Segunda primeiro, como o piscineiro pensa a semana.
const WEEK_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0]

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

export function RecurrenceEditor({ value, onChange }: { value: RecurrenceValue; onChange: (v: RecurrenceValue) => void }) {
  const mode = value.recurrence === 'none' ? 'weekly' : value.recurrence
  const set = (patch: Partial<RecurrenceValue>) => onChange({ ...value, ...patch, recurrence: patch.recurrence ?? mode })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-200/50 p-1" role="radiogroup" aria-label="Frequência">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={mode === m.value}
            onClick={() => set({ recurrence: m.value })}
            className={cn('h-9 rounded-xl text-[13px] font-semibold', mode === m.value ? 'bg-white text-brand-700 shadow-card' : 'text-slate-500')}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'monthly' ? (
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-slate-600">Dias do mês</legend>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
              const on = value.monthDays.includes(d)
              return (
                <button key={d} type="button" aria-pressed={on} onClick={() => set({ monthDays: toggle(value.monthDays, d).sort((a, b) => a - b) })}
                  className={cn('h-10 rounded-xl text-sm font-semibold tabular-nums', on ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/25' : 'bg-slate-50 text-slate-700 hover:bg-slate-100')}>
                  {d}
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">Dias 29–31 caem no último dia nos meses mais curtos.</p>
        </fieldset>
      ) : (
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-slate-600">Dias da semana</legend>
          <div className="grid grid-cols-7 gap-1.5">
            {WEEK_ORDER.map((d) => {
              const on = value.visitDays.includes(d)
              return (
                <button key={d} type="button" aria-pressed={on} onClick={() => set({ visitDays: toggle(value.visitDays, d).sort() })}
                  className={cn('h-12 rounded-xl text-[13px] font-semibold', on ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/25' : 'bg-slate-50 text-slate-700 hover:bg-slate-100')}>
                  {WEEKDAY_SHORT[d]}
                </button>
              )
            })}
          </div>
        </fieldset>
      )}

      <div className={cn('grid gap-3', mode === 'biweekly' ? 'grid-cols-2' : 'grid-cols-1')}>
        <Field label="Horário combinado (opcional)">
          <Input type="time" value={value.preferredTime ?? ''} onChange={(e) => set({ preferredTime: e.target.value || null })} />
        </Field>
        {mode === 'biweekly' && (
          <Field label="A partir da semana de">
            <Input type="date" required value={value.anchorDate ?? ''} onChange={(e) => set({ anchorDate: e.target.value || null })} />
          </Field>
        )}
      </div>

      <p className="rounded-xl bg-brand-50 px-3 py-2.5 text-sm font-medium text-brand-800">
        {describeRecurrence({ ...value, recurrence: mode }, value.preferredTime)}
      </p>
    </div>
  )
}
