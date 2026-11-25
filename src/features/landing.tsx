import {
  ArrowRight, BellRing, Building2, CalendarDays, Camera, Car, Check, CheckCircle2, ChevronDown, Clock, Download, Droplets, FileText, FlaskConical,
  Laptop, MapPin, MessageCircle, Navigation, Send, ShieldCheck, ShoppingBag, Smartphone, Sparkles, UserRound, Users, Wallet, X,
} from 'lucide-react'
import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SUPABASE_KEY, SUPABASE_URL } from '@/config'
import { IDEAL_RANGES, type ReadingKey, classify, suggestCorrections } from '@/domain/chemistry'
import { whatsappLink } from '@/domain/format'
import { haversineKm, optimizeOrder, ROAD_FACTOR } from '@/domain/route'
import { cn } from '@/lib/cn'
import { prefersReducedMotion, useReveal } from '@/lib/use-reveal'
import armetecLogo from '@/assets/armetec.webp'
import screenAgenda from '@/assets/screens/agenda.webp'
import screenClientes from '@/assets/screens/clientes.webp'
import screenCompras from '@/assets/screens/compras.webp'
import screenFinanceiro from '@/assets/screens/financeiro.webp'
import screenVisita from '@/assets/screens/visita.webp'
import { Bubbles, WaterBackground, Waves } from '@/components/water'

const YEAR = new Date().getFullYear()

type Settings = { trial_days: number; allow_self_signup: boolean; support_whatsapp: string }

/** Header "sólido" depois de rolar: só muda o estado quando cruza o limite (não a cada pixel). */
function useScrolled(threshold = 40) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])
  return scrolled
}

/**
 * Deslocamento suave do elemento conforme a rolagem, escrito direto no estilo (sem re-renderizar
 * a página). Só em notebook/desktop com mouse; no celular a página rola livre.
 */
function useParallaxRef<T extends HTMLElement>(factor: number) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion() || !window.matchMedia('(pointer: fine) and (min-width: 1024px)').matches) return
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => { el.style.transform = `translate3d(0, ${Math.min(window.scrollY, 900) * factor}px, 0)` })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [factor])
  return ref
}

/** Número que conta até o valor quando aparece na tela. */
function CountUp({ to, decimals = 0, suffix = '' }: { to: number; decimals?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [v, setV] = useState(prefersReducedMotion() ? to : 0)
  useEffect(() => {
    if (prefersReducedMotion() || !ref.current) return
    let frame = 0
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      const start = performance.now()
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / 1100)
        setV(to * (1 - (1 - p) ** 3))
        if (p < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }, { threshold: 0.5 })
    io.observe(ref.current)
    return () => {
      io.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [to])
  return <span ref={ref} className="tabular-nums">{v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>
}

function Cta({ signup, contact, trialDays, className, light }: { signup: string | null; contact: string | null; trialDays: number; className?: string; light?: boolean }) {
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number; size: number }>>([])
  // Ondinha a partir do toque, como uma gota na água.
  const onDown = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const size = Math.max(r.width, r.height) / 2
    const id = Date.now()
    setRipples((list) => [...list, { id, x: e.clientX - r.left - size / 2, y: e.clientY - r.top - size / 2, size }])
    setTimeout(() => setRipples((list) => list.filter((x) => x.id !== id)), 650)
  }
  const cls = cn(
    'group relative inline-flex h-13 items-center justify-center gap-2 overflow-hidden rounded-xl px-7 text-base font-semibold transition-all active:scale-[0.98]',
    light ? 'bg-white text-brand-700 shadow-[0_12px_30px_-10px_rgb(4_19_63/0.5)] hover:bg-sky-50' : 'bg-brand-600 text-white shadow-float hover:bg-brand-700',
    className,
  )
  const inner = (label: string) => (
    <>
      {ripples.map((r) => <span key={r.id} className="tp-ripple opacity-30" style={{ left: r.x, top: r.y, width: r.size, height: r.size }} />)}
      <span className="relative">{label}</span>
      <ArrowRight className="relative size-5 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </>
  )
  if (signup) return <a href={signup} className={cls} onPointerDown={onDown}>{inner(`Testar grátis por ${trialDays} dias`)}</a>
  if (!contact) return null
  return <a href={contact} target="_blank" rel="noopener noreferrer" className={cls} onPointerDown={onDown}>{inner('Quero conhecer')}</a>
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
  const closeMenu = useCallback(() => setMenu(false), [])
  const solid = useScrolled()
  const phoneRef = useParallaxRef<HTMLDivElement>(-0.1)
  useReveal()
  useEffect(() => {
    // Sem a biblioteca do banco: a landing busca as configurações públicas com um fetch simples.
    if (SUPABASE_URL && SUPABASE_KEY) {
      fetch(`${SUPABASE_URL}/rest/v1/rpc/public_settings`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
        body: '{}',
      }).then((r) => (r.ok ? r.json() : null)).then((d: Settings | null) => d && setSettings(d)).catch(() => {})
    }
    document.title = 'Titan Pool · O app do piscineiro'
    return () => { document.title = 'Titan Pool' }
  }, [])
  const signup = settings.allow_self_signup ? '/cadastro' : null
  const contact = settings.support_whatsapp ? whatsappLink(settings.support_whatsapp, 'Olá! Quero conhecer o Titan Pool.') : null
  const cta = { signup, contact, trialDays: settings.trial_days }
  const links = [['#app', 'Veja o app'], ['#recursos', 'Recursos'], ['#rota', 'Rota'], ['#agua', 'Análise da água'], ['#planos', 'Planos'], ['#duvidas', 'Dúvidas']]

  return (
    <div className="min-h-svh overflow-x-hidden bg-white text-slate-900">
      <header className={cn('fixed inset-x-0 top-0 z-40 text-slate-900 transition-all duration-300', solid ? 'border-b border-slate-100/80 bg-white/90 shadow-sm backdrop-blur-md' : 'bg-transparent')}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <a href="/" className="inline-flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-float"><Droplets className="size-5" aria-hidden /></span>
            <span className="text-xl font-bold tracking-tight">Titan Pool</span>
          </a>
          <nav className="hidden gap-7 text-sm font-medium text-slate-600 lg:flex">
            {links.map(([h, l]) => <a key={h} href={h} className="transition-colors hover:text-brand-700">{l}</a>)}
          </nav>
          <div className="flex items-center gap-2">
            <a href="/entrar" className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Entrar</a>
            {signup && <a href={signup} className="hidden rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 sm:inline-flex">Testar grátis</a>}
            <button type="button" className="flex size-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
              <Burger open={menu} />
            </button>
          </div>
        </div>
      </header>
      <MobileMenu open={menu} onClose={closeMenu} signup={signup} trialDays={settings.trial_days} />

      {/* Abertura: fundo branco com detalhes de água bem leves */}
      <section data-hero className="relative isolate overflow-hidden bg-white pt-16 text-slate-900 lg:flex lg:h-svh lg:min-h-[600px] lg:flex-col">
        <PoolBackdrop />
        <div data-hero-content className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-14 pb-36 md:grid-cols-12 md:pt-20 md:pb-44 lg:min-h-0 lg:flex-1 lg:pt-2 lg:pb-24">
          <div className="md:col-span-7">
            <p className="tp-rise inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-3.5 py-1.5 text-sm font-semibold text-brand-700">
              <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex size-2 rounded-full bg-emerald-500" /></span>
              O app do piscineiro
            </p>
            <h1 className="tp-rise mt-6 text-[2.8rem] leading-[1.02] font-extrabold tracking-tight [animation-delay:80ms] md:text-[4.4rem] lg:[@media(max-height:860px)]:text-[3.6rem] lg:[@media(max-height:740px)]:text-[3.1rem]">
              Mais piscinas por dia.<br /><span className="bg-gradient-to-r from-brand-600 to-sky-500 bg-clip-text text-transparent">Menos tempo no volante.</span>
            </h1>
            <p className="tp-rise mt-6 max-w-xl text-lg text-slate-600 [animation-delay:160ms] md:text-xl lg:[@media(max-height:860px)]:mt-4 lg:[@media(max-height:860px)]:text-lg">
              O Titan Pool organiza sua agenda, monta a melhor rota, gera o relatório da piscina e cobra seus clientes. Você trabalha menos no papel e mais na água.
            </p>
            <div className="tp-rise mt-9 flex flex-col gap-3 [animation-delay:240ms] sm:flex-row lg:[@media(max-height:860px)]:mt-6">
              <Cta {...cta} />
              <a href="#como-funciona" className="inline-flex h-13 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 text-base font-semibold text-slate-700 hover:border-brand-200 hover:bg-brand-50/50">
                Ver como funciona
              </a>
            </div>
            <ul className="tp-rise mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500 [animation-delay:320ms] lg:[@media(max-height:860px)]:mt-5">
              {['Teste grátis sem cartão', 'Pronto em 5 minutos', 'Celular e notebook'].map((t) => (
                <li key={t} className="flex items-center gap-1.5"><CheckCircle2 className="size-4 text-emerald-500" aria-hidden />{t}</li>
              ))}
            </ul>
          </div>
          <div ref={phoneRef} className="relative md:col-span-5">
            <div className="origin-center lg:[@media(max-height:860px)]:scale-[0.86] lg:[@media(max-height:740px)]:scale-[0.74]">
            <AnimatedPhone />
            <FloatChip className="top-6 -left-6 [animation-delay:-1s] md:-left-16" icon={<Navigation className="size-4" />} tone="bg-brand-600 text-white">Rota otimizada · 22 km</FloatChip>
            <FloatChip className="top-1/2 -right-2 [animation-delay:-3s] md:-right-10" icon={<BellRing className="size-4" />} tone="bg-amber-400 text-white">Lembrete de mensalidade</FloatChip>
            <FloatChip className="bottom-10 -left-4 [animation-delay:-5s] md:-left-20" icon={<FlaskConical className="size-4" />} tone="bg-emerald-500 text-white">pH 7,4 · ideal</FloatChip>
            </div>
          </div>
        </div>
        <Waves />
      </section>

      <Showcase />
      <Pains />
      <Mission />
      <Marquee />

      {/* Recursos em mosaico */}
      <section id="recursos" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24">
        <div className="grid gap-6 md:grid-cols-12 md:items-end">
          <div className="tp-reveal md:col-span-7">
            <p className="text-sm font-semibold tracking-wider text-brand-600 uppercase">Recursos</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight md:text-5xl md:leading-[1.05]">Tudo que o dia a dia da piscina pede.</h2>
          </div>
          <p className="tp-reveal text-lg text-slate-600 md:col-span-5">Do bom dia ao fechamento do mês, num app só — pensado para usar com uma mão, entre uma piscina e outra.</p>
        </div>
        <Bento />
      </section>

      {/* Rota: água funda */}
      <section id="rota" className="relative isolate scroll-mt-20 overflow-hidden pt-32 pb-36 text-white">
        <WaterBackground top="#123f9c" bottom="#04133f" light={0.35} />
        <Waves flip />
        <div className="relative mx-auto max-w-6xl px-4">
          <div className="grid gap-6 md:grid-cols-12 md:items-end">
            <div className="tp-reveal md:col-span-6">
              <p className="text-sm font-semibold tracking-wider text-sky-300 uppercase">Rota inteligente</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight md:text-5xl md:leading-[1.05]">Menos volta.<br />Mais visitas no dia.</h2>
            </div>
            <div className="tp-reveal grid grid-cols-3 gap-4 md:col-span-6">
              <Metric value={<CountUp to={51} suffix="%" />} label="menos km no exemplo" />
              <Metric value={<CountUp to={6} />} label="clientes no mapa" />
              <Metric value={<CountUp to={1} />} label="toque para otimizar" />
            </div>
          </div>
          <RouteCompare />
        </div>
        <Waves />
      </section>

      {/* Análise da água: assimétrica ao contrário */}
      <section id="agua" className="relative isolate scroll-mt-20 py-24">
        <div className="absolute top-24 right-0 -z-10 h-[70%] w-[85%] rounded-l-[4rem] bg-gradient-to-br from-brand-50 to-sky-50" aria-hidden />
        <div className="mx-auto max-w-6xl px-4">
          <div className="tp-reveal max-w-xl md:ml-auto md:text-right">
            <p className="text-sm font-semibold tracking-wider text-brand-600 uppercase">Análise da água</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight md:text-5xl md:leading-[1.05]">Meça. O app diz o que fazer.</h2>
            <p className="mt-3 text-lg text-slate-600">Mexa nos valores: é a mesma sugestão de correção que aparece no relatório da visita.</p>
          </div>
          <WaterLab />
        </div>
      </section>

      <Audience />
      <Steps />
      <Guarantees hasSupport={Boolean(contact)} />

      {/* Plano */}
      <section id="planos" className="scroll-mt-20 px-4 py-24">
        <div className="tp-reveal mx-auto mb-12 max-w-2xl text-center">
          <p className="text-sm font-semibold tracking-wider text-brand-600 uppercase">Planos</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight md:text-5xl md:leading-[1.05]">Experimente antes de decidir.</h2>
          <p className="mt-3 text-lg text-slate-600">Use tudo liberado durante o teste. Se gostar, a gente ativa o seu plano.</p>
        </div>
        <div className="tp-reveal relative mx-auto grid max-w-5xl overflow-hidden rounded-[2.5rem] bg-white shadow-[0_30px_80px_-30px_rgb(31_98_232/0.45)] ring-1 ring-slate-100 md:grid-cols-12">
          <div className="relative isolate overflow-hidden p-8 text-white md:col-span-5 md:p-10">
            <WaterBackground light={0.45} />
            <Bubbles count={7} />
            <p className="relative text-sm font-semibold text-sky-100">Titan Pool completo</p>
            <p className="relative mt-3 text-7xl font-extrabold tracking-tight">{settings.trial_days}</p>
            <p className="relative text-2xl font-bold">dias grátis</p>
            <p className="relative mt-4 text-white/85">Sem cartão de crédito. Depois, plano mensal acessível — fale com a gente para ativar.</p>
          </div>
          <div className="p-8 md:col-span-7 md:p-10">
            <ul className="grid gap-3 text-[15px] sm:grid-cols-2">
              {['Clientes e piscinas ilimitados', 'Agenda, mapa e rota otimizada', 'Relatórios, fotos e PDFs', 'Compras com fornecedores', 'Financeiro e mensalidades', 'Celular e notebook'].map((t) => (
                <li key={t} className="flex items-center gap-2.5"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600"><Check className="size-3.5" aria-hidden /></span>{t}</li>
              ))}
            </ul>
            <Cta {...cta} className="mt-8 w-full" />
            {contact && <a href={contact} target="_blank" rel="noopener noreferrer" className="mt-3 block text-center text-sm font-semibold text-slate-600 hover:text-brand-700">Tirar dúvidas no WhatsApp</a>}
          </div>
        </div>
      </section>

      {/* Dúvidas */}
      <section id="duvidas" className="mx-auto grid max-w-6xl scroll-mt-20 gap-10 px-4 pb-24 md:grid-cols-12">
        <div className="tp-reveal md:sticky md:top-28 md:col-span-4 md:self-start">
          <p className="text-sm font-semibold tracking-wider text-brand-600 uppercase">Dúvidas</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">Perguntas frequentes</h2>
          {contact && <a href={contact} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 font-semibold text-brand-700">Falar no WhatsApp <ArrowRight className="size-4" /></a>}
        </div>
        <div className="space-y-3 md:col-span-8">
          {[
            ['Preciso instalar alguma coisa?', 'Não. O Titan Pool abre no navegador e pode ser adicionado à tela inicial do celular como um app.'],
            ['Funciona no celular e no notebook?', 'Sim. Os dados ficam na nuvem e aparecem iguais em qualquer aparelho em que você entrar.'],
            ['Como acho o endereço do cliente?', 'Digite o CEP ou comece a escrever a rua: as opções aparecem e a localização no mapa é marcada sozinha.'],
            ['Como funciona o teste grátis?', 'Você cria a conta e usa tudo liberado durante o teste, sem cartão. Depois é só falar com a gente para continuar.'],
            ['Meus dados ficam seguros?', 'Cada conta só enxerga os próprios dados, protegidos por login e por regras no banco de dados. E você pode baixar um backup quando quiser.'],
          ].map(([q, a], i) => (
            <details key={q} className="tp-reveal group rounded-2xl border border-slate-100 bg-white p-5 shadow-card open:border-brand-200" style={{ transitionDelay: `${i * 60}ms` }}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
                {q}<ChevronDown className="size-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="mt-2 text-[15px] text-slate-600">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Chamada final, de volta à água */}
      <section className="relative isolate overflow-hidden pt-32 pb-24 text-white">
        <WaterBackground />
        <Waves flip />
        <Bubbles count={12} />
        <div className="relative mx-auto max-w-4xl px-4 text-center">
          <h2 className="tp-reveal text-4xl font-extrabold tracking-tight md:text-6xl md:leading-[1.02]">Sua próxima semana pode começar organizada.</h2>
          <p className="tp-reveal mx-auto mt-5 max-w-xl text-lg text-white/90">Cadastre seus clientes hoje e amanhã cedo a rota já está pronta no celular.</p>
          <div className="tp-reveal mt-9 flex justify-center"><Cta {...cta} light /></div>
        </div>
      </section>

      <Footer contact={contact} signup={signup} />
    </div>
  )
}

/**
 * Fundo da abertura: azul profundo de piscina, azulejos sutis, gotas formando ondinhas
 * e luz entrando pela superfície. Tudo em CSS/SVG (leve no celular).
 */
function PoolBackdrop() {
  const drops: Array<[string, string, string]> = [['12%', '28%', '0s'], ['84%', '18%', '-2.2s'], ['66%', '78%', '-4.1s'], ['38%', '86%', '-5.6s'], ['94%', '56%', '-1.3s']]
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      {/* Azulejos bem claros, sumindo nas bordas */}
      <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(var(--color-brand-100)_1px,transparent_1px),linear-gradient(90deg,var(--color-brand-100)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(60%_55%_at_80%_30%,black,transparent)]" />
      {/* Brilho de água atrás do celular */}
      <div className="tp-blob absolute -top-24 right-[-6rem] hidden size-[36rem] rounded-full bg-sky-200/45 blur-3xl md:block" />
      <div className="tp-blob absolute top-40 right-[18%] hidden size-[22rem] rounded-full bg-brand-200/35 blur-3xl [animation-delay:-7s] md:block" />
      {/* Gotas: ondinhas azuis que se abrem */}
      {drops.map(([left, top, delay]) => (
        <span key={left + top} className="absolute hidden md:block" style={{ left, top }}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="tp-drop absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-200" style={{ animationDelay: `calc(${delay} - ${i * 0.9}s)` }} />
          ))}
        </span>
      ))}
    </div>
  )
}

/** "Seu dia ainda é assim?" — a dor e a troca. */
function Pains() {
  const rows: Array<[string, string]> = [
    ['Agenda no caderno ou de cabeça', 'Agenda fixa que se monta sozinha toda semana'],
    ['Rota no improviso, cruzando a cidade', 'Melhor ordem de visitas com horário de chegada'],
    ['Cliente perguntando o que foi feito', 'Relatório com fotos enviado pelo WhatsApp'],
    ['Mensalidade esquecida, cobrança sem jeito', 'Quem pagou e quem atrasou, com lembrete pronto'],
    ['Lista de compras perdida no celular', 'Pedido pronto para o fornecedor em um toque'],
  ]
  return (
    <section className="mx-auto max-w-6xl px-4 py-24">
      <div className="tp-reveal max-w-2xl">
        <p className="text-sm font-semibold tracking-wider text-brand-600 uppercase">Seu dia ainda é assim?</p>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight md:text-5xl md:leading-[1.05]">Você é ótimo na piscina. O resto não precisa tomar seu tempo.</h2>
      </div>
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <div className="tp-reveal rounded-[2rem] bg-slate-50 p-6 md:p-8">
          <p className="font-bold text-slate-500">Sem o Titan Pool</p>
          <ul className="mt-5 space-y-4">
            {rows.map(([bad]) => (
              <li key={bad} className="flex items-start gap-3 text-slate-500"><span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-500"><X className="size-3.5" /></span><span className="tp-strike">{bad}</span></li>
            ))}
          </ul>
        </div>
        <div className="tp-reveal relative isolate overflow-hidden rounded-[2rem] p-6 text-white md:translate-y-8 md:p-8" style={{ transitionDelay: '120ms' }}>
          <WaterBackground light={0.4} />
          <p className="relative font-bold text-sky-100">Com o Titan Pool</p>
          <ul className="relative mt-5 space-y-4">
            {rows.map(([, good]) => (
              <li key={good} className="flex items-start gap-3 font-medium"><span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-white text-brand-600"><Check className="size-3.5" strokeWidth={3} /></span>{good}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

/** Missão da marca, com as palavras acendendo ao aparecer. */
function Mission() {
  const words = 'Nossa missão é dar ao piscineiro a mesma organização das grandes empresas — sem complicação, direto no celular.'.split(' ')
  const highlight = new Set(['piscineiro', 'organização', 'celular.'])
  return (
    <section className="relative isolate overflow-hidden bg-slate-50 py-24">
      <div className="mx-auto max-w-5xl px-4">
        <p className="tp-reveal text-sm font-semibold tracking-wider text-brand-600 uppercase">Sobre o Titan Pool</p>
        <p className="tp-reveal tp-words mt-4 text-3xl leading-tight font-bold tracking-tight text-slate-900 md:text-5xl md:leading-[1.15]">
          {words.map((w, i) => (
            <span key={i} style={{ transitionDelay: `${i * 45}ms` }} className={cn('inline-block', highlight.has(w) && 'text-brand-600')}>{w}&nbsp;</span>
          ))}
        </p>
        <RouteStory />
      </div>
    </section>
  )
}

/** Para quem é. */
function Audience() {
  const items: Array<[ReactNode, string, string]> = [
    [<UserRound key="a" className="size-6" />, 'Piscineiro autônomo', 'Semana organizada e cobrança sem constrangimento.'],
    [<Users key="b" className="size-6" />, 'Pequenas equipes', 'Histórico e fotos de cada piscina.'],
    [<Building2 key="c" className="size-6" />, 'Condomínios e clubes', 'Horário combinado e relatório em PDF.'],
  ]
  return (
    <section className="mx-auto max-w-6xl px-4 py-24">
      <div className="grid gap-10 md:grid-cols-12">
        <div className="tp-reveal md:col-span-4">
          <p className="text-sm font-semibold tracking-wider text-brand-600 uppercase">Para quem é</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">Do autônomo à empresa de manutenção.</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3 md:col-span-8">
          {items.map(([icon, t, d], i) => (
            <div key={t} className={cn('tp-reveal group rounded-[2rem] border border-slate-100 bg-white p-6 shadow-card transition-transform duration-300 hover:-translate-y-1', i === 1 && 'sm:mt-10')} style={{ transitionDelay: `${i * 100}ms` }}>
              <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-float transition-transform group-hover:scale-110">{icon}</span>
              <p className="mt-4 text-lg font-bold">{t}</p>
              <p className="mt-1 text-[15px] text-slate-600">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/** Garantias e confiança. */
function Guarantees({ hasSupport }: { hasSupport: boolean }) {
  const items: Array<[ReactNode, string, string]> = [
    [<Sparkles key="a" className="size-5" />, 'Teste sem cartão', 'Use tudo liberado antes de decidir.'],
    [<ShieldCheck key="b" className="size-5" />, 'Dados protegidos', 'Cada conta só vê os próprios dados.'],
    [<Download key="c" className="size-5" />, 'Seus dados são seus', 'Baixe um backup quando quiser.'],
    hasSupport
      ? [<MessageCircle key="d" className="size-5" />, 'Suporte no WhatsApp', 'Fale com a gente direto pelo celular.']
      : [<Smartphone key="d" className="size-5" />, 'Celular e notebook', 'Os mesmos dados em qualquer aparelho.'],
  ]
  return (
    <section className="px-4 pb-8">
      <div className="tp-reveal mx-auto grid max-w-6xl gap-px overflow-hidden rounded-[2rem] bg-slate-100 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([icon, t, d]) => (
          <div key={t} className="flex items-start gap-3 bg-white p-6">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">{icon}</span>
            <div><p className="font-bold">{t}</p><p className="text-sm text-slate-500">{d}</p></div>
          </div>
        ))}
      </div>
    </section>
  )
}

function Footer({ contact, signup }: { contact: string | null; signup: string | null }) {
  return (
    <footer className="bg-slate-950 text-slate-300">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-12">
        <div className="md:col-span-5">
          <div className="flex items-center gap-2 text-white">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand-600"><Droplets className="size-5" aria-hidden /></span>
            <span className="text-xl font-bold tracking-tight">Titan Pool</span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">O app do piscineiro: agenda, rota, relatórios da piscina, compras e financeiro em um só lugar, no celular e no notebook.</p>
        </div>
        <FooterCol title="Produto" links={[['#recursos', 'Recursos'], ['#rota', 'Rota inteligente'], ['#agua', 'Análise da água'], ['#planos', 'Planos']]} />
        <FooterCol title="Conta" links={[['/entrar', 'Entrar'], ...(signup ? [[signup, 'Criar conta grátis'] as [string, string]] : [])]} />
        <div className="md:col-span-3">
          <p className="text-sm font-semibold text-white">Contato</p>
          {contact
            ? <a href={contact} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm hover:text-white"><MessageCircle className="size-4" />WhatsApp</a>
            : <p className="mt-3 text-sm text-slate-400">Fale com a gente pelo app.</p>}
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-5 sm:flex-row">
          <p className="text-xs text-slate-500">© {YEAR} Titan Pool. Todos os direitos reservados.</p>
          <a href="https://armetec.com.br" target="_blank" rel="noopener" className="group inline-flex items-center gap-2 text-xs text-slate-400 transition-colors hover:text-white">
            Desenvolvido por
            <img src={armetecLogo} alt="Armetec" width={105} height={24} loading="lazy" decoding="async" className="h-6 w-auto opacity-90 transition-opacity group-hover:opacity-100" />
          </a>
        </div>
      </div>
    </footer>
  )
}

function FooterCol({ title, links }: { title: string; links: Array<[string, string]> }) {
  return (
    <div className="md:col-span-2">
      <p className="text-sm font-semibold text-white">{title}</p>
      <ul className="mt-3 space-y-2 text-sm">
        {links.map(([href, label]) => (
          <li key={href}>{href.startsWith('/') ? <a href={href} className="hover:text-white">{label}</a> : <a href={href} className="hover:text-white">{label}</a>}</li>
        ))}
      </ul>
    </div>
  )
}

function FloatChip({ className, icon, tone, children }: { className?: string; icon: ReactNode; tone: string; children: ReactNode }) {
  return (
    <div className={cn('tp-float absolute z-10 hidden items-center gap-2 rounded-2xl bg-white py-2 pr-3.5 pl-2 text-sm font-semibold text-slate-900 shadow-xl sm:flex', className)} aria-hidden>
      <span className={cn('flex size-7 items-center justify-center rounded-xl', tone)}>{icon}</span>{children}
    </div>
  )
}

function Metric({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="min-w-0 border-l border-white/15 pl-3 sm:pl-4">
      <p className="text-2xl font-extrabold sm:text-3xl md:text-4xl">{value}</p>
      <p className="mt-1 text-sm text-slate-400">{label}</p>
    </div>
  )
}

const MARQUEE: Array<[ReactNode, string]> = [
  [<CalendarDays key="a" className="size-5" />, 'Agenda fixa e avulsa'], [<Navigation key="b" className="size-5" />, 'Rota com previsão de chegada'],
  [<FlaskConical key="c" className="size-5" />, 'Análise da água'], [<Camera key="d" className="size-5" />, 'Fotos da visita'],
  [<Send key="e" className="size-5" />, 'Relatório no WhatsApp'], [<ShoppingBag key="f" className="size-5" />, 'Pedidos ao fornecedor'],
  [<Wallet key="g" className="size-5" />, 'Mensalidades'], [<FileText key="h" className="size-5" />, 'Recibos em PDF'], [<MapPin key="i" className="size-5" />, 'Busca por CEP'],
]

/** Faixa inclinada com os recursos passando. */
function Marquee() {
  const row = [...MARQUEE, ...MARQUEE]
  return (
    <div className="relative z-10 -my-6 -rotate-2 overflow-hidden bg-brand-600 py-4 text-white shadow-float" aria-label="Recursos do Titan Pool">
      <div className="tp-marquee flex w-max gap-10 pr-10">
        {row.map(([icon, t], i) => (
          <span key={i} className="flex shrink-0 items-center gap-2.5 text-lg font-semibold whitespace-nowrap" aria-hidden={i >= MARQUEE.length}>
            <span className="text-brand-200">{icon}</span>{t}<span className="ml-8 text-brand-300">✦</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** Recursos em mosaico de tamanhos diferentes, cada um com sua animação. */
function Bento() {
  const { ref, step } = useTicker(4, 1400)
  const card = 'tp-reveal group relative overflow-hidden rounded-[2rem] border border-slate-100 bg-white p-6 shadow-card transition-transform duration-300 hover:-translate-y-1'
  return (
    <div className="mt-12 grid auto-rows-[minmax(0,auto)] gap-4 md:grid-cols-6">
      {/* Agenda — grande */}
      <div ref={ref} className={cn(card, 'md:col-span-4 md:row-span-2')}>
        <BentoHead icon={<CalendarDays className="size-5" />} title="Agenda que se monta sozinha" text="Visitas toda semana, a cada 15 dias ou em dias do mês. Remarque ou pule com um toque." />
        <div className="mt-6 space-y-2">
          {([['Mariana Alves', 'Toda seg, qua e sex', '08:10'], ['Cond. Vila Azul', 'Horário combinado', '09:00'], ['Juliana Costa', 'Avulsa', '10:30'], ['Paulo Mendes', 'Todo mês: dias 5 e 25', '11:20']] as const).map(([n, d, t], i) => (
            <div key={n} className={cn('flex items-center gap-3 rounded-2xl border p-3 transition-all duration-500', i < step ? 'border-emerald-100 bg-emerald-50/50' : i === step ? 'border-brand-200 bg-brand-50/60 shadow-card' : 'border-slate-100')}>
              <span className={cn('flex size-9 items-center justify-center rounded-full text-sm font-bold transition-colors duration-500', i < step ? 'bg-emerald-500 text-white' : 'bg-brand-50 text-brand-700')}>{i < step ? <Check className="size-4" strokeWidth={3} /> : i + 1}</span>
              <div className="min-w-0 flex-1"><p className="font-semibold">{n}</p><p className="text-xs text-slate-500">{d}</p></div>
              <p className="flex items-center gap-1 font-bold tabular-nums"><Clock className="size-4 text-slate-400" aria-hidden />{t}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Água — alto */}
      <div className={cn(card, 'bg-gradient-to-b from-sky-50 to-white md:col-span-2 md:row-span-2')} style={{ transitionDelay: '80ms' }}>
        <BentoHead icon={<FlaskConical className="size-5" />} title="Relatório da piscina" text="pH, cloro e alcalinidade com sugestão de dosagem." />
        <div className="mt-6 flex justify-center"><Gauge /></div>
        <div className="mt-4 flex justify-center gap-2 text-xs font-semibold">
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">pH 7,4</span>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">Cloro 0,8</span>
        </div>
      </div>

      {/* Compras — largo */}
      <div className={cn(card, 'md:col-span-3')} style={{ transitionDelay: '120ms' }}>
        <BentoHead icon={<ShoppingBag className="size-5" />} title="Pedido ao fornecedor" text="A lista vai pronta para o WhatsApp dele." />
        <div className="mt-5 rounded-2xl bg-[#ece5dd] p-3">
          <div className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-tr-sm bg-[#d9fdd3] px-3 py-2 text-[13px] leading-snug shadow-sm">
            1. Cloro granulado — 2 balde<br />2. Margarida — 1 un<br /><span className="text-[10px] text-slate-500">08:42 ✓✓</span>
          </div>
          <div className="mt-2 flex w-fit items-center gap-1 rounded-2xl rounded-tl-sm bg-white px-3 py-2.5 shadow-sm" aria-label="Fornecedor digitando">
            {[0, 1, 2].map((i) => <span key={i} className="tp-typing size-1.5 rounded-full bg-slate-400" style={{ animationDelay: `${i * 160}ms` } as CSSProperties} />)}
          </div>
        </div>
      </div>

      {/* Financeiro — largo */}
      <div className={cn(card, 'md:col-span-3')} style={{ transitionDelay: '160ms' }}>
        <BentoHead icon={<Wallet className="size-5" />} title="Financeiro sem planilha" text="Quem pagou, quem atrasou e o lucro do mês." />
        <div className="mt-5 flex h-28 items-end gap-2" aria-hidden>
          {[45, 62, 38, 80, 70, 95].map((h, i) => (
            <div key={i} className="flex-1 rounded-t-lg bg-gradient-to-t from-brand-600 to-brand-400 tp-bar" style={{ height: `${h}%`, animationDelay: `${i * 90}ms` }} />
          ))}
        </div>
      </div>

      {/* Pequenos */}
      <div className={cn(card, 'md:col-span-2')} style={{ transitionDelay: '200ms' }}>
        <BentoHead icon={<FileText className="size-5" />} title="PDF e recibos" text="Relatório, pedido, recibo e fechamento do mês." />
      </div>
      <div className={cn(card, 'md:col-span-2')} style={{ transitionDelay: '240ms' }}>
        <BentoHead icon={<MapPin className="size-5" />} title="Endereço pelo CEP" text="Digite o CEP ou a rua: as opções aparecem na hora." />
      </div>
      <div className={cn(card, 'bg-slate-950 text-white md:col-span-2')} style={{ transitionDelay: '280ms' }}>
        <div className="flex gap-2 text-brand-300"><Smartphone className="size-6" /><Laptop className="size-6" /></div>
        <p className="mt-4 text-lg font-bold">Celular e notebook</p>
        <p className="mt-1 text-sm text-slate-400">Os mesmos dados em qualquer aparelho.</p>
      </div>
    </div>
  )
}

function BentoHead({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <>
      <span className="flex size-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition-transform duration-300 group-hover:scale-110">{icon}</span>
      <h3 className="mt-4 text-xl font-bold">{title}</h3>
      <p className="mt-1 text-[15px] text-slate-600">{text}</p>
    </>
  )
}

/** Medidor de pH animado (arco que preenche ao aparecer). */
function Gauge() {
  return (
    <svg viewBox="0 0 120 70" className="w-44" aria-hidden>
      <path d="M10 62 A50 50 0 0 1 110 62" stroke="#e2e8f0" strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d="M10 62 A50 50 0 0 1 110 62" stroke="url(#tp-g)" strokeWidth="10" fill="none" strokeLinecap="round" pathLength={100} strokeDasharray="100" strokeDashoffset="38" className="tp-gauge" />
      <defs><linearGradient id="tp-g"><stop offset="0" stopColor="#10b981" /><stop offset="1" stopColor="#3478f6" /></linearGradient></defs>
      <text x="60" y="58" textAnchor="middle" fontSize="20" fontWeight="800" fill="#0f172a">7,4</text>
    </svg>
  )
}

/** Três passos com uma linha que se desenha ligando um ao outro. */
function Steps() {
  const steps = [
    ['Cadastre seus clientes', 'Pelo CEP, em segundos.'],
    ['Siga a rota do dia', 'Visitas em ordem, com horário.'],
    ['Registre e receba', 'Relatório no WhatsApp e mensalidade em dia.'],
  ]
  return (
    <section id="como-funciona" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24">
      <div className="tp-reveal max-w-xl">
        <p className="text-sm font-semibold tracking-wider text-brand-600 uppercase">Como funciona</p>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight md:text-5xl md:leading-[1.05]">Comece hoje, em três passos.</h2>
      </div>
      <div className="relative mt-14">
        <svg className="tp-reveal absolute top-6 left-0 hidden h-24 w-full md:block" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden>
          <path d="M40 20 C 250 20, 250 80, 500 80 S 750 20, 960 40" stroke="#bcd6ff" strokeWidth="3" strokeDasharray="8 10" fill="none" />
        </svg>
        <ol className="relative grid gap-6 md:grid-cols-3">
          {steps.map(([t, d], i) => (
            <li key={t} className={cn('tp-reveal rounded-[2rem] border border-slate-100 bg-white p-6 shadow-card', i === 1 && 'md:mt-16', i === 2 && 'md:mt-6')} style={{ transitionDelay: `${i * 120}ms` }}>
              <span className="flex size-12 items-center justify-center rounded-2xl bg-slate-950 text-lg font-bold text-white">{i + 1}</span>
              <h3 className="mt-4 text-xl font-bold">{t}</h3>
              <p className="mt-1.5 text-[15px] text-slate-600">{d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
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
    <div ref={ref} className="relative mx-auto w-full max-w-[310px] text-slate-900" aria-label="Exemplo da agenda do dia no app" role="img">
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
    <div className="tp-reveal mt-14 grid items-center gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className="overflow-hidden rounded-[2rem] bg-white/5 p-3 ring-1 ring-white/10 lg:-ml-10">
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
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white/10 p-1" role="radiogroup" aria-label="Ordem das visitas">
          {[[false, 'Ordem da lista'], [true, 'Rota otimizada']].map(([v, l]) => (
            <button key={String(v)} type="button" role="radio" aria-checked={optimized === v} onClick={() => setOptimized(v as boolean)}
              className={cn('h-11 rounded-xl text-sm font-semibold transition-colors', optimized === v ? 'bg-white text-brand-700 shadow-card' : 'text-slate-300 hover:text-white')}>{l as string}</button>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10"><p className="text-sm text-slate-400">Percurso</p><p className="text-3xl font-bold tabular-nums">{cur.km.toFixed(1).replace('.', ',')} km</p></div>
          <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10"><p className="text-sm text-slate-400">No trânsito</p><p className="text-3xl font-bold tabular-nums">{cur.minutes} min</p></div>
        </div>
        <p className={cn('mt-4 rounded-2xl px-4 py-3 text-[15px] font-medium transition-colors', optimized ? 'bg-emerald-400/15 text-emerald-200' : 'bg-amber-400/15 text-amber-200')}>
          {optimized ? `${saved.toFixed(1).replace('.', ',')} km a menos neste exemplo de 6 clientes — tempo que vira mais uma piscina no dia.` : 'Na ordem do cadastro o carro vai e volta pela cidade. Toque em “Rota otimizada”.'}
        </p>
        <p className="mt-3 text-xs text-slate-500">Exemplo com 6 endereços em Campinas/SP, distâncias estimadas.</p>
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
    <div className="tp-reveal mt-12 grid gap-6 lg:grid-cols-12">
      <div className="space-y-5 rounded-[2rem] border border-slate-100 bg-white p-6 shadow-card lg:col-span-5 lg:mt-10">
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
      <div className="flex flex-col rounded-[2rem] bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white shadow-float lg:col-span-7 lg:-mb-10">
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

/* ------------------------------------------------------------------ */
/* Menu do celular                                                      */
/* ------------------------------------------------------------------ */

const MENU_ITEMS: Array<[string, string, ReactNode]> = [
  ['#app', 'Veja o app', <Smartphone key="a" className="size-5" />],
  ['#recursos', 'Recursos', <Sparkles key="b" className="size-5" />],
  ['#rota', 'Rota inteligente', <Navigation key="c" className="size-5" />],
  ['#agua', 'Análise da água', <FlaskConical key="d" className="size-5" />],
  ['#planos', 'Planos', <Wallet key="e" className="size-5" />],
  ['#duvidas', 'Dúvidas', <MessageCircle key="f" className="size-5" />],
]

/** Menu em tela cheia: azul de piscina, itens grandes entrando em cascata e as ações embaixo. */
function MobileMenu({ open, onClose, signup, trialDays }: { open: boolean; onClose: () => void; signup: string | null; trialDays: number }) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="tp-menu fixed inset-0 z-50 flex flex-col overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 text-white lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="tp-blob pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-sky-400/30 blur-3xl" aria-hidden />
      <Bubbles count={8} />
      <div className="relative flex h-16 items-center justify-between px-4">
        <span className="inline-flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-white/20"><Droplets className="size-5" aria-hidden /></span>
          <span className="text-xl font-bold tracking-tight">Titan Pool</span>
        </span>
        <button type="button" onClick={onClose} className="flex size-10 items-center justify-center rounded-xl bg-white/15 hover:bg-white/25" aria-label="Fechar menu"><X className="size-5" /></button>
      </div>
      <nav className="relative mt-4 flex-1 overflow-y-auto px-4">
        <ul className="space-y-1.5">
          {MENU_ITEMS.map(([href, label, icon], i) => (
            <li key={href} className="tp-menu-item" style={{ animationDelay: `${80 + i * 55}ms` }}>
              <a href={href} onClick={onClose} className="group flex items-center gap-4 rounded-2xl px-3 py-3.5 text-2xl font-bold tracking-tight hover:bg-white/10">
                <span className="flex size-11 items-center justify-center rounded-xl bg-white/15 transition-transform group-active:scale-90">{icon}</span>
                {label}
                <ArrowRight className="ml-auto size-5 opacity-50" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="tp-menu-item relative space-y-2.5 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" style={{ animationDelay: '420ms' }}>
        {signup && (
          <a href={signup} className="flex h-13 items-center justify-center gap-2 rounded-xl bg-white text-base font-semibold text-brand-700">
            Testar grátis por {trialDays} dias <ArrowRight className="size-5" aria-hidden />
          </a>
        )}
        <a href="/entrar" className="flex h-13 items-center justify-center rounded-xl bg-white/15 text-base font-semibold ring-1 ring-white/30">Já tenho conta · Entrar</a>
      </div>
    </div>
  )
}

/** Hambúrguer que vira X. */
function Burger({ open }: { open: boolean }) {
  return (
    <span className="relative block h-4 w-5" aria-hidden>
      <span className={cn('absolute left-0 h-0.5 w-5 rounded-full bg-current transition-all duration-300', open ? 'top-[7px] rotate-45' : 'top-0')} />
      <span className={cn('absolute top-[7px] left-0 h-0.5 rounded-full bg-current transition-all duration-300', open ? 'w-0 opacity-0' : 'w-3.5')} />
      <span className={cn('absolute left-0 h-0.5 w-5 rounded-full bg-current transition-all duration-300', open ? 'top-[7px] -rotate-45' : 'top-[14px]')} />
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Vitrine: telas reais do app                                          */
/* ------------------------------------------------------------------ */

const SCREENS: Array<{ src: string; title: string; caption: string }> = [
  { src: screenAgenda, title: 'Agenda do dia', caption: 'Ordem de chegada com horário' },
  { src: screenVisita, title: 'Relatório da visita', caption: 'Água, serviços e produtos' },
  { src: screenCompras, title: 'Pedido de compra', caption: 'Pronto para o fornecedor' },
  { src: screenFinanceiro, title: 'Financeiro', caption: 'Lucro do mês na hora' },
  { src: screenClientes, title: 'Clientes', caption: 'Tudo de cada piscina' },
]

/** Carrossel em leque com as telas do app; gira sozinho, aceita toque, arrastar e clique. */
function Showcase() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const startX = useRef<number | null>(null)
  const n = SCREENS.length
  const go = (i: number) => setActive(((i % n) + n) % n)

  useEffect(() => {
    if (prefersReducedMotion() || paused || !box.current) return
    let visible = false
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting }, { threshold: 0.3 })
    io.observe(box.current)
    const id = setInterval(() => { if (visible) setActive((a) => (a + 1) % n) }, 3200)
    return () => { clearInterval(id); io.disconnect() }
  }, [paused, n])

  return (
    <section id="app" className="relative isolate scroll-mt-16 overflow-hidden bg-gradient-to-b from-white via-brand-50/60 to-white py-20 md:py-28">
      <div className="tp-reveal mx-auto max-w-2xl px-4 text-center">
        <p className="text-sm font-semibold tracking-wider text-brand-600 uppercase">Veja o app</p>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight md:text-5xl">Simples assim, no seu celular.</h2>
      </div>
      <div
        ref={box}
        className="tp-reveal relative mx-auto mt-12 h-[480px] max-w-5xl touch-pan-y select-none md:h-[600px]"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onPointerDown={(e) => { startX.current = e.clientX }}
        onPointerUp={(e) => {
          if (startX.current === null) return
          const dx = e.clientX - startX.current
          if (Math.abs(dx) > 40) go(active + (dx < 0 ? 1 : -1))
          startX.current = null
        }}
        aria-roledescription="carrossel"
        aria-label="Telas do app"
      >
        {SCREENS.map((s, i) => {
          let o = i - active
          if (o > n / 2) o -= n
          if (o < -n / 2) o += n
          const abs = Math.abs(o)
          return (
            <button
              key={s.title}
              type="button"
              onClick={() => go(i)}
              aria-label={`${s.title}: ${s.caption}`}
              aria-current={o === 0}
              className="absolute top-0 left-1/2 w-[230px] transition-all duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] md:w-[290px]"
              style={{
                transform: `translateX(calc(-50% + ${o * 62}%)) scale(${1 - abs * 0.14}) rotate(${o * 3}deg)`,
                zIndex: 10 - abs,
                opacity: abs > 2 ? 0 : 1 - abs * 0.22,
                filter: abs ? 'saturate(0.85)' : undefined,
              }}
              tabIndex={abs > 1 ? -1 : 0}
            >
              <span className="block rounded-[2.4rem] border-[9px] border-slate-900 bg-slate-900 shadow-[0_30px_60px_-20px_rgb(15_36_86/0.45)]">
                <img src={s.src} alt="" width={640} height={1036} loading="lazy" decoding="async" className="block w-full rounded-[1.8rem]" draggable={false} />
              </span>
            </button>
          )
        })}
      </div>
      <div className="relative mt-6 flex flex-col items-center gap-4 px-4">
        <p key={active} className="tp-fade text-center">
          <span className="block text-lg font-bold">{SCREENS[active].title}</span>
          <span className="text-slate-500">{SCREENS[active].caption}</span>
        </p>
        <div className="flex gap-2" role="tablist" aria-label="Escolher tela">
          {SCREENS.map((s, i) => (
            <button key={s.title} type="button" role="tab" aria-selected={i === active} aria-label={s.title} onClick={() => go(i)}
              className={cn('h-2 rounded-full transition-all duration-500', i === active ? 'w-8 bg-brand-600' : 'w-2 bg-slate-300 hover:bg-slate-400')} />
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Animação: a van percorre o dia                                       */
/* ------------------------------------------------------------------ */

const ROAD: Array<[number, number]> = [[40, 210], [170, 210], [250, 110], [400, 110], [480, 210], [620, 210], [700, 110], [800, 110]]
const HOUSES: Array<{ at: number; x: number; y: number }> = [
  { at: 1, x: 150, y: 245 }, { at: 3, x: 380, y: 25 }, { at: 5, x: 600, y: 245 }, { at: 7, x: 780, y: 25 },
]
const ROAD_PATH = ROAD.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ')
const ROAD_LEN = ROAD.slice(1).reduce((sum, [x, y], i) => sum + Math.hypot(x - ROAD[i][0], y - ROAD[i][1]), 0)
/** Fração do caminho em que a van chega a cada casa. */
const fractionAt = (index: number) =>
  ROAD.slice(1, index + 1).reduce((sum, [x, y], i) => sum + Math.hypot(x - ROAD[i][0], y - ROAD[i][1]), 0) / ROAD_LEN

/**
 * A rota do dia contada sem texto: a van passa e cada piscina fica pronta.
 * Animação nativa do SVG (um só relógio para van, estrada e casas); parada com "menos movimento".
 */
function RouteStory() {
  const [still] = useState(() => prefersReducedMotion())
  const dur = '10s'
  const end = 0.85 // a van chega ao fim aos 85% do ciclo e espera um pouco
  return (
    <div className="tp-reveal relative mx-auto mt-14 max-w-4xl overflow-hidden rounded-[2rem] bg-white p-4 shadow-card ring-1 ring-slate-100 md:p-6" aria-label="Animação: a van percorre a rota e conclui as visitas" role="img">
      <svg viewBox="0 0 840 300" className="w-full">
        <rect x="0" y="0" width="840" height="300" rx="24" fill="#f4f7fc" />
        <path d={ROAD_PATH} stroke="#dbe5f3" strokeWidth="26" fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <path d={ROAD_PATH} stroke="#fff" strokeWidth="3" strokeDasharray="10 14" fill="none" strokeLinejoin="round" />
        <path d={ROAD_PATH} stroke="#3478f6" strokeWidth="5" fill="none" strokeLinejoin="round" strokeLinecap="round" pathLength={100} strokeDasharray="100" strokeDashoffset={still ? 0 : 100}>
          {!still && <animate attributeName="stroke-dashoffset" values="100;0;0" keyTimes={`0;${end};1`} dur={dur} repeatCount="indefinite" />}
        </path>
        {HOUSES.map((h, i) => {
          const f = (fractionAt(h.at) * end).toFixed(3)
          return (
            <g key={i} transform={`translate(${h.x - 50} ${h.y - 10})`}>
              <rect x="0" y="18" width="44" height="32" rx="4" fill="#fff" stroke="#cbd5e1" />
              <path d="M-4 20 L22 0 L48 20 Z" fill="#94a3b8" />
              <rect x="52" y="22" width="44" height="26" rx="8" fill="#bcd6ff" />
              <rect x="56" y="26" width="36" height="18" rx="6" fill="#5996ff" className="tp-pool-shimmer" />
              <g transform="translate(74 -8)">
                <circle r="12" fill={still ? '#10b981' : '#1f62e8'}>
                  {!still && <animate attributeName="fill" values="#1f62e8;#10b981" keyTimes={`0;${f}`} calcMode="discrete" dur={dur} repeatCount="indefinite" />}
                </circle>
                <text y="4.5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff" opacity={still ? 0 : 1}>
                  {i + 1}
                  {!still && <animate attributeName="opacity" values="1;0" keyTimes={`0;${f}`} calcMode="discrete" dur={dur} repeatCount="indefinite" />}
                </text>
                <path d="M-5 0 L-1.5 4 L5 -4" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={still ? 1 : 0}>
                  {!still && <animate attributeName="opacity" values="0;1" keyTimes={`0;${f}`} calcMode="discrete" dur={dur} repeatCount="indefinite" />}
                </path>
              </g>
            </g>
          )
        })}
        <g transform="translate(14 230)"><circle r="14" cx="26" cy="-20" fill="#0f172a" /><text x="26" y="-15" textAnchor="middle" fontSize="13" fill="#fff">⌂</text></g>
        {/* a van */}
        <g transform={still ? `translate(${ROAD[ROAD.length - 1].join(' ')})` : undefined}>
          {!still && <animateMotion path={ROAD_PATH} keyPoints="0;1;1" keyTimes={`0;${end};1`} calcMode="linear" dur={dur} repeatCount="indefinite" />}
          <g transform="translate(-20 -13)">
            <rect width="40" height="22" rx="6" fill="#1f62e8" />
            <rect x="26" y="4" width="10" height="8" rx="2" fill="#bcd6ff" />
            <circle cx="10" cy="23" r="4.5" fill="#0f172a" /><circle cx="30" cy="23" r="4.5" fill="#0f172a" />
          </g>
        </g>
      </svg>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium text-slate-600">
        <span className="flex items-center gap-2"><span className="size-3 rounded-full bg-brand-600" />A caminho</span>
        <span className="flex items-center gap-2"><span className="size-3 rounded-full bg-emerald-500" />Visita feita · relatório enviado</span>
      </div>
    </div>
  )
}
