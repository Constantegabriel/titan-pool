import {
  ArrowRight, CalendarDays, Car, Check, ChevronDown, Clock, FileText, FlaskConical, MapPin, Route as RouteIcon, ShoppingBag,
  Smartphone, Sparkles, Wallet,
} from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { rpc, supabase } from '@/data'
import { whatsappLink } from '@/domain/format'
import { cn } from '@/lib/cn'
import { Brand } from './auth'

const FEATURES: Array<{ icon: ReactNode; title: string; text: string }> = [
  { icon: <CalendarDays className="size-5" />, title: 'Agenda que se monta sozinha', text: 'Visitas fixas toda semana, a cada 15 dias ou em dias do mês, mais as avulsas. Remarque ou pule com um toque.' },
  { icon: <RouteIcon className="size-5" />, title: 'Rota do dia com previsão', text: '1º, 2º, 3º cliente na melhor ordem, com horário de chegada, km rodados e hora de término. Abre no Maps ou Waze.' },
  { icon: <FlaskConical className="size-5" />, title: 'Relatório de visita', text: 'pH, cloro e alcalinidade com sugestão de dosagem, checklist, produtos e fotos. Envie ao cliente pelo WhatsApp.' },
  { icon: <ShoppingBag className="size-5" />, title: 'Compras com fornecedor', text: 'Monte a lista (cloro, margarida, peneira…), escolha o cliente e mande direto no WhatsApp do fornecedor.' },
  { icon: <Wallet className="size-5" />, title: 'Financeiro sem planilha', text: 'Mensalidades, quem pagou, quem atrasou, gastos por categoria e quanto sobra de cada cliente.' },
  { icon: <FileText className="size-5" />, title: 'PDF e recibos', text: 'Relatório de visita, pedido de compra, recibo de mensalidade e fechamento do mês em PDF.' },
]

const FAQ: Array<[string, string]> = [
  ['Preciso instalar alguma coisa?', 'Não. O Titan Pool abre no navegador do celular e pode ser adicionado à tela inicial como um app.'],
  ['Funciona no celular e no computador?', 'Sim. Seus dados ficam salvos na nuvem e aparecem iguais em qualquer aparelho em que você entrar.'],
  ['Como funciona o teste grátis?', 'Você cria a conta e usa tudo liberado durante o período de teste, sem cartão de crédito. Depois é só falar com a gente para continuar.'],
  ['Meus dados ficam seguros?', 'Cada conta só enxerga os próprios dados, protegidos por login e por regras no banco de dados.'],
]

const YEAR = new Date().getFullYear()

function Cta({ signup, contact, trialDays, className, light }: { signup: string | null; contact: string | null; trialDays: number; className?: string; light?: boolean }) {
  if (signup) {
    return (
      <Link to={signup} className={cn('inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-base font-semibold transition-colors', light ? 'bg-white text-brand-700 hover:bg-brand-50' : 'bg-brand-600 text-white shadow-float hover:bg-brand-700', className)}>
        Testar grátis por {trialDays} dias <ArrowRight className="size-5" aria-hidden />
      </Link>
    )
  }
  if (!contact) return null
  return (
    <a href={contact} target="_blank" rel="noopener noreferrer" className={cn('inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-base font-semibold', light ? 'bg-white text-brand-700' : 'bg-brand-600 text-white shadow-float', className)}>
      Quero conhecer <ArrowRight className="size-5" aria-hidden />
    </a>
  )
}

export function LandingPage() {
  const [settings, setSettings] = useState<{ trial_days: number; allow_self_signup: boolean; support_whatsapp: string }>({ trial_days: 14, allow_self_signup: true, support_whatsapp: '' })
  useEffect(() => {
    if (supabase) rpc<typeof settings>('public_settings').then(setSettings).catch(() => {})
    document.title = 'Titan Pool · O app do piscineiro'
    return () => {
      document.title = 'Titan Pool'
    }
  }, [])
  const signup = settings.allow_self_signup ? '/cadastro' : null
  const contact = settings.support_whatsapp ? whatsappLink(settings.support_whatsapp, 'Olá! Quero conhecer o Titan Pool.') : null

  const cta = { signup, contact, trialDays: settings.trial_days }

  return (
    <div className="min-h-svh bg-white text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Brand />
          <nav className="hidden gap-7 text-sm font-medium text-slate-600 md:flex">
            <a href="#recursos" className="hover:text-brand-700">Recursos</a>
            <a href="#como-funciona" className="hover:text-brand-700">Como funciona</a>
            <a href="#planos" className="hover:text-brand-700">Planos</a>
            <a href="#duvidas" className="hover:text-brand-700">Dúvidas</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/entrar" className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Entrar</Link>
            {signup && <Link to={signup} className="hidden rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white sm:inline-flex">Testar grátis</Link>}
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-16 md:grid-cols-[1.1fr_1fr] md:pt-20">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-700 shadow-card">
              <Sparkles className="size-3.5" aria-hidden /> Feito para piscineiros
            </p>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight md:text-6xl">
              Sua rota, seus clientes e seu dinheiro <span className="text-brand-600">no celular.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600">
              O Titan Pool organiza a agenda de visitas, calcula a melhor rota do dia, gera o relatório da piscina e controla mensalidades e compras. Simples para usar na correria.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Cta {...cta} />
              <a href="#recursos" className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-base font-semibold text-slate-700 hover:bg-slate-50">Ver recursos</a>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
              {['Sem cartão de crédito', 'Pronto em 5 minutos', 'Funciona no celular'].map((t) => (
                <li key={t} className="flex items-center gap-1.5"><Check className="size-4 text-emerald-500" aria-hidden />{t}</li>
              ))}
            </ul>
          </div>
          <PhoneMock />
        </div>
      </section>

      <section id="recursos" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
        <SectionHead kicker="Recursos" title="Tudo que o dia a dia da piscina pede" text="Do bom dia ao fechamento do mês, num app só." />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-3xl border border-slate-100 bg-white p-6 shadow-card">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">{f.icon}</span>
              <h3 className="mt-4 text-lg font-bold">{f.title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-slate-600">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="como-funciona" className="scroll-mt-20 bg-canvas">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <SectionHead kicker="Como funciona" title="Comece hoje, em três passos" />
          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              ['Cadastre seus clientes', 'Endereço, piscina, mensalidade e os dias de visita. Marque a localização com um toque no GPS.'],
              ['Siga a rota do dia', 'Abra o app de manhã: as visitas já estão em ordem, com horário previsto e navegação.'],
              ['Registre e receba', 'Relatório pelo WhatsApp, mensalidades em dia e o financeiro do mês pronto.'],
            ].map(([title, text], i) => (
              <li key={title} className="rounded-3xl bg-white p-6 shadow-card">
                <span className="flex size-10 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white">{i + 1}</span>
                <h3 className="mt-4 text-lg font-bold">{title}</h3>
                <p className="mt-1.5 text-[15px] text-slate-600">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="planos" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
        <SectionHead kicker="Planos" title="Experimente sem compromisso" />
        <div className="mx-auto mt-12 max-w-md rounded-3xl border-2 border-brand-600 bg-white p-7 shadow-float">
          <p className="text-sm font-semibold text-brand-700">Titan Pool completo</p>
          <p className="mt-2 text-4xl font-extrabold tracking-tight">{settings.trial_days} dias grátis</p>
          <p className="mt-1 text-slate-500">Depois, plano mensal acessível. Fale com a gente.</p>
          <ul className="mt-6 space-y-2.5 text-[15px]">
            {['Clientes e piscinas ilimitados', 'Agenda, mapa e rota otimizada', 'Relatórios, fotos e PDFs', 'Compras e financeiro', 'Celular e computador'].map((t) => (
              <li key={t} className="flex items-center gap-2"><Check className="size-5 text-brand-600" aria-hidden />{t}</li>
            ))}
          </ul>
          <Cta {...cta} className="mt-7 w-full" />
          {contact && <a href={contact} target="_blank" rel="noopener noreferrer" className="mt-3 block text-center text-sm font-semibold text-slate-600 hover:text-brand-700">Tirar dúvidas no WhatsApp</a>}
        </div>
      </section>

      <section id="duvidas" className="scroll-mt-20 bg-canvas">
        <div className="mx-auto max-w-3xl px-4 py-20">
          <SectionHead kicker="Dúvidas" title="Perguntas frequentes" />
          <div className="mt-10 space-y-3">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group rounded-2xl bg-white p-5 shadow-card">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
                  {q}<ChevronDown className="size-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <p className="mt-2 text-[15px] text-slate-600">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-br from-brand-600 to-brand-800">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center text-white">
          <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">Menos papel, mais piscina limpa.</h2>
          <p className="mt-3 text-brand-100">Organize sua semana em minutos e chegue no horário em todos os clientes.</p>
          <Cta {...cta} light className="mt-8" />
        </div>
      </section>

      <footer className="border-t border-slate-100">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-slate-500 sm:flex-row">
          <Brand />
          <p>© {YEAR} Titan Pool</p>
          <Link to="/entrar" className="font-semibold text-slate-700">Entrar</Link>
        </div>
      </footer>
    </div>
  )
}

function SectionHead({ kicker, title, text }: { kicker: string; title: string; text?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">{kicker}</p>
      <h2 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">{title}</h2>
      {text && <p className="mt-3 text-lg text-slate-600">{text}</p>}
    </div>
  )
}

/** Celular ilustrando a agenda do dia (feito em HTML, sem imagens). */
function PhoneMock() {
  const stops = [
    ['1', 'Mariana Alves', 'Cambuí', '08:10'],
    ['2', 'Cond. Vila Azul', 'Taquaral', '09:00'],
    ['3', 'Roberto Santos', 'Barão Geraldo', '10:25'],
  ] as const
  return (
    <div className="relative mx-auto w-full max-w-[300px]" aria-hidden>
      <div className="absolute -inset-8 -z-10 rounded-full bg-brand-200/40 blur-3xl" />
      <div className="rounded-[2.6rem] border-[10px] border-slate-900 bg-canvas p-3 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-slate-300" />
        <p className="text-[10px] font-medium text-slate-500">Segunda-feira, 23 de novembro</p>
        <p className="text-lg font-bold">Bom dia</p>
        <div className="mt-2 grid grid-cols-7 gap-1">
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d, i) => (
            <div key={d} className={cn('rounded-lg py-1 text-center', i === 0 ? 'bg-brand-600 text-white' : 'bg-white text-slate-600')}>
              <p className="text-[8px]">{d}</p><p className="text-[11px] font-bold">{23 + i > 30 ? 23 + i - 30 : 23 + i}</p>
            </div>
          ))}
        </div>
        <div className="mt-2 overflow-hidden rounded-2xl bg-white shadow-card">
          <svg viewBox="0 0 260 110" className="h-24 w-full bg-[#e8eef7]">
            <path d="M0 70 Q60 40 120 60 T260 50" stroke="#fff" strokeWidth="10" fill="none" />
            <path d="M40 0 L70 110 M170 0 L150 110" stroke="#fff" strokeWidth="7" />
            <path d="M60 85 L120 58 L180 38 L215 72" stroke="#1f62e8" strokeWidth="3" strokeDasharray="2 6" strokeLinecap="round" fill="none" />
            <circle cx="60" cy="85" r="8" fill="#0f172a" />
            {[[120, 58, '1'], [180, 38, '2'], [215, 72, '3']].map(([x, y, n]) => (
              <g key={n}><circle cx={x} cy={y} r="10" fill="#1f62e8" stroke="#fff" strokeWidth="2.5" /><text x={x} y={Number(y) + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">{n}</text></g>
            ))}
          </svg>
          <div className="grid grid-cols-3 text-center text-[9px] text-slate-400">
            <p className="py-1.5">VISITAS<br /><b className="text-[11px] text-slate-800">0/3</b></p>
            <p className="py-1.5">PERCURSO<br /><b className="text-[11px] text-slate-800">18 km</b></p>
            <p className="py-1.5">TÉRMINO<br /><b className="text-[11px] text-slate-800">11:05</b></p>
          </div>
        </div>
        <div className="mt-2 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 p-3 text-white">
          <p className="flex justify-between text-[9px] text-brand-100"><span>Próxima visita · 1ª do dia</span><span className="flex items-center gap-0.5"><Car className="size-3" />10 min</span></p>
          <div className="mt-1 flex items-end justify-between">
            <p className="text-sm font-bold">Mariana Alves</p>
            <p className="text-xl font-bold">08:10</p>
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-[9px] text-brand-50"><MapPin className="size-3" />Rua das Palmeiras, 120</p>
        </div>
        <div className="mt-2 space-y-1.5">
          {stops.map(([n, name, hood, t]) => (
            <div key={n} className="flex items-center gap-2 rounded-xl bg-white p-2 shadow-card">
              <span className="flex size-6 items-center justify-center rounded-full bg-brand-50 text-[10px] font-bold text-brand-700">{n}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-semibold">{name}</p><p className="text-[9px] text-slate-400">{hood}</p></div>
              <p className="flex items-center gap-0.5 text-[11px] font-bold"><Clock className="size-3 text-slate-400" />{t}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute -right-4 bottom-24 hidden rounded-2xl bg-white px-3 py-2 shadow-float sm:flex sm:items-center sm:gap-2">
        <Smartphone className="size-4 text-brand-600" />
        <span className="text-xs font-semibold">Relatório enviado ✓</span>
      </div>
    </div>
  )
}
