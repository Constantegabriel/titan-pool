import './index.css'
import { isLikelyVisitor } from './lib/visitor'

// Visitante na página inicial baixa só a landing; quem tem conta baixa o app.
const entry = isLikelyVisitor() ? import('./landing-entry') : import('./app-entry')
entry.then((m) => m.mount(document.getElementById('root')!))
