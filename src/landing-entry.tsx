import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LandingPage } from '@/features/landing'

/** Entrada leve para visitantes: só a landing (sem banco, roteador ou telas do app). */
export function mount(el: HTMLElement) {
  createRoot(el).render(
    <StrictMode>
      <LandingPage />
    </StrictMode>,
  )
}
