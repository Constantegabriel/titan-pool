import { type CSSProperties, useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'

/*
 * Identidade "água" do Titan Pool:
 * - WaterBackground: luz dançando no fundo da piscina (shader WebGL próprio), leve:
 *   meia resolução, até 30 fps, pausa fora da tela/aba oculta, um quadro só com
 *   "menos movimento" e gradiente CSS quando não há WebGL;
 * - Waves: ondas em camadas deslizando (só transform);
 * - Bubbles: bolhas subindo.
 */

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`

// Cáusticas: ondas senoidais com o domínio torcido; onde as faixas se cruzam a luz concentra.
const FRAG = `
precision mediump float;
uniform vec2 u_res;
uniform float u_t;
uniform vec3 u_top;
uniform vec3 u_bottom;
uniform float u_light;

float caustic(vec2 p, float t) {
  float v = 0.0;
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    p += 0.55 * vec2(sin(p.y * 1.27 + t * 0.71 + fk * 1.3), cos(p.x * 1.13 - t * 0.63 + fk * 1.9));
    v += abs(sin(p.x + t * 0.45) * sin(p.y - t * 0.38));
  }
  return v * 0.25;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  vec2 p = uv * vec2(u_res.x / u_res.y, 1.0) * 3.2;
  float t = u_t;
  float c1 = pow(1.0 - caustic(p, t), 7.0);
  float c2 = pow(1.0 - caustic(p * 1.6 + 7.3, t * 1.2), 9.0);
  float light = (c1 * 0.9 + c2 * 0.5) * u_light;
  vec3 base = mix(u_bottom, u_top, smoothstep(0.0, 1.0, uv.y));
  // Raios de sol entrando na água, vindos do alto.
  float rays = 0.06 * sin(uv.x * 9.0 + uv.y * 3.0 + t * 0.3) * smoothstep(0.2, 1.0, uv.y);
  vec3 col = base + vec3(0.75, 0.92, 1.0) * light + rays;
  gl_FragColor = vec4(col, 1.0);
}`

const hex = (h: string): [number, number, number] => {
  const n = Number.parseInt(h.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function WaterBackground({ className, top = '#3d8bff', bottom = '#0b3aa8', light = 0.7, style }: {
  className?: string; top?: string; bottom?: string; light?: number; style?: CSSProperties
}) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const gl = el.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' })
    if (!gl) return
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const uRes = gl.getUniformLocation(prog, 'u_res')
    const uT = gl.getUniformLocation(prog, 'u_t')
    gl.uniform3fv(gl.getUniformLocation(prog, 'u_top'), hex(top))
    gl.uniform3fv(gl.getUniformLocation(prog, 'u_bottom'), hex(bottom))
    gl.uniform1f(gl.getUniformLocation(prog, 'u_light'), light)
    el.dataset.ready = 'true'

    // Meia resolução: a água é suave, não precisa de cada pixel.
    const scale = 0.5
    const resize = () => {
      const w = Math.max(1, Math.round(el.clientWidth * scale))
      const h = Math.max(1, Math.round(el.clientHeight * scale))
      if (el.width !== w || el.height !== h) {
        el.width = w
        el.height = h
        gl.viewport(0, 0, w, h)
        gl.uniform2f(uRes, w, h)
      }
    }
    const draw = (time: number) => {
      resize()
      gl.uniform1f(uT, time / 1000)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    if (reducedMotion()) {
      draw(12_000)
      return
    }
    let visible = true
    let frame = 0
    let last = 0
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop)
      if (!visible || document.hidden || now - last < 33) return
      last = now
      draw(now)
    }
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting })
    io.observe(el)
    frame = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(frame)
      io.disconnect()
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [top, bottom, light])

  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} style={style} aria-hidden>
      {/* Sem WebGL fica este gradiente com brilhos suaves. */}
      <div className="tp-water-fallback absolute inset-0" style={{ background: `linear-gradient(180deg, ${top}, ${bottom})` }} />
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
    </div>
  )
}

const WAVE = 'M0 40 C 150 70 350 10 500 40 S 850 70 1000 40 S 1350 10 1500 40 S 1850 70 2000 40 V 120 H 0 Z'

/** Ondas em camadas na borda de uma seção (a cor é a da seção seguinte). */
export function Waves({ className, color = '#ffffff', flip }: { className?: string; color?: string; flip?: boolean }) {
  return (
    <div className={cn('pointer-events-none absolute inset-x-0 h-20 overflow-hidden md:h-28', flip ? 'top-0 rotate-180' : 'bottom-0', className)} aria-hidden>
      {[
        { o: 0.35, d: '18s', y: 0 },
        { o: 0.55, d: '12s', y: 10 },
        { o: 1, d: '8s', y: 22 },
      ].map((l, i) => (
        <svg key={i} viewBox="0 0 2000 120" preserveAspectRatio="none" className="tp-wave absolute bottom-0 left-0 h-full w-[200%]" style={{ animationDuration: l.d, bottom: -l.y, opacity: l.o }}>
          <path d={WAVE} fill={color} />
        </svg>
      ))}
    </div>
  )
}

/** Bolhas subindo (posições fixas para não mudar a cada render). */
export function Bubbles({ count = 14, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        const left = (i * 37) % 100
        const size = 6 + ((i * 13) % 18)
        const dur = 9 + ((i * 7) % 9)
        return (
          <span key={i} className="tp-bubble absolute bottom-[-40px] rounded-full border border-white/40 bg-white/10"
            style={{ left: `${left}%`, width: size, height: size, animationDuration: `${dur}s`, animationDelay: `${-(i * 1.7) % dur}s` }} />
        )
      })}
    </div>
  )
}
