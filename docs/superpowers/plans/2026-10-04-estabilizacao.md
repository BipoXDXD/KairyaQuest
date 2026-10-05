# Estabilização após a atualização Python

> Execução por agentes GPT-6.1 com esforço High, em worktrees separados,
> seguida de revisão independente e integração local pelo controlador.

**Objetivo:** reforçar validação, consistência das leituras e acessibilidade
dos fluxos existentes, preservando a atualização Python e as regras do produto.

**Base:** `49faaf0` com as alterações locais de atualização das dependências
Python já presentes no início da sessão. O usuário delegou as decisões
reversíveis durante sua ausência em 2026-10-04; decisões críticas permanecem
pendentes. Commit, push, PR, merge e publicação não estão autorizados.

**Arquitetura:** contratos Pydantic validam entradas antes dos serviços;
hooks React só aceitam a resposta da carga atual; o painel móvel mantém foco
na ordem do documento. Nenhuma dependência, serviço ou endpoint novo.

**Fontes:** README, ARCHITECTURE, HANDOFF e QUALITY, mais auditorias do código,
documentação oficial via Context7 e seções pertinentes do acervo de livros.

## Restrições

- Interface em português brasileiro; contratos externos em inglês.
- Um implementador por worktree; bancos de teste e portas exclusivos.
- Não executar `make db-up` fora do checkout principal.
- Preservar todos os arquivos e alterações anteriores, sem limpar o índice.
- Cobertura de 100% no backend e nos quatro eixos do frontend.
- Testes de resultado, efeitos e erros; regressão vista reprovando antes da correção.
- Não reduzir limiares, ignorar testes ou contornar hooks.
- Nenhuma chamada paga ou credencial real na validação.
- Gate completo antes da entrega; resultados somente de comandos executados.

## Fatia 1 — entradas que o PostgreSQL não representa

**Responsável:** implementador backend, `wt/auditoria-backend`.

**Arquivos:** `src/focusquest/core/validation.py`, schemas de missões,
plano semanal e tutoria, e testes unitários/de integração desses contratos.

- [x] Demonstrar que U+0000 é aceito pelos schemas atuais e recusado pelo Psycopg.
- [x] Escrever regressões HTTP: textos de missão/diária/especial, identificadores
  de operação, conteúdo/identificador da pergunta e confirmação da proposta.
- [x] Ver reprovação com JSON contendo `\u0000`; conferir tabelas e estados
  antes/depois, incluindo nenhuma chamada ao provedor.
- [x] Criar `TextoPersistivel = Annotated[str, AfterValidator(...)]`, que
  rejeita NUL com `ValueError`; reaproveitar nos campos de entrada persistidos.
- [x] Preservar trim, limites, payloads e semântica de idempotência.
- [x] Verificar texto Unicode válido, localização do erro 422 e ausência de efeitos.
- [x] Executar testes pertinentes, mutação que remove a guarda e `make check`.
- [x] Revisar independentemente antes da integração local.

## Fatia 2 — leituras atuais e teclado da conversa

**Responsável:** implementador interface, `wt/auditoria-interface`.

**Arquivos:** `useMissions.ts`, `useTutorStatus.ts`, `TutorPanel.tsx`,
testes correspondentes e cenários Playwright pertinentes.

- [x] Incorporar regressões com promessas controladas: resposta antiga chega
  após a nova, ou enquanto a nova ainda carrega, inclusive sob StrictMode.
- [x] Invalidar a geração imediatamente na recarga, guardar sucesso/erro e
  manter o cancelamento de recursos na limpeza.
- [x] Demonstrar Tab preso no botão Fechar com a Tifa indisponível.
- [x] Incluir região focável e links no ciclo de Tab/Shift+Tab, preservando
  ordem do DOM e excluindo controles desabilitados ou fora da ordem de Tab.
- [x] Testar navegação com teclado real, retorno de foco, escape e axe-core.
- [x] Executar mutações discriminantes e `make check` no worktree exclusivo.
- [x] Revisar independentemente antes da integração local.

## Fatia 3 — contexto confiável e revisão visual

**Responsável:** controlador no checkout principal; agentes apenas revisam.

**Arquivos:** documentação atual, `frontend/README.md` e HANDOFF. Correções
visuais comprovadas seguem para o implementador de interface.

- [x] Inventariar e ler em equipe os Markdown próprios, incluindo registros
  históricos ignorados; excluir dependências, caches e artefatos gerados.
- [x] Ler seções úteis dos livros e registrar obra, capítulo e aplicação;
  distinguir leitura seletiva de leitura integral.
- [x] Corrigir estado de publicação do D e descrições contraditórias das
  dependências internas; preservar o relato histórico das verificações.
- [x] Substituir o README de scaffold por instruções específicas do frontend.
- [x] Inspecionar screenshots desktop/móvel do build em Chromium; medir
  largura, conteúdo extenso, foco e painel recolhido.
- [x] Converter defeitos visuais comprovados em testes antes de corrigi-los.
- [x] Atualizar HANDOFF com decisões, comandos, resultados e pendências reais.

## Trabalho seguinte, condicionado à auditoria

### Fatia 4 — conteúdo longo e painel recolhido

**Responsável:** implementador interface no mesmo worktree exclusivo,
após aprovação e integração da Fatia 2. Ownership adicional:
`MissionCard.tsx`, `CampaignTrail.tsx`, `ProposalCard.tsx`,
`TutorConversation.tsx` e testes E2E/componentes correspondentes.

- [x] Salvar snapshot dos arquivos antes desta fatia para gerar patch
  incremental separado do patch já integrado da Fatia 2.
- [x] Escrever E2E com viewport de 1440/1024 e painel recolhido: largura
  do documento dentro do viewport; botão integralmente dentro do painel,
  legível e operável por teclado, nome acessível completo preservado.
- [x] Escrever E2E de 320/375 px com URL sem espaços nos textos de missão,
  critério, campanha, proposta e conversa; nenhuma rolagem horizontal.
- [x] Ver reprovação com o build anterior; não esconder excesso com corte
  global, elipse ou remoção de conteúdo.
- [x] Permitir redução das caixas flex/grid e quebra de texto no ponto
  adequado; cabeçalho recolhido em coluna com controle que caiba nele.
- [x] Preservar leitura integral, critérios, estados, foco, clique e rascunho.
- [x] Conferir axe-core nos estados longos e recolhido; teclado e movimento
  reduzido continuam respeitados.
- [x] Executar mutações das correções de largura e regressões pertinentes,
  `make check`, revisão e screenshots posteriores do controlador.

### Fatia 5 — delta inválido do provedor

**Responsável:** implementador backend após aprovação e integração da Fatia 1.
Ownership adicional: `tutoring/service.py` e testes de stream/serviço reais.

- [x] Salvar snapshot para patch incremental, preservando mudanças anteriores.
- [x] Provedor falso envia prefixo válido, proposta válida e delta com NUL;
  repetir posições do NUL e caso sem prefixo para reproduzir o erro atual.
- [x] Rejeitar o delta antes de acumular ou emitir usando a guarda comum;
  converter a falha no caminho existente `ProvedorIndisponivelError`.
- [x] Verificar evento terminal `error`, status persistido `falhou`, código
  `provedor_indisponivel` e somente prefixo válido, nunca NUL ou ação.
- [x] Verificar nenhuma missão, operação, XP ou conquista criada; gerador
  fechado e reenvio da pergunta com o mesmo identificador possível.
- [x] Executar mutação removendo a guarda, testes pertinentes, `make check`
  e revisão independente antes da integração.

- Respostas do provedor também são dados externos: um delta com NUL precisa
  terminar pelo caminho existente de resposta inválida e preservar apenas
  texto válido. Implementar em fatia própria após revisar a primeira.
- Testes de serviço da diária perdida/especial expirada e round-trip de
  migração com dados podem fechar pendências sem alterar regras de negócio.
- O Incremento E permanece no roadmap: critérios de avaliação, evidências,
  confirmação e concessão de XP precisam de desenho próprio antes de código.

### Fatia 6 — leitura coerente de XP e conquistas

**Responsável:** implementador de consistência em worktree, banco e portas
exclusivos. Ownership: `progression/service.py` e regressões de progresso.

- [x] Reproduzir contra PostgreSQL o saldo antigo com conquista nova usando
  duas conexões e barreiras por eventos, sem esperas por tempo arbitrário.
- [x] Preservar contrato, catálogo, níveis, datas e transação do caller.
- [x] Ler saldo e conquistas em um único SELECT, com agregado e LEFT JOIN;
  nenhuma alteração de isolamento global nem bloqueio adicional.
- [x] Cobrir estado vazio, XP sem conquista, múltiplos lançamentos/conquistas,
  isolamento de usuário e leitura das próprias alterações não commitadas.
- [x] Verificar persistência real da conclusão concorrente e limpeza restrita.
- [x] Restaurar as duas consultas como mutação e obter falha pelo resultado
  incoerente, depois executar gate e revisão independente.

### Fatia 7 — estados do ciclo e migração com dados

**Responsável:** implementador backend após encerrar e revisar a Fatia 5.
Ownership adicional apenas dos testes `test_cycle_service.py` e
`test_progression_migration.py`; sem mudança das regras ou da migração.

- [x] Fechar a pendência 58 com diária perdida na trilha e leitura individual;
  especial expirada na mesma semana após um marco antecipado, com relógio
  fixo, conteúdo completo e estados persistidos intactos.
- [x] Fechar a pendência 83 com round-trip explícito da 0004 populada: antes,
  em 0003 e depois de voltar ao head; missões, operações e conversa intactas;
  XP/conquistas reconstruídos equivalentes por significado e vínculo à missão.
- [x] Incluir controles negativos: pendentes não ganham XP nem conquista.
- [x] Retirar estados derivados e reconstrução como mutações controladas;
  confirmar reprovação por resultado e restauração byte a byte.
- [x] Executar regressões e gate completo; revisão independente e patch
  incremental sem incorporar alterações herdadas.

### Fatia 8 — texto Unicode inválido do provedor

**Responsável:** implementador backend após integrar a Fatia 5.
Ownership: guarda de delta em `tutoring/service.py` e regressões de stream.

- [x] Reproduzir no HTTP/SDK real o surrogate isolado escapado em JSON;
  o SDK o entrega como Delta, mas serialização SSE e Psycopg o recusam.
- [x] Verificar encodabilidade UTF-8 antes de acumular/emitir o delta,
  no mesmo caminho de falha de provedor; nenhuma alteração dos schemas de entrada.
- [x] Cobrir surrogates altos/baixos, posições e prefixo seguro; proposta
  anterior descartada, falha persistida, fechamento e reenvio preservados.
- [x] Preservar emoji válido, inclusive par escapado no JSON, sem substituição
  silenciosa de caracteres; observar erro real antes da correção.
- [x] Executar mutação, regressões, gate e revisão independente.

### Fatia 9 — retorno ao Quartel-General

**Responsável:** implementador interface após integrar a Fatia 4.
Ownership: `Headquarters.tsx`, `CycleSection.tsx` e testes de navegação.

- [x] Reproduzir a pendência 60: trocar de área na mesma aba, virar o dia
  de São Paulo com relógio/respostas controlados e voltar com ciclo antigo.
- [x] Na transição oculto→visível, atualizar ciclo e progresso em silêncio;
  nenhuma carga duplicada na montagem inicial ou polling/relógio local novo.
- [x] Expor refresh da seção pelo padrão de handle já usado pelo painel
  de progresso; a página compõe as features, sem importação entre elas.
- [x] Preservar conteúdo enquanto carrega, estado de erro, rascunho e
  stream da Tifa, pois o Quartel-General continua montado quando oculto.
- [x] Verificar requisições/estado final, StrictMode, falha e ausência de
  remount; mutação do gatilho, gate e revisão independente.

### Fatia 10 — resposta cortada pelo limite de tokens

**Responsável:** implementador backend, última fatia antes do fechamento.
Ownership: `anthropic_provider.py` e regressões de stream/servidor falso.

- [x] Reproduzir a pendência 45 com HTTP e SDK reais: `max_tokens` seguido
  de `message_stop` não significa que o conteúdo foi concluído.
- [x] Recusar esse encerramento como falha de provedor antes de emitir Fim;
  preservar prefixo seguro, descartar proposta e emitir o erro existente.
- [x] Preservar encerramentos válidos, reenvio e fechamento do stream.
- [x] Não adicionar estado, código HTTP, dependência ou configuração nova.
- [x] Executar regressão RED/GREEN, mutação, gate e revisão independente;
  concluir ou registrar bloqueio concreto antes do checkpoint final.

## Entrega

- [x] Revisão final do diff integrado, incluindo alterações preexistentes.
- [x] `make check` no checkout principal e `git diff --check`.
- [x] Preservar patches e registros locais suficientes para retomada,
  sem commit ou publicação e sem declarar a aplicação pronta para produção.

**Fechamento local:** dez fatias integradas, revisões independentes aprovadas, gate principal EXIT 0 (746 Python/471 frontend/31 E2E, 100%). Checkpoint reconstruído sobre a base limpa com 45 arquivos conferidos byte a byte; sem commit ou publicação.

## Continuação autorizada — ida ao mercado

O dono solicitou retomar sem parar. A entrega das fatias 1–10 acima é um checkpoint concluído; as seguintes são manutenção delimitada, ainda sem commit/publicação. Modelos GPT-6.1 High, worktrees/bancos/portas exclusivos e revisão independente mantidos.

### Fatia 11 — ciclo derivado de uma leitura

- [x] Reproduzir mistura em duas conexões: missão concluída e sequência/especial anteriores; controle do plano atual sem mistura.
- [x] Materializar diárias/planos/especiais por valores de uma consulta, preservando clock único, usuários, ocultação e transação.
- [x] Regressões primeiro dia/marco, ORM pré-carregada, leitura seguinte, própria escrita e cópia estável; mutação volta consulta antiga.
- [x] Gate completo e revisão independente; nenhum isolamento global/lock novo ou alteração de escrita/planos por analogia.

### Fatia 12 — foco nas transições da conversa

- [x] Reproduzir foco BODY após 375→1440→375 e teclado acionando o fundo do modal, inclusive com SSE inteiramente simulado.
- [x] Coordenar foco de modo local e impedir interação com fundo enquanto folha ativa; restaurar interatividade ao fechar/mudar layout/desmontar.
- [x] Preservar foco externo quando pertinente, rascunho, stream, preferência, região viva e fechamento por Escape/backdrop/link; conter/focar só a folha visível, com visibilidade repassada pela página.
- [x] Teclado em Chromium, StrictMode, controles habilitados/desabilitados, mutação, gate e revisão independente.

### Fatia 13 — decisões e histórico anterior

- [x] Reproduzir GET silencioso anterior reabrindo executada/recusada/falhou; controle de GET posterior mantendo decisão.
- [x] Corrigir obsolescência/reconciliação local, preservando callbacks atuais e leituras posteriores autoritativas.
- [x] Recarga em loading termina; decisão/mission_id/erro preservados sem duplicar mensagens nem cache global.
- [x] Regressões de resultado, mutação, gate e revisão independente. Texto genérico SSE desconhecido da pendência 49 segue fora da fatia.

### Fatia 14 — uma operação em voo por hook

- [x] Reproduzir chamadas no mesmo tick em conclusão/confirmar/recusar e nas duas direções de decisão cruzada.
- [x] Guarda síncrona por instância, compartilhada entre confirmar/recusar; preservar disabled, registry, chaves, reward, callbacks e retry.
- [x] UUID que lança não deixa voo órfão; erro libera guarda; rerender não permite segundo pedido enquanto o primeiro permanece.
- [x] Mutação discriminante restaurada, gate e revisão independente; sem alteração de regras ou alegação de XP/missão duplicada.

### Fatia 15 — readiness sem configuração

- [x] Reproduzir 500 sem .env/URLs/engine cacheada; `/health` continua 200.
- [x] Responder 503 com corpo público existente, apenas nessa fronteira; banco real 200/falha 503 e erros inesperados preservados.
- [x] Configuração obrigatória, criação lazy/cache e substituição de engine em testes preservadas; sem handler global/fallback/infra nova.
- [x] RED/GREEN, mutação restaurada, gate e revisão independente; documentar mudança específica de status da pendência 28.

### Fatia 16 — foco ao substituir a diária

- [x] Reproduzir refresh que remove cartão com foco e deixa BODY; aguardar nova missão realmente renderizada.
- [x] Capturar pertencimento antes da remoção e focar título estável; preservar key, registro, refresh silencioso e próximo Tab nos controles atuais.
- [x] Mesma missão, erro, foco externo, carga inicial, StrictMode, ocultação/desmontagem e modal ativo não recebem transferência indevida.
- [x] GREEN unit/Chromium, mutações restauradas, gate e revisão independente; aparelho físico permanece pendente.

### Fatia 17 — paridade estrutural de xp_entries

- [x] Comparar duas FKs (alvos/ondelete), UNIQUE de mission_id e índice user_id,id entre banco migrado e metadados do modelo.
- [x] Baseline atual GREEN, sem alegar divergência inexistente; cinco mutações unilaterais de modelo/migração reprovam por semântica e foram restauradas.
- [x] Restaurar fontes e preservar schema/produção; patch somente teste novo, gate 100% e revisão independente.
- [x] Documentar recorte parcial, sem promessa de paridade completa de todos defaults/tabelas/constraints.

Os briefs operacionais detalhados e ledger estão em `.superpowers/sdd/2026-10-04-estabilizacao/`. Patches incrementais serão integrados somente após revisão e seguidos de gate conjunto no principal. O checkpoint anterior permanece disponível.

**Marco 11–17:** sete fatias integradas e revisadas; gate principal EXIT 0,
762 Python/520 frontend/47 E2E e 100%, 57 fontes iguais durante a execução.
Consolidação documental aprovada na sessão 85194; checkpoint recuperado
independentemente, 57 arquivos idênticos e 437 checksums.

### Fatia 18 — chaves de missões explicitamente concluídas

- [x] RED real no registro, quadro, diária e especial após resultado desconhecido e leitura terminal.
- [x] Podar apenas IDs concluídas confirmadas; aguardar último voo, preservar retry/ausência/loading/erro/refreshFailed e callbacks.
- [x] Mutações discriminantes restauradas, gate completo e revisão independente em worktree exclusivo.
- [x] Integrar, verificar combinação e documentar que missões ausentes continuam pendentes.

**Marco 11–18:** gate principal EXIT 0, 762 Python/550 frontend/47 E2E e 100%.
O gate posterior à consolidação documental reprovou em `check-web`, 549/550,
sessão 6646 EXIT 2; API/E2E não executados nessa tentativa. Investigação
causal/revisão da falha StrictMode e checkpoint próprio estavam pendentes
na pausa registrada abaixo.

Delta de barreiras de dois testes isolado: controle causal confirmado,
mutantes detectados/restaurados e gate 762/550/47 EXIT 0, 100%, sessão 57208.
Revisão independente e aplicação adiadas para a retomada solicitada pelo dono.

**Retomada:** delta dos dois testes revisado independentemente, APPROVED
C0/I0/M0. Replay e mutações confirmados; 106 testes passaram na revisão.
Aplicado após `git apply --check`, com igualdade dos bytes finais. A ordem
natural da falha antiga não foi instrumentada. Gate conjunto atual aprovado,
821 Python/550 frontend/47 E2E, cobertura 100%.

### Fatia 19 — serialização do erro de validação com Unicode inválido

- [x] RED real HTTP500 por UnicodeEncodeError, sentinelas sem SQL/provedor e controles de pares válidos/erros internos.
- [x] Resposta422 JSON com escapes ASCII somente para RequestValidationError, preservando estrutura, modelos, configuração e erros de execução; integrada na retomada após conferir os bytes aprovados.
- [x] Mutações restauradas, gate isolado completo100%, OpenAPI idêntico e revisão independente APPROVED C0/I0/M0.
- [x] Integrar, verificar combinação e preservar os checkpoints anteriores.

**Marco da retomada 11–19:** gate integrado principal EXIT 0, 821 Python/
550 frontend/47 E2E, 100%. Todas as 262 fontes/64 alteradas ou novas, HEAD e
índice iguais durante o gate. Wheel novo e smoke da serialização aprovados,
38 módulos empacotados idênticos, seis requisições/controles, sem acesso a
banco/provedor; OpenAPI idêntico (12 caminhos). Recuperação preliminar
das 262 fontes e varredura da extração aprovadas. O fechamento exige novo
gate após esta consolidação documental e selagem contra esses bytes;
resultados finais em `evidence/retomada-20261004/` no ledger de estabilização.
Sem commit, push, PR, merge ou publicação; decisões E e demais limitações
explicitadas no HANDOFF permanecem com o dono.

## Continuação após reinício — fatia 20

Pedido de retomada revoga a pausa final do ledger. As fatias 1–19 estavam
concluídas; seus checkpoints foram conferidos e preservados antes de editar.
Manutenção delimitada da pendência 9: dois testes de paridade da FK e UNIQUE
de `mission_operations`, no mesmo padrão da fatia 17. Não há divergência
atual demonstrada ou CHECK existente nessa tabela. Sem mudança de produto,
modelo, migração ou dependência. Implementação no worktree backend existente,
revisão independente somente leitura e aplicação local após APPROVED.
Baseline/restauração GREEN; cinco mutações unilaterais detectadas e restauradas.
Critério de fechamento: gate completo da combinação, bytes estáveis e
recuperação do novo checkpoint, preservando os anteriores. Comandos e
resultados finais são registrados no ledger e nos manifestos de
`evidence/continuacao-pos-reinicio/`.

## Conciliação pós-publicação do PR #6

O pedido de continuar depois do commit assinado `891eda0` e do PR draft #6
inclui resolver os conflitos com `origin/main` em `469e149`. O resultado deve
preservar E/F/G e os vinte incrementos locais compatíveis, sem reescrever o
commit publicado ou integrar o PR na `main`.

- [x] Conferir base remota e CI antigo; preservar checkpoints e worktrees.
- [x] Conciliar frontend em worktree próprio, com gate web e E2E isolados.
- [x] Revisar backend e frontend independentemente, sem achados C/I/M.
- [x] Integrar os patches revisados com verificação byte a byte.
- [x] Adaptar o oráculo da migração antiga e os testes de teclado às regras E/F/G.
- [x] Aprovar o rerun completo de `check-api` no backend conciliado.
- [x] Aprovar `make check` no resultado combinado e concluir revisão documental.
- [ ] Conferir índice; finalizar commit assinado na branch do PR com hooks.
- [ ] Push de uma ref e atualização do PR; conferir CI e ausência de conflitos.

Checklist registrado antes do commit de publicação; as referências e o
resultado posterior ficam no ledger e no PR. Gate combinado EXIT 0:
1436 Python, 990 frontend, 59 E2E e 100%, fontes/HEAD/índice preservados.

As evidências e o andamento estão em `progress.md`, com novas capturas em
`evidence/conciliacao-pr6/`; nenhum checkpoint anterior será sobrescrito.
