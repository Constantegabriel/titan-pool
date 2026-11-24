import {
  ArrowRight, CalendarDays, Camera, Car, Check, CheckCircle2, ChevronDown, Clock, FileText, FlaskConical, MapPin, Menu,
  Route as RouteIcon, Send, ShoppingBag, Sparkles, Wallet, X,
} from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { rpc, supabase } from '@/data'
import { IDEAL_RANGES, type ReadingKey, classify, suggestCorrections } from '@/domain/chemistry'
import { whatsappLink } from '@/domain/format'
import { haversineKm, optimizeOrder, ROAD_FACTOR } from '@/domain/route'
import { cn } from '@/lib/cn'
import { prefersReducedMotion, useReveal } from '@/lib/use-reveal'
import { Brand } from './auth'

const YEAR = new Date().getFullYear()

type Settings = { trial_days: number; allow_self_signup: boolean; support_whatsapp: string }

function Cta({ signup, contact, trialDays, className, light }: { signup: string | null; contact: string | null; trialDays: number; className?: string; light?: boolean }) {
  const cls = cn(
    'group inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-base font-semibold transition-all active:scale-[0.98]',
    light ? 'bg-white text-brand-700 hover:bg-brand-50' : 'bg-brand-600 text-white shadow-float hover:bg-brand-700',
    className,
  )
  const arrow = <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" aria-hidden />
  if (signup) return <Link to={signup} className={cls}>Testar grátis por {trialDays} dias {arrow}</Link>
  if (!contact) return null
  return <a href={contact} target="_blank" rel="noopener noreferrer" className={cls}>Quero conhecer {arrow}</a>
}

/** Roda um passo a cada `ms` enquanto o elemento está na tela (e só se o sistema permite animação). */
function useTicker(steps: number, ms: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(prefersReducedMotion() ? 1 : 0)
  useEffect(() => {
    if (prefersReducedMotion() || !ref.current) return
    let visible = false
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting })
    io.observe(ref.current)
    const id = setInterval(() => { if (visible) setStep((s) => (s + 1) % steps) }, ms)
    return () => { clearInterval(id); io.disconnect() }
  }, [steps, ms])
  return { ref, step }
}

export function LandingPage() {
  const [settings, setSettings] = useState<Settings>({ trial_days: 14, allow_self_signup: true, support_whatsapp: '' })
  const [menu, setMenu] = useState(false)
  useReveal()
  useEffect(() => {
    if (supabase) rpc<Settings>('public_settings').then(setSettings).catch(() => {})
    document.title = 'Titan Pool · O app do piscineiro'
    return () => { document.title = 'Titan Pool' }
  }, [])
  const signup = settings.allow_self_signup ? '/cadastro' : null
  const contact = settings.support_whatsapp ? whatsappLink(settings.support_whatsapp, 'Olá! Quero conhecer o Titan Pool.') : null
  const cta = { signup, contact, trialDays: settings.trial_days }
  const links = [['#recursos', 'Recursos'], ['#rota', 'Rota'], ['#agua', 'Análise da água'], ['#planos', 'Planos'], ['#duvidas', 'Dúvidas']]

  return (
    <div className="min-h-svh overflow-x-hidden bg-white text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-100/80 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Brand />
          <nav className="hidden gap-7 text-sm font-medium text-slate-600 lg:flex">
            {links.map(([h, l]) => <a key={h} href={h} className="transition-colors hover:text-brand-700">{l}</a>)}
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/entrar" className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Entrar</Link>
            {signup && <Link to={signup} className="hidden rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 sm:inline-flex">Testar grátis</Link>}
            <button type="button" className="flex size-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
              {menu ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
        {menu && (
          <nav className="tp-fade border-t border-slate-100 bg-white px-4 py-3 lg:hidden">
            {links.map(([h, l]) => <a key={h} href={h} onClick={() => setMenu(false)} className="block rounded-xl px-3 py-2.5 font-medium text-slate-700 hover:bg-slate-50">{l}</a>)}
          </nav>
        )}
      </header>

      {/* Abertura */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60rem_30rem_at_70%_-10%,var(--color-brand-100),transparent),radial-gradient(40rem_20rem_at_0%_20%,var(--color-brand-50),transparent)]" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-20 md:grid-cols-[1.1fr_1fr] md:pt-20">
          <div className="tp-page">
            <p className="inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-white px-3 py-1 text-xs font-semibold text-brand-700 shadow-card">
              <Sparkles className="size-3.5" aria-hidden /> Feito para piscineiros
            </p>
            <h1 className="mt-5 text-[2.6rem] leading-[1.05] font-extrabold tracking-tight md:text-6xl">
              Sua rota, seus clientes e seu dinheiro{' '}
              <span className="bg-gradient-to-r from-brand-500 to-brand-700 bg-clip-text text-transparent">no celular.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600">
              Agenda de visitas, rota otimizada com horário de chegada, relatório da piscina pelo WhatsApp, compras e mensalidades. Simples para usar na correria.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Cta {...cta} />
              <a href="#rota" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 text-base font-semibold text-slate-700 hover:bg-slate-50">
                <RouteIcon className="size-5 text-brand-600" aria-hidden /> Ver a rota em ação
              </a>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
              {['Sem cartão de crédito', 'Pronto em 5 minutos', 'Celular e notebook'].map((t) => (
                <li key={t} className="flex items-center gap-1.5"><Check className="size-4 text-emerald-500" aria-hidden />{t}</li>
              ))}
            </ul>
          </div>
          <AnimatedPhone />
        </div>
      </section>

      {/* Recursos em abas */}
      <section id="recursos" className="scroll-mt-20 bg-canvas py-20">
        <div className="mx-auto max-w-6xl px-4">
          <SectionHead kicker="Recursos" title="Tudo que o dia a dia da piscina pede" text="Toque em cada parte para ver como funciona." />
          <FeatureTabs />
        </div>
      </section>

      {/* Rota interativa */}
      <section id="rota" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
        <SectionHead kicker="Rota inteligente" title="Menos volta, mais visitas no dia" text="Compare a ordem da lista com a rota que o Titan Pool monta. Mesmo cálculo usado no app." />
        <RouteCompare />
      </section>

      {/* Análise da água interativa */}
      <section id="agua" className="scroll-mt-20 bg-gradient-to-b from-brand-50/60 to-white py-20">
        <div className="mx-auto max-w-6xl px-4">
          <SectionHead kicker="Análise da água" title="Meça, e o app diz o que fazer" text="Mexa nos valores: é a mesma sugestão de correção que aparece no relatório da visita." />
          <WaterLab />
        </div>
      </section>

      {/* Como funciona */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <SectionHead kicker="Como funciona" title="Comece hoje, em três passos" />
        <ol className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            ['Cadastre seus clientes', 'Endereço, piscina, mensalidade e os dias de visita. A localização sai do GPS com um toque.'],
            ['Siga a rota do dia', 'De manhã as visitas já estão em ordem, com horário previsto e botão para o Maps ou Waze.'],
            ['Registre e receba', 'Relatório pelo WhatsApp, mensalidades em dia e o financeiro do mês pronto.'],
          ].map(([title, text], i) => (
            <li key={title} className="tp-reveal relative rounded-3xl border border-slate-100 bg-white p-6 shadow-card" style={{ transitionDelay: `${i * 90}ms` }}>
              <span className="flex size-11 items-center justify-center rounded-2xl bg-brand-600 text-lg font-bold text-white shadow-float">{i + 1}</span>
              <h3 className="mt-4 text-lg font-bold">{title}</h3>
              <p className="mt-1.5 text-[15px] text-slate-600">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Plano */}
      <section id="planos" className="scroll-mt-20 bg-canvas py-20">
        <div className="mx-auto max-w-6xl px-4">
          <SectionHead kicker="Planos" title="Experimente sem compromisso" />
          <div className="tp-reveal mx-auto mt-12 grid max-w-4xl overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-card md:grid-cols-2">
            <div className="bg-gradient-to-br from-brand-600 to-brand-800 p-8 text-white">
              <p className="text-sm font-semibold text-brand-100">Titan Pool completo</p>
              <p className="mt-2 text-5xl font-extrabold tracking-tight">{settings.trial_days} dias</p>
              <p className="text-xl font-semibold">grátis para testar</p>
              <p className="mt-4 text-brand-100">Sem cartão. Depois, plano mensal acessível — fale com a gente para ativar.</p>
            </div>
            <div className="p-8">
              <ul className="space-y-3 text-[15px]">
                {['Clientes e piscinas ilimitados', 'Agenda, mapa e rota otimizada', 'Relatórios, fotos e PDFs', 'Compras com fornecedores', 'Financeiro e mensalidades', 'Celular e notebook'].map((t) => (
                  <li key={t} className="flex items-center gap-2.5"><span className="flex size-5 items-center justify-center rounded-full bg-brand-50 text-brand-600"><Check className="size-3.5" aria-hidden /></span>{t}</li>
                ))}
              </ul>
              <Cta {...cta} className="mt-7 w-full" />
              {contact && <a href={contact} target="_blank" rel="noopener noreferrer" className="mt-3 block text-center text-sm font-semibold text-slate-600 hover:text-brand-700">Tirar dúvidas no WhatsApp</a>}
            </div>
          </div>
        </div>
      </section>

      {/* Dúvidas */}
      <section id="duvidas" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20">
        <SectionHead kicker="Dúvidas" title="Perguntas frequentes" />
        <div className="mt-10 space-y-3">
          {[
            ['Preciso instalar alguma coisa?', 'Não. O Titan Pool abre no navegador e pode ser adicionado à tela inicial do celular como um app.'],
            ['Funciona no celular e no notebook?', 'Sim. Os dados ficam na nuvem e aparecem iguais em qualquer aparelho em que você entrar.'],
            ['Como funciona o teste grátis?', 'Você cria a conta e usa tudo liberado durante o teste, sem cartão. Depois é só falar com a gente para continuar.'],
            ['Meus dados ficam seguros?', 'Cada conta só enxerga os próprios dados, protegidos por login e por regras no banco de dados.'],
            ['Serve para quem trabalha sozinho?', 'Sim. Foi pensado para o piscineiro autônomo: rápido de usar entre uma piscina e outra.'],
          ].map(([q, a]) => (
            <details key={q} className="tp-reveal group rounded-2xl border border-slate-100 bg-white p-5 shadow-card open:border-brand-200">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
                {q}<ChevronDown className="size-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="mt-2 text-[15px] text-slate-600">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="tp-reveal relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand-600 to-brand-900 px-6 py-16 text-center text-white">
          <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-32 w-full text-white/10" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden>
            <path d="M0 60 C 80 30, 140 90, 220 60 S 340 30, 400 60 L400 120 L0 120Z" fill="currentColor" />
          </svg>
          <h2 className="relative text-3xl font-extrabold tracking-tight md:text-5xl">Menos papel, mais piscina limpa.</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-lg text-brand-100">Organize sua semana em minutos e chegue no horário em todos os clientes.</p>
          <Cta {...cta} light className="relative mt-8" />
        </div>
      </section>

      <footer className="border-t border-slate-100">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-slate-500 sm:flex-row">
          <Brand />
          <p>© {YEAR} Titan Pool</p>
          <Link to="/entrar" className="font-semibold text-slate-700 hover:text-brand-700">Entrar</Link>
        </div>
      </footer>
    </div>
  )
}

function SectionHead({ kicker, title, text }: { kicker: string; title: string; text?: string }) {
  return (
    <div className="tp-reveal mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold tracking-wider text-brand-600 uppercase">{kicker}</p>
      <h2 className="mt-2 text-3xl font-extrabold tracking-tight md:text-[2.6rem] md:leading-tight">{title}</h2>
      {text && <p className="mt-3 text-lg text-slate-600">{text}</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Celular animado: as visitas vão sendo concluídas uma a uma           */
/* ------------------------------------------------------------------ */

const DAY_STOPS = [
  { name: 'Mariana Alves', hood: 'Cambuí', time: '08:10', x: 120, y: 58 },
  { name: 'Cond. Vila Azul', hood: 'Taquaral', time: '09:00', x: 180, y: 34 },
  { name: 'Roberto Santos', hood: 'Barão Geraldo', time: '10:25', x: 222, y: 76 },
]

function AnimatedPhone() {
  const { ref, step } = useTicker(DAY_STOPS.length + 2, 1700)
  const done = Math.min(step, DAY_STOPS.length)
  const next = DAY_STOPS[done]
  const path = `M60 88 ${DAY_STOPS.map((s) => `L${s.x} ${s.y}`).join(' ')}`
  return (
    <div ref={ref} className="tp-page relative mx-auto w-full max-w-[310px]" aria-label="Exemplo da agenda do dia no app" role="img">
      <div className="absolute -inset-10 -z-10 rounded-full bg-brand-300/30 blur-3xl" />
      <div className="rounded-[2.8rem] border-[10px] border-slate-900 bg-canvas p-3 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-slate-300" />
        <p className="text-[10px] font-medium text-slate-500">Segunda-feira, 23 de novembro</p>
        <p className="text-lg font-bold">Bom dia</p>
        <div className="mt-2 overflow-hidden rounded-2xl bg-white shadow-card">
          <svg viewBox="0 0 260 110" className="h-28 w-full bg-[#e8eef7]">
            <path d="M0 70 Q60 40 120 60 T260 50" stroke="#fff" strokeWidth="10" fill="none" />
            <path d="M40 0 L70 110 M170 0 L150 110" stroke="#fff" strokeWidth="7" />
            <path d={path} stroke="#1f62e8" strokeWidth="3" strokeLinecap="round" fill="none" pathLength={100} strokeDasharray="100" strokeDashoffset={100 - (done / DAY_STOPS.length) * 100} style={{ transition: 'stroke-dashoffset 1.2s ease' }} />
            <path d={path} stroke="#1f62e8" strokeWidth="2" strokeDasharray="2 6" strokeLinecap="round" fill="none" opacity="0.35" />
            <circle cx="60" cy="88" r="8" fill="#0f172a" />
            {DAY_STOPS.map((s, i) => (
              <g key={s.name} style={{ transition: 'opacity .4s' }}>
                <circle cx={s.x} cy={s.y} r={i === done ? 12 : 10} fill={i < done ? '#10b981' : '#1f62e8'} stroke="#fff" strokeWidth="2.5" style={{ transition: 'all .4s' }} />
                <text x={s.x} y={s.y + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">{i < done ? '✓' : i + 1}</text>
              </g>
            ))}
          </svg>
          <div className="grid grid-cols-3 text-center text-[9px] text-slate-400">
            <p className="py-1.5">VISITAS<br /><b className="text-[11px] text-slate-800">{done}/3</b></p>
            <p className="py-1.5">PERCURSO<br /><b className="text-[11px] text-slate-800">18 km</b></p>
            <p className="py-1.5">TÉRMINO<br /><b className="text-[11px] text-slate-800">11:05</b></p>
          </div>
        </div>
        <div className="mt-2 min-h-[74px] rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 p-3 text-white transition-all">
          {next ? (
            <div key={next.name} className="tp-fade">
              <p className="flex justify-between text-[9px] text-brand-100"><span>Próxima visita · {done + 1}ª do dia</span><span className="flex items-center gap-0.5"><Car className="size-3" />10 min</span></p>
              <div className="mt-1 flex items-end justify-between"><p className="text-sm font-bold">{next.name}</p><p className="text-xl font-bold">{next.time}</p></div>
              <p className="mt-0.5 flex items-center gap-1 text-[9px] text-brand-50"><MapPin className="size-3" />{next.hood}</p>
            </div>
          ) : (
            <div className="tp-fade flex h-[50px] items-center gap-2"><CheckCircle2 className="size-6" /><p className="text-sm font-bold">Dia concluído!</p></div>
          )}
        </div>
        <div className="mt-2 space-y-1.5">
          {DAY_STOPS.map((s, i) => (
            <div key={s.name} className={cn('flex items-center gap-2 rounded-xl bg-white p-2 shadow-card transition-opacity', i < done && 'opacity-60')}>
              <span className={cn('flex size-6 items-center justify-center rounded-full text-[10px] font-bold transition-colors', i < done ? 'bg-emerald-500 text-white' : 'bg-brand-50 text-brand-700')}>{i < done ? '✓' : i + 1}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-semibold">{s.name}</p><p className="text-[9px] text-slate-400">{s.hood}</p></div>
              <p className="flex items-center gap-0.5 text-[11px] font-bold"><Clock className="size-3 text-slate-400" />{s.time}</p>
            </div>
          ))}
        </div>
      </div>
      <div className={cn('absolute -right-3 bottom-28 hidden items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-float transition-all duration-500 sm:flex', done > 0 && done <= DAY_STOPS.length ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0')}>
        <span className="flex size-6 items-center justify-center rounded-full bg-[#25d366] text-white"><Send className="size-3.5" /></span>
        <span className="text-xs font-semibold">Relatório enviado ao cliente</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Recursos em abas, com a tela do app mudando                          */
/* ------------------------------------------------------------------ */

const TABS: Array<{ id: string; icon: ReactNode; title: string; text: string; bullets: string[] }> = [
  { id: 'agenda', icon: <CalendarDays className="size-5" />, title: 'Agenda', text: 'Visitas fixas toda semana, a cada 15 dias ou em dias do mês, mais as avulsas.', bullets: ['Remarcar, pular ou desmarcar com um toque', 'Horário combinado respeitado na rota', 'Semana com a quantidade de visitas por dia'] },
  { id: 'visita', icon: <FlaskConical className="size-5" />, title: 'Visita', text: 'Relatório completo em segundos, enviado ao cliente pelo WhatsApp ou em PDF.', bullets: ['pH, cloro e alcalinidade com sugestão de dosagem', 'Checklist de serviços e produtos aplicados', 'Fotos da piscina antes e depois'] },
  { id: 'compras', icon: <ShoppingBag className="size-5" />, title: 'Compras', text: 'Monte a lista para o cliente e mande ao fornecedor sem digitar de novo.', bullets: ['Lista de itens com o último preço pago', 'Pedido vai direto no WhatsApp do fornecedor', 'Ao receber, a despesa entra no financeiro'] },
  { id: 'financeiro', icon: <Wallet className="size-5" />, title: 'Financeiro', text: 'Saiba quem pagou, quem atrasou e quanto sobrou no mês.', bullets: ['Mensalidades com lembrete pelo WhatsApp', 'Gastos por categoria e margem por cliente', 'Recibos e relatório do mês em PDF'] },
]

function FeatureTabs() {
  const [active, setActive] = useState(TABS[0].id)
  const tab = TABS.find((t) => t.id === active)!
  return (
    <div className="tp-reveal mt-12 grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div>
        <div role="tablist" aria-label="Recursos" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={active === t.id} onClick={() => setActive(t.id)}
              className={cn('flex items-center gap-2 rounded-2xl border px-4 py-3 text-left font-semibold transition-all', active === t.id ? 'border-brand-600 bg-brand-600 text-white shadow-float' : 'border-slate-100 bg-white text-slate-700 shadow-card hover:border-brand-200')}>
              {t.icon}{t.title}
            </button>
          ))}
        </div>
        <div key={tab.id} className="tp-fade mt-6">
          <p className="text-lg text-slate-700">{tab.text}</p>
          <ul className="mt-4 space-y-2.5">
            {tab.bullets.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-[15px]"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />{b}</li>
            ))}
          </ul>
        </div>
      </div>
      <div key={tab.id} className="tp-page rounded-[2rem] border border-slate-100 bg-white p-5 shadow-card md:p-6" aria-hidden>
        {tab.id === 'agenda' && <AgendaMock />}
        {tab.id === 'visita' && <VisitMock />}
        {tab.id === 'compras' && <PurchaseMock />}
        {tab.id === 'financeiro' && <FinanceMock />}
      </div>
    </div>
  )
}

function AgendaMock() {
  const days = ['Seg 23', 'Ter 24', 'Qua 25', 'Qui 26', 'Sex 27']
  const items: Array<[string, string, string, string?]> = [['Mariana Alves', 'Toda seg, qua e sex', '08:10'], ['Cond. Vila Azul', 'Horário combinado', '09:00', '09:00'], ['Juliana Costa', 'Avulsa', '10:30'], ['Paulo Mendes', 'Todo mês: dias 5 e 25', '11:20']]
  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {days.map((d, i) => (
          <div key={d} className={cn('rounded-xl py-2 text-center text-xs font-semibold', i === 0 ? 'bg-brand-600 text-white' : 'bg-slate-50 text-slate-600')}>{d}</div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {items.map(([n, d, t, fixed], i) => (
          <div key={n} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">{i + 1}</span>
            <div className="min-w-0 flex-1"><p className="font-semibold">{n}</p><p className="text-xs text-slate-500">{d}</p></div>
            {fixed && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">⏰ {fixed}</span>}
            <p className="text-lg font-bold tabular-nums">{t}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function VisitMock() {
  return (
    <div>
      <p className="font-semibold">Mariana Alves · Principal</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[['pH', '7,4', 'OK', 'bg-emerald-50 text-emerald-700'], ['Cloro', '0,5', 'Baixo', 'bg-amber-50 text-amber-700'], ['Alcalin.', '95', 'OK', 'bg-emerald-50 text-emerald-700']].map(([k, v, s, c]) => (
          <div key={k} className="rounded-2xl border border-slate-100 p-3"><p className="text-xs text-slate-500">{k}</p><p className="text-xl font-bold">{v}</p><span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', c)}>{s}</span></div>
        ))}
      </div>
      <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Cloro baixo: cerca de 75 g de cloro granulado 65% para chegar a 2 ppm.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        {['Peneirar superfície', 'Aspirar fundo', 'Escovar paredes', 'Limpar skimmer'].map((t) => <p key={t} className="flex items-center gap-2"><CheckCircle2 className="size-4 text-brand-600" />{t}</p>)}
      </div>
      <div className="mt-3 flex gap-2">
        <span className="flex h-10 flex-1 items-center justify-center rounded-xl bg-[#25d366] text-sm font-semibold text-white">Enviar no WhatsApp</span>
        <span className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-semibold"><Camera className="size-4" /> 3</span>
        <span className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-semibold"><FileText className="size-4" /> PDF</span>
      </div>
    </div>
  )
}

function PurchaseMock() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <p className="text-xs font-semibold text-slate-500">Pedido #0012 · para Mariana Alves</p>
        {[['Cloro granulado 10 kg', '2 balde'], ['Margarida (escova)', '1 un'], ['Peneira de superfície', '1 un']].map(([n, q], i) => (
          <div key={n} className="mt-2 flex items-center gap-2 rounded-xl border border-slate-100 p-2.5 text-sm"><span className="flex size-6 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{i + 1}</span><span className="flex-1 font-medium">{n}</span><span className="text-slate-500">{q}</span></div>
        ))}
        <span className="mt-3 flex h-10 items-center justify-center gap-2 rounded-xl bg-[#25d366] text-sm font-semibold text-white"><Send className="size-4" /> Enviar para Aqua Center</span>
      </div>
      <div className="rounded-2xl bg-[#e6ddd4] p-3">
        <div className="ml-auto max-w-[95%] rounded-2xl rounded-tr-sm bg-[#d9fdd3] p-3 text-[13px] leading-snug shadow-sm">
          Olá, Pedro! Gostaria de um orçamento — pedido #0012:<br /><br />1. Cloro granulado 10 kg — 2 balde<br />2. Margarida (escova) — 1 un<br />3. Peneira de superfície — 1 un<br /><br />Para o cliente: Mariana Alves
          <p className="mt-1 text-right text-[10px] text-slate-500">08:42 ✓✓</p>
        </div>
      </div>
    </div>
  )
}

function FinanceMock() {
  const cats: Array<[string, number]> = [['Produtos', 82], ['Combustível', 46], ['Equipamentos', 20]]
  return (
    <div>
      <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-4 text-white">
        <p className="text-sm text-brand-100">Lucro de novembro</p>
        <p className="text-3xl font-bold">R$ 4.380,00</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm"><p className="rounded-xl bg-white/15 p-2">Entradas<br /><b>R$ 6.120,00</b></p><p className="rounded-xl bg-white/15 p-2">Saídas<br /><b>R$ 1.740,00</b></p></div>
      </div>
      <div className="mt-4 space-y-3">
        {cats.map(([c, w]) => (
          <div key={c}><div className="flex justify-between text-sm"><span>{c}</span><span className="font-semibold">{w}%</span></div><div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${w}%` }} /></div></div>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-400">Valores ilustrativos.</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Comparação de rota (usa o mesmo otimizador do app)                   */
/* ------------------------------------------------------------------ */

const BASE = { lat: -22.9064, lng: -47.0616 }
const POINTS = [
  { name: 'Ana', lat: -22.8234, lng: -47.082 },
  { name: 'Bruno', lat: -22.9031, lng: -47.0379 },
  { name: 'Carla', lat: -22.8746, lng: -47.0545 },
  { name: 'Davi', lat: -22.9183, lng: -47.0512 },
  { name: 'Eva', lat: -22.8869, lng: -47.0731 },
  { name: 'Fábio', lat: -22.8975, lng: -47.056 },
]

function routeStats(order: number[]) {
  let km = 0
  let prev = BASE
  for (const i of order) {
    km += haversineKm(prev, POINTS[i]) * ROAD_FACTOR
    prev = POINTS[i]
  }
  return { km, minutes: Math.round((km / 30) * 60 + order.length * 3) }
}

function RouteCompare() {
  const [optimized, setOptimized] = useState(true)
  const listOrder = useMemo(() => POINTS.map((_, i) => i), [])
  const bestOrder = useMemo(() => optimizeOrder(BASE, POINTS), [])
  const order = optimized ? bestOrder : listOrder
  const list = routeStats(listOrder)
  const best = routeStats(bestOrder)
  const cur = optimized ? best : list
  const saved = Math.max(0, list.km - best.km)

  // Projeta lat/lng numa caixa de 400x260.
  const all = [BASE, ...POINTS]
  const minLat = Math.min(...all.map((p) => p.lat)), maxLat = Math.max(...all.map((p) => p.lat))
  const minLng = Math.min(...all.map((p) => p.lng)), maxLng = Math.max(...all.map((p) => p.lng))
  const xy = (p: { lat: number; lng: number }) => [30 + ((p.lng - minLng) / (maxLng - minLng)) * 340, 25 + ((maxLat - p.lat) / (maxLat - minLat)) * 210] as const
  const path = [BASE, ...order.map((i) => POINTS[i])].map((p, i) => `${i ? 'L' : 'M'}${xy(p).join(' ')}`).join(' ')

  return (
    <div className="tp-reveal mt-12 grid items-center gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white p-3 shadow-card">
        <svg viewBox="0 0 400 260" className="w-full rounded-3xl bg-[#e9eef6]" role="img" aria-label={optimized ? 'Rota otimizada no mapa' : 'Rota na ordem da lista no mapa'}>
          {[60, 130, 200].map((y) => <path key={y} d={`M0 ${y} Q100 ${y - 25} 200 ${y} T400 ${y}`} stroke="#fff" strokeWidth="8" fill="none" />)}
          {[90, 210, 320].map((x) => <path key={x} d={`M${x} 0 L${x - 20} 260`} stroke="#fff" strokeWidth="6" />)}
          <path key={String(optimized)} d={path} stroke={optimized ? '#1f62e8' : '#f59e0b'} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" pathLength={100} strokeDasharray="100" className="tp-draw" />
          <g transform={`translate(${xy(BASE).join(' ')})`}><circle r="11" fill="#0f172a" /><text y="4" textAnchor="middle" fontSize="11" fill="#fff">⌂</text></g>
          {order.map((pi, n) => {
            const [x, y] = xy(POINTS[pi])
            return (
              <g key={POINTS[pi].name} transform={`translate(${x} ${y})`} style={{ transition: 'transform .5s' }}>
                <circle r="13" fill={optimized ? '#1f62e8' : '#f59e0b'} stroke="#fff" strokeWidth="3" />
                <text y="4.5" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">{n + 1}</text>
              </g>
            )
          })}
        </svg>
      </div>
      <div>
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-200/60 p-1" role="radiogroup" aria-label="Ordem das visitas">
          {[[false, 'Ordem da lista'], [true, 'Rota otimizada']].map(([v, l]) => (
            <button key={String(v)} type="button" role="radio" aria-checked={optimized === v} onClick={() => setOptimized(v as boolean)}
              className={cn('h-11 rounded-xl text-sm font-semibold transition-colors', optimized === v ? 'bg-white text-brand-700 shadow-card' : 'text-slate-500')}>{l as string}</button>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-card"><p className="text-sm text-slate-500">Percurso</p><p className="text-3xl font-bold tabular-nums">{cur.km.toFixed(1).replace('.', ',')} km</p></div>
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-card"><p className="text-sm text-slate-500">No trânsito</p><p className="text-3xl font-bold tabular-nums">{cur.minutes} min</p></div>
        </div>
        <p className={cn('mt-4 rounded-2xl px-4 py-3 text-[15px] font-medium transition-colors', optimized ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800')}>
          {optimized ? `${saved.toFixed(1).replace('.', ',')} km a menos neste exemplo de 6 clientes — tempo que vira mais uma piscina no dia.` : 'Na ordem do cadastro o carro vai e volta pela cidade. Toque em “Rota otimizada”.'}
        </p>
        <p className="mt-3 text-xs text-slate-400">Exemplo com 6 endereços em Campinas/SP, distâncias estimadas.</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Laboratório da água (usa a mesma regra de dosagem do app)            */
/* ------------------------------------------------------------------ */

const SLIDERS: Array<{ key: ReadingKey; min: number; max: number; step: number }> = [
  { key: 'ph', min: 6.4, max: 8.4, step: 0.1 },
  { key: 'chlorine', min: 0, max: 5, step: 0.1 },
  { key: 'alkalinity', min: 40, max: 180, step: 5 },
]

function WaterLab() {
  const [r, setR] = useState({ ph: 7.8, chlorine: 0.6, alkalinity: 70 })
  const [volume, setVolume] = useState(30000)
  const suggestions = suggestCorrections(r, volume)
  const status = { ok: ['Ideal', 'bg-emerald-50 text-emerald-700'], low: ['Baixo', 'bg-amber-50 text-amber-700'], high: ['Alto', 'bg-amber-50 text-amber-700'], unknown: ['—', 'bg-slate-100 text-slate-500'] } as const
  return (
    <div className="tp-reveal mt-12 grid gap-6 lg:grid-cols-2">
      <div className="space-y-5 rounded-[2rem] border border-slate-100 bg-white p-6 shadow-card">
        {SLIDERS.map((s) => {
          const range = IDEAL_RANGES[s.key]
          const value = r[s.key]
          const [label, cls] = status[classify(s.key, value)]
          return (
            <label key={s.key} className="block">
              <span className="flex items-center justify-between">
                <span className="font-semibold">{range.label}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xl font-bold tabular-nums">{value.toLocaleString('pt-BR')}{range.unit && <span className="ml-0.5 text-sm text-slate-400">{range.unit}</span>}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', cls)}>{label}</span>
                </span>
              </span>
              <input type="range" min={s.min} max={s.max} step={s.step} value={value} onChange={(e) => setR({ ...r, [s.key]: Number(e.target.value) })} className="mt-2 w-full accent-brand-600" />
              <span className="text-xs text-slate-400">Ideal: {range.min.toLocaleString('pt-BR')}–{range.max.toLocaleString('pt-BR')} {range.unit}</span>
            </label>
          )
        })}
        <label className="block border-t border-slate-100 pt-4">
          <span className="flex justify-between"><span className="font-semibold">Volume da piscina</span><span className="font-bold tabular-nums">{volume.toLocaleString('pt-BR')} L</span></span>
          <input type="range" min={5000} max={100000} step={1000} value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="mt-2 w-full accent-brand-600" />
        </label>
      </div>
      <div className="flex flex-col rounded-[2rem] bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white shadow-float">
        <p className="flex items-center gap-2 text-sm font-semibold text-brand-100"><FlaskConical className="size-4" aria-hidden /> O que o app sugere</p>
        <div className="mt-4 flex-1 space-y-3" aria-live="polite">
          {suggestions.length === 0 ? (
            <p className="flex items-center gap-2 rounded-2xl bg-white/15 p-4 text-lg font-semibold"><CheckCircle2 className="size-6" /> Água equilibrada. Nada a corrigir!</p>
          ) : suggestions.map((s) => (
            <p key={s.key} className="tp-fade rounded-2xl bg-white/15 p-4 text-[15px] leading-relaxed">{s.message}</p>
          ))}
        </div>
        <p className="mt-4 text-xs text-brand-200">Estimativas para cloro granulado 65% e bicarbonato de sódio. Confira sempre o rótulo do produto.</p>
      </div>
    </div>
  )
}
