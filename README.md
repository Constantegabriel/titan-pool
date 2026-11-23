# Piscineiro

App (PWA instalável) para piscineiro autônomo: clientes e piscinas, agenda e rota do dia,
relatório de visita com análise da água e envio pelo WhatsApp, e cobrança mensal.

## Rodar

```bash
npm install
npm run dev
```

Sem configuração, o app roda em **modo local**: dados no IndexedDB do aparelho, sem conta.
Em *Ajustes* há backup/restauração em JSON e clientes de exemplo.

## Modo nuvem (Supabase)

1. Crie um projeto no Supabase e aplique `supabase/migrations/` (`supabase db push`).
2. Copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
3. O app passa a exigir login e sincroniza entre aparelhos; o backup local pode ser restaurado na conta.

## Arquitetura

```
src/domain/     regras puras e testadas: química da água, agenda/rota, cobrança, mensagens
src/data/       interface Repository + LocalRepository (IndexedDB) + SupabaseRepository
src/hooks/      React Query: cache, invalidação e mutações
src/features/   telas (Hoje, Clientes, Piscina, Visita, Cobrança, Ajustes, Login)
src/components/ layout e componentes de interface
supabase/       esquema Postgres com RLS por usuário, FKs por dono e bucket privado de fotos
```

Por que escala:

- **Telas só conhecem `Repository`**: trocar ou somar armazenamento (API própria, sync offline) não mexe na interface.
- **Multi-inquilino desde o início**: toda linha tem `owner_id`; RLS e FKs compostas impedem acesso ou vínculo a dados de outra conta. Para equipes, troque `owner_id` por `organization_id` + tabela de membros.
- **Consultas por recorte**: visitas por data/cliente e cobranças por competência, com índices correspondentes — o volume cresce sem que as telas carreguem o histórico inteiro.
- **IDs UUID gerados no cliente** e operações idempotentes (cobranças únicas por cliente/mês, visita única por piscina/dia).
- **Valores em centavos**, fotos comprimidas no aparelho, telas carregadas sob demanda.

## Scripts

`npm run test` (vitest) · `npm run typecheck` · `npm run lint` (oxlint) · `npm run build`

As sugestões de dosagem são estimativas (cloro granulado 65% e bicarbonato de sódio);
o rótulo do produto sempre prevalece.
