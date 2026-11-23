# Titan Pool

App (PWA instalável, feito para o celular) para piscineiros: roteiro do dia com previsões de
chegada, clientes e piscinas, relatórios de visita, compras com fornecedores pelo WhatsApp,
financeiro e documentos em PDF.

## Funções

- **Roteiro do dia** — 1º, 2º, 3º cliente na ordem de chegada, com horário previsto de chegada e
  saída, distância e tempo entre paradas, término do dia. Botão *Otimizar* calcula a melhor ordem;
  *Ajustar* permite mudar à mão. As previsões se recalculam sozinhas ao longo do dia. Navegação
  por Google Maps ou Waze até o próximo cliente.
- **Clientes e piscinas** — localização pelo GPS ("Estou no local") ou busca do endereço, dias de
  visita, tempo de serviço, observações de acesso.
- **Visita** — análise da água com sugestão de dosagem, checklist, produtos, fotos, relatório
  pelo WhatsApp e em PDF.
- **Compras** — lista de itens com sugestões do catálogo, cliente e fornecedor do pedido, envio da
  lista para o WhatsApp do fornecedor, preços, recebimento (lança a despesa no financeiro e pode
  repassar o valor ao cliente) e PDF do pedido.
- **Financeiro** — lucro do mês, entradas e saídas, gastos por categoria, margem por cliente,
  mensalidades (gerar, receber, lembrar por WhatsApp, recibo em PDF), lançamentos avulsos e
  relatório mensal em PDF.
- **Mais** — fornecedores, lista de itens, dados da empresa (aparecem nos PDFs), horário de saída,
  ponto de partida, velocidade média e tempo padrão por piscina, backup.

## Rodar

```bash
npm install
npm run dev
```

Sem configuração, roda em **modo local**: dados no IndexedDB do aparelho, sem conta.
Em *Mais* há backup/restauração em JSON e dados de exemplo.

## Modo nuvem (Supabase)

1. Crie um projeto no Supabase e aplique `supabase/migrations/` em ordem (`supabase db push`).
2. Copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
3. O app passa a exigir login e sincroniza entre aparelhos.

## Arquitetura

```
src/domain/     regras puras e testadas: roteiro (distâncias, otimização, previsões), química da
                água, agenda, cobrança, financeiro, mensagens de WhatsApp
src/data/       interface Repository + LocalRepository (IndexedDB) + SupabaseRepository
src/hooks/      React Query: cache, invalidação e mutações
src/features/   telas
src/lib/        PDF (carregado sob demanda), compartilhamento, geolocalização, imagens
supabase/       esquema Postgres com RLS por usuário, FKs por dono e bucket privado de fotos
```

Por que escala:

- **Telas só conhecem `Repository`**: trocar ou somar armazenamento não mexe na interface.
- **Multi-inquilino desde o início**: toda linha tem `owner_id`; RLS e FKs compostas impedem acesso
  ou vínculo a dados de outra conta. Para equipes, troque `owner_id` por `organization_id`.
- **Consultas por recorte** (visitas por data, cobranças e lançamentos por mês) com índices.
- **Roteiro calculado no aparelho** (vizinho mais próximo + 2-opt, haversine com fator de ruas):
  sem custo de API e funciona offline. Para tempos reais de trânsito, troque `travelMinutes` em
  `src/domain/route.ts` por um serviço de rotas.
- **PDF gerado no aparelho** e compartilhado pela folha nativa do celular (WhatsApp, e-mail…).
- Valores em centavos, IDs UUID gerados no cliente, operações idempotentes.

## Scripts

`npm run test` (vitest) · `npm run typecheck` · `npm run lint` (oxlint) · `npm run build`

Busca de endereço usa o OpenStreetMap (Nominatim), com uso leve e pontual. Sugestões de dosagem
são estimativas; o rótulo do produto prevalece.
