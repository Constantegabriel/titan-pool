// Junta todas as migrations em supabase/setup.sql, para colar de uma vez no SQL Editor do Supabase.
import fs from 'node:fs'
const dir = new URL('../supabase/migrations/', import.meta.url)
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
const body = files.map((f) => `-- ===== ${f} =====\n${fs.readFileSync(new URL(f, dir), 'utf8').trim()}\n`).join('\n')
fs.writeFileSync(new URL('../supabase/setup.sql', import.meta.url), `-- Titan Pool: banco completo. Gerado por scripts/build-setup-sql.mjs — não edite à mão.\n-- Cole tudo no Supabase em SQL Editor > New query > Run.\n\n${body}`)
console.log(`supabase/setup.sql: ${files.length} migrations`)
