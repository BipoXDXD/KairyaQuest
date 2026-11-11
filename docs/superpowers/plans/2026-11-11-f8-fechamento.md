# Fase 8 (áudio): fechamento — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento. A Tarefa 2 é **geração paga** e é executada pelo controlador da sessão (não por subagente), com o conector ElevenLabs.

**Goal:** fechar a Fase 8: os 12 efeitos sonoros gerados e verificados (PR A) e o áudio ligado ao app: controles, convite, voz das falas e efeitos nos gatilhos, com E2E (PR B).

**Architecture:** as Tarefas 1, 2, 3, 5 e 6 do plano original já estão na `main` (roteiro, vozes, 72 falas, preferências, player, `AudioProvider`). Falta o PR A (12 mp3 + teste de integridade + procedência) e o PR B. No PR B, a voz mora **dentro do `KairyaBubble`** (hook `useSpokenCue`), porque é ele que mostra a legenda; os efeitos de missão, avaliação e tutora saem das funções puras de `soundCues.ts` chamadas nos mesmos pontos em que a presença já recebe os eventos; os efeitos de trilha e de painel saem direto dos componentes dono do gesto. As páginas continuam só compondo.

**Tech Stack:** React 19 + TypeScript 6, Vite 8, Vitest 5, Testing Library, Playwright + axe, Tailwind v4. Geração: conector ElevenLabs (`creative_*`). Pós-processo local: `scripts/encode-audio.sh` (ffmpeg do dono). **Zero dependências novas.**

**Spec:** plano original revisado em 4 rodadas, `.superpowers/sdd/system-reminder-linked-sessions-now-graceful-hellman/plano-fase-8-audio.md` (daqui em diante **"o original"**), mais `docs/AUDIO.md`, `docs/handoff/2026-11-11-f8-audio.md`, `docs/handoff/2026-11-11-f8-roteiro.md` e a pendência (b) de `docs/handoff/2026-11-11-f6-fechamento.md` (o ponto de ligação da voz é `useKairya().state.cue`). Onde este plano e o original divergem, vale este (a F6 foi reescrita depois do original).

**Base:** `origin/main` em `4abbd5a` (branch `wt/f8-fechamento`).

## Global Constraints

Valem integralmente as **Global Constraints do original** (formato mp3 CBR 64 kbps mono 44,1 kHz, loudness −18/−20 LUFS, caminhos, `generations_count` explícito, voz original sem franquia, legenda sempre, `prefers-reduced-motion` não afeta o som, cartão de convite não modal, chaves de `localStorage` com prefixo `kairyaquest.`, `fireEvent` sem `user-event`, leitura de disco só por `readSource.ts`, nenhum teste que passa por vácuo). Acrescentam-se, copiadas das ordens desta rodada:

- Frontend com **100% de cobertura**; nunca `!` em TypeScript; **zero dependência nova** (runtime e dev); **nenhuma string literal em JSX**; chaves novas nos **dois** catálogos (`pt-BR` e `en`) no mesmo commit; nenhum nome de franquia (fitness `tests/unit/test_sem_franquia.py`).
- Efeitos: `generations_count: 2` por efeito, `model_id: 'eleven_text_to_sound_v2'`, teto de **20 000 bytes** por efeito (o original e a `Global Constraints` fixam ambos; nada os sobe).
- Autorização de gasto (regra do dono, 11/11): lote pago que cabe no **saldo já pago** não precisa de OK por lote; **compra ou recarga** continua exigindo OK. Mesmo assim: estimativa gratuita (`estimate_only: true`), **1 efeito primeiro**, custo real relatado ao dono, só então o lote.
- `make check` verde antes de cada commit (`export UV_PYTHON=3.14.10`); um handoff por PR em `docs/handoff/` (nunca `docs/HANDOFF.md`, `scripts/check-handoff.sh`); nada de Docker, build pesado ou E2E em paralelo com a outra sessão do KQ sem combinar a porta (`FOCUSQUEST_E2E_PORT_OFFSET`).

## Review Focus

Mesmos cinco do original (autoplay bloqueado; arquivo ausente ou corrompido; som desligado e legenda que some; `localStorage` indisponível; falas sobrepostas ou repetidas), com os testes nas Tarefas 3, 4 e 6. Acrescentam-se os que a reescrita da F6 criou:

1. **Bolha que fica montada com a folha da tutora aberta (celular)**: a `KairyaBubble` não desmonta; a página fica `inert` atrás da folha. A voz tem de parar ao abrir a folha e **não** recomeçar ao fechá-la. Teste na Tarefa 5 (`TutorPanel`) e na 6.
2. **Celebração ignorada pelo reducer** (a Kairya está `thinking`/`speaking`): não há `cue`, então não há voz; o efeito de conclusão ainda toca, porque o `RewardAnnouncement` é a mudança visual que o acompanha. Teste na Tarefa 5.
3. **Saudação adiada** (`pending` do `useDailyOpening` espera o humor liberar): `streak_kept` só toca quando a `cue` da saudação aparece, não quando a sequência é lida. Teste na Tarefa 4.
4. **Troca de idioma com a bolha aberta**: a voz **não** repete a mesma fala no outro idioma (mesma `SpeechCue`). Teste na Tarefa 4.
5. **StrictMode do `main.tsx`** (efeito, cleanup, efeito): a voz toca uma vez e não é cortada. Teste na Tarefa 4 (com `renderWithI18n(..., { strict: true })`) e verificação manual no `npm run dev`.

## Decisões novas (D14 em diante; D1–D13 do original seguem, salvo onde dito)

| #   | Decisão                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Motivo                                                                                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D14 | **Substitui o D6.** A voz da fala é do `KairyaBubble`: o hook `useSpokenCue(cue: SpeechCue \| null): void` (`features/kairya/useSpokenCue.ts`) toca `lineSrc(locale, cue.line)` quando a `cue` aparece, **uma vez por identidade de `SpeechCue`** (`WeakSet` em `useRef`, preenchido mesmo com a voz desligada, para ligar a voz depois não falar uma fala velha), e **corta** quando a `cue` vira `null` ou o componente desmonta. O corte é **agendado em microtask** no cleanup; qualquer execução posterior do efeito o cancela (token numérico em `useRef`): a mesma `cue` remontada pelo StrictMode não é cortada nem repetida, e uma `cue` nova interrompe a anterior pelo `play` do canal (D4) sem ser emudecida pelo corte da anterior. `playVoice`, `locale` e `readStreak` entram por refs do último valor (padrão já usado em `useKairyaMood`), para a troca de idioma ou de preferência não reexecutar o efeito. `KairyaSpeech`, `onShown`/`onHidden` e a ligação em `Headquarters` do original **não existem mais**. | A bolha agora é do provider e vive dentro do `main` da página. Tocar de dentro dela mantém voz e legenda no mesmo ciclo de vida e deixa `Headquarters` intocada. Um hook novo, e não código no corpo do componente, porque a regra do corte agendado precisa de teste próprio. |
| D15 | **Folha da tutora no celular.** O `TutorPanel` chama `audio.stopVoice()` no clique que abre a folha (`setSheetOpen(true)`), **e só nele**: expandir o painel no desktop não cobre a bolha e não corta a voz. O `WeakSet` do D14 impede a fala de recomeçar ao fechar a folha.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | A F6 D8 (bolha desmontada com a folha) não vale mais: a bolha continua renderizada, mas fica atrás do modal e `inert`. Fala sem legenda visível é o que o Review Focus 3 proíbe.                                                                                               |
| D16 | **Troca de área.** `App.navigate` chama `audio.stopVoice()` antes do `flushSync`. O Quartel-General fica montado e oculto; ao voltar, a mesma `cue` não fala de novo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | A bolha não desmonta ao ocultar a página; só o `App` sabe da troca.                                                                                                                                                                                                            |
| D17 | **Efeitos de conclusão, avaliação e tutora saem de funções puras chamadas nos pontos que já despacham eventos**, e não de um observador do estado da presença: `MissionCard.handleCompleted` (`sfxForCompletion`), `EvaluationPanel.handleResult` (`sfxForEvaluation`) e `useTutorPresence` (`sfxForTutorEvent` e `arrivedProposal`). As funções têm o **mesmo formato de entrada** de `completionEvents`/`evaluationEvents`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | O `xp_tick` depende de a avaliação ter `reward`, dado que os eventos da presença perdem; `soft_error` não se distingue de `concern` pelo humor. Um observador do estado exigiria mudar o reducer da F6. Custo: três arquivos de outras features ganham `useAudio`.             |
| D18 | **`streak_kept`:** `KairyaContextValue` ganha `readStreak(): number \| null` (a sequência da última chamada de `reportStreak`, guardada em `useRef` no provider; identidade estável, sem re-render). `useSpokenCue` toca `sfxForOpening(cue, readStreak())` quando a `cue` é uma saudação. Com `greeting: false`, `reportStreak` é no-op e `readStreak()` devolve `null`: nenhum efeito.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | O `useDailyOpening` lê a sequência antes de a saudação existir, e a `cue` não a carrega. Um getter evita re-renderizar todos os consumidores (N2 da F6).                                                                                                                       |
| D19 | **`weekly_trial_unlocked`, `trail_step` e `panel_open` saem direto dos componentes** (`LanternTrail`, `TutorPanel`) com `useAudio()`, sem prop nova e sem tocar `Headquarters`/`Campaigns`. **Substitui** as props `onSpecialShown`/`onPanelOpened`/`onProposalArrived` do original.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Menos arquivos, menos fiação, e as páginas seguem só compondo. Os testes desses componentes já usam `renderWithI18n`, que monta o `AudioProvider` (D3).                                                                                                                        |
| D20 | **Integridade dos efeitos sem parser de mp3.** `shared/audio/sfx.assets.test.ts` espelha `features/kairya/lineAudio.assets.test.ts`: os 12 existem, não há órfão, cada um tem entre 1 000 e 20 000 bytes, o total de `public/audio/` ≤ 4 000 000 bytes, e cada nome tem uma linha em `docs/AUDIO.md`. O formato (mono, 64 kbps) é garantido pelo `encode-audio.sh`. **Substitui** o `mp3Header.ts` do original (as 72 falas já passaram sem ele).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Proporcional: o parser teria teste próprio e item no `QUALITY.md` por uma garantia que o script já dá. O piso de 1 000 bytes pega arquivo vazio ou truncado.                                                                                                                   |
| D21 | **Escolha da variação pelo controlador**, com QA objetiva por efeito: duração dentro de `seconds` + 0,5 s (`ffprobe`), sem silêncio de ponta acima de 0,15 s (`silencedetect`), sem clipping (`ebur128` true peak ≤ −1,5 dBTP depois do `loudnorm`), tamanho ≤ 20 000 bytes e adequação ao prompt (tom suave, sem alarme). A escuta do dono fica **pendente** e registrada no `AUDIO.md` (uma amostra por categoria), como foi com as falas. Refação: no máximo **1 por efeito e 3 no total**; passou disso, o controlador para e leva ao dono.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | A regra do dono tirou o OK por lote; o limite de refação mantém o gasto previsível.                                                                                                                                                                                            |
| D22 | O prompt de `soft_error` perde a negação (`not alarming`) e vira `Two muted soft wooden taps, low, gentle and calm`; o `roteiro.json` é regerado pelo comando do handoff do roteiro.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Modelos de texto para som tratam negação mal: "not alarming" pode puxar justamente o alarme. A pendência está no `f8-roteiro.md`. O teste de tom segue verde.                                                                                                                  |

### Gatilhos dos efeitos

Vale a tabela do original, com estas mudanças de **onde** cada um é chamado:

| `SfxName`                                                | Chamado em                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| `mission_done`, `lantern_lit`, `level_up`, `achievement` | `MissionCard.handleCompleted`, via `sfxForCompletion` (D17)       |
| `xp_tick`, `level_up`, `achievement`                     | `EvaluationPanel.handleResult`, via `sfxForEvaluation` (D17)      |
| `message_sent`, `soft_error`, `proposal_arrived`         | `useTutorPresence` (D17)                                          |
| `streak_kept`                                            | `useSpokenCue`, quando a `cue` da saudação aparece (D18)          |
| `weekly_trial_unlocked`, `trail_step`                    | `LanternTrail` (D19)                                              |
| `panel_open`                                             | `TutorPanel`, no gesto que abre a folha ou expande o painel (D19) |

Prioridade e a divergência "especial com nível novo toca `level_up` enquanto a fala é a da prova da semana" ficam como no original, e continuam no `test.each` da Tarefa 4.

## Divisão em PRs e arquivos tocados

| PR                       | Branch sugerida    | Tarefas    | Depende de                                                                                              |
| ------------------------ | ------------------ | ---------- | ------------------------------------------------------------------------------------------------------- |
| **A** `audio-sfx`        | `wt/f8-sfx`        | 1, 2       | nada (a `main` já tem roteiro, script e nomes)                                                          |
| **B** `audio-integracao` | `wt/f8-integracao` | 3, 4, 5, 6 | merge do A (o E2E conta pedidos reais de `/audio/sfx/`; sem o A a Voz funciona e os efeitos dariam 404) |

O B pode ser **desenvolvido** em paralelo ao A; só o merge espera.

**PR A toca:** `frontend/public/audio/sfx/*.mp3` (12, novos); `frontend/src/shared/audio/sfx.assets.test.ts` (novo); `docs/AUDIO.md`; `frontend/src/features/kairya/recordingScript.ts` (só o prompt de `soft_error`); `assets-src/audio/roteiro.json` (regerado); `docs/handoff/2026-11-11-f8-sfx.md` (novo). Nada de `src/` de produto.

**PR B toca (para combinar com a sessão do backlog):**

- Novos: `shared/audio/SoundControls.tsx`, `shared/audio/SoundInvite.tsx` (+ testes), `features/kairya/soundCues.ts`, `features/kairya/useSpokenCue.ts` (+ testes), `tests/e2e/audio.spec.ts`, `docs/handoff/2026-11-11-f8-integracao.md`.
- **Quentes** (alta chance de colisão): `features/missions/MissionCard.tsx` (só `handleCompleted`), `features/missions/EvaluationPanel.tsx` (só `handleResult`), `features/tutoring/TutorPanel.tsx` (dois cliques), `features/tutoring/useTutorPresence.ts`, `features/tutoring/tutorPresence.ts`, `features/campaigns/LanternTrail.tsx`, `app/SideNav.tsx`, `App.tsx`, `main.tsx`, `shared/i18n/messages/{pt-BR,en}.ts` (5 chaves `audio.*`), `playwright.config.ts` (`use.storageState`).
- Médios: `features/kairya/KairyaBubble.tsx`, `features/kairya/KairyaPresenceProvider.tsx`, `features/kairya/presenceContext.ts`, `features/kairya/index.ts` (exporta as funções de `soundCues`), `docs/AUDIO.md` (uma frase sobre o convite).
- **Não toca:** `pages/Headquarters.tsx`, `pages/Campaigns.tsx`, o reducer (`useKairyaMood.ts`), `celebration.ts`, `dailyOpening.ts`, `shared/audio/{AudioProvider,audioPlayer,soundPrefs}`.

Os dois PRs ficam em arquivos disjuntos entre si, exceto `docs/AUDIO.md` (A reescreve a seção de efeitos; B só acrescenta uma frase: B rebaseia depois do A).

---

### Task 1: teste de integridade dos efeitos (vermelho), PR A

**Files:**

- Create: `frontend/src/shared/audio/sfx.assets.test.ts`

**Interfaces:**

- Consumes: `SFX_NAMES`, `sfxSrc(name): AudioSrc` (`shared/audio/sfx.ts`); `listSources`, `sourceExists`, `sourceSize`, `readSource` (`test/readSource.ts`).
- Produces: constantes do teste `SFX_MAX_BYTES = 20_000`, `SFX_MIN_BYTES = 1_000`, `AUDIO_TOTAL_MAX_BYTES = 4_000_000`.

- [ ] **Step 1: Write the failing test.** Copie a forma de `features/kairya/lineAudio.assets.test.ts` (`inPublic = (p) => \`public${p}\``):
  - `test('há 12 efeitos esperados, sem repetição')`: `expected` tem 12 caminhos distintos.
  - `test('todo efeito tem o seu mp3 em public/')`: `expected.filter((p) => !sourceExists(p))` é `[]`.
  - `test('não há mp3 fora dos 12 nem arquivo de outro tipo')`: `listSources('public/audio/sfx/*')` filtrado por nomes que não começam com `.` (o Finder cria `.DS_Store`) é igual a `[...expected].sort()`.
  - `test.each(expected)('efeito %s tem entre 1 000 e 20 000 bytes')`: `sourceSize` dentro da janela.
  - `test('o total de public/audio/ cabe em 4 000 000 bytes')`: soma de `sourceSize` de `listSources('public/audio/**/*.mp3')` ≤ `AUDIO_TOTAL_MAX_BYTES`, com `expect(lista.length).toBeGreaterThan(72)` para o total não passar por vácuo.
  - `test.each(SFX_NAMES)('AUDIO.md registra o efeito %s')`: existe uma linha de `readSource('../docs/AUDIO.md')` que contém `frontend/public/audio/sfx/<name>.mp3` e `eleven_text_to_sound_v2`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/shared/audio/sfx.assets.test.ts`. Expected: FAIL nos 12 casos de existência, tamanho e `AUDIO.md` (sem mp3 e sem linhas).
- [ ] **Step 3: Commit** (vermelho fica só no worktree; o commit vai junto com a Tarefa 2, para a `main` nunca ficar vermelha). Não commite aqui.

---

### Task 2: gerar, escolher e registrar os 12 efeitos (pago, controlador), PR A

**Files:**

- Create: `frontend/public/audio/sfx/<SfxName>.mp3` (12), `assets-src/audio/raw/sfx/` (fora do git), `docs/handoff/2026-11-11-f8-sfx.md`
- Modify: `frontend/src/features/kairya/recordingScript.ts` (prompt de `soft_error`, D22), `assets-src/audio/roteiro.json` (regerado), `docs/AUDIO.md` (§2.3 "Efeitos", "Loudness", "Totais")

**Interfaces:**

- Consumes: `roteiro.json` (`sfx[]`: `name`, `prompt`, `seconds`, `file`); `scripts/encode-audio.sh <entrada> <saída> sfx [trim]`.
- Produces: 12 arquivos e **uma linha por arquivo** em `docs/AUDIO.md` §2.3, no formato `| frontend/public/audio/sfx/<name>.mp3 | <name> | <prompt> | <seconds> | eleven_text_to_sound_v2 | <data> | <créditos> | <variação escolhida> |`.

**Parâmetros fixos de toda chamada paga:** `creative_generate_in_flow`, `node_type: 'sfx'`, `model_id: 'eleven_text_to_sound_v2'`, **`generations_count: 2`**, `prompt` e duração do `roteiro.json`.

- [ ] **Step 1: Prompt de `soft_error` (D22).** Troque o texto em `SFX_GUIDE.soft_error` e regere o roteiro: `mkdir -p assets-src/audio && cd frontend && KAIRYAQUEST_WRITE_ROTEIRO=1 npx vitest run src/features/kairya/recordingScript.test.ts`. Rode de novo **sem** a variável: PASS (o golden confere).
- [ ] **Step 2: Estimativa gratuita.** `creative_get_model_guide` e `creative_get_model_schema` (confirme que `generations_count` ainda tem esse nome), depois `estimate_only: true` com os parâmetros fixos para `mission_done`. Projete `custo × 12`. Se o saldo pago não cobrir a projeção **mais 3 refações**, pare: recarga é decisão do dono.
- [ ] **Step 3: Um efeito pago e relatório.** Gere só `soft_error` (o mais fácil de errar no tom). Baixe as 2 variações em `assets-src/audio/raw/sfx/`, anote o custo real e **relate ao dono** (créditos, comparação com a estimativa). Continua sem esperar OK, desde que o custo real esteja dentro de 20% da estimativa; acima disso, pare e relate.
- [ ] **Step 4: Lote.** Os outros 11, com os parâmetros fixos, sem repetir chamada paga para "tentar de novo" (falha se investiga com `creative_get_flow_run_status`).
- [ ] **Step 5: QA e escolha (D21).** Para cada efeito e variação: `bash scripts/encode-audio.sh <bruto> <saída> sfx`; `ffprobe` (duração ≤ `seconds` + 0,5), `ffmpeg -i <arquivo> -af silencedetect=n=-50dB:d=0.15 -f null -` (sem silêncio de ponta), `-af ebur128=peak=true` (true peak ≤ −1,5 dBTP), `stat -f%z` (≤ 20 000). Escolha a variação que passa e soa mais suave; se nenhuma serve, refaça com `… sfx trim` ou nova chamada (limites do D21). Grave a escolhida em `frontend/public/audio/sfx/<name>.mp3`.
- [ ] **Step 4b: Loudness medida.** `ffmpeg -nostdin -i <arquivo> -af ebur128=peak=true -f null -` em 3 efeitos (um curto, `level_up`, `soft_error`) e em 1 fala por idioma; registre "Integrated" e "True peak" no `AUDIO.md`, seção "Loudness", como valores aproximados.
- [ ] **Step 6: `docs/AUDIO.md`.** Troque "Nenhum efeito foi gerado ainda." pela seção §2.3 com a tabela de 12 linhas (formato em Produces), o lote (modelo, data, estimativa, custo real, refações), a QA automática aplicada e **"Escuta do dono: pendente, uma amostra por categoria"**. Acrescente "Totais" (créditos de vozes, falas e efeitos).
- [ ] **Step 7: Verificação.** Run: `cd frontend && npx vitest run src/shared/audio src/features/kairya`. Expected: PASS. Sabotagens (desfaça cada uma): troque um mp3 por um arquivo de 10 bytes → FAIL na janela; apague uma linha de efeito do `AUDIO.md` → FAIL; crie `public/audio/sfx/extra.wav` → FAIL nos órfãos; crie `public/audio/sfx/.DS_Store` → PASS. `ls frontend/public/audio/sfx | wc -l` dá 12; `find frontend/public/audio -name '*.mp3' -exec stat -f%z {} + | awk '{s+=$1} END {print s}'` ≤ 4 000 000.
- [ ] **Step 8: Handoff e commit.** `docs/handoff/2026-11-11-f8-sfx.md` (custo, refações, escuta pendente). `export UV_PYTHON=3.14.10 && make check`: PASS (inclui a fitness de franquia sobre `docs/`).

```bash
git add frontend/public/audio/sfx frontend/src/shared/audio/sfx.assets.test.ts frontend/src/features/kairya/recordingScript.ts assets-src/audio/roteiro.json docs/AUDIO.md docs/handoff/2026-11-11-f8-sfx.md
git commit -m "feat(audio): 12 efeitos sonoros com teste de integridade e procedência"
```

---

### Task 3: controles no menu, convite e montagem (PR B)

**Files:**

- Create: `frontend/src/shared/audio/SoundControls.tsx`, `frontend/src/shared/audio/SoundInvite.tsx` (+ `.test.tsx` de cada)
- Modify: `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/app/SideNav.tsx`, `frontend/src/shared/i18n/messages/{pt-BR,en}.ts`, `frontend/playwright.config.ts`
- Test: `frontend/src/app/SideNav.test.tsx`, `frontend/src/App.test.tsx`, `frontend/src/main.test.tsx`

**Interfaces:**

- Consumes: `useAudio(): AudioControls` (`prefs`, `setPref(channel, on)`, `inviteVisible`, `acceptInvite`, `dismissInvite`); `SoundToggle({ channel, pressed, onPressedChange })`, `Button`, `Panel` (`shared/ui`); `useT`; `memoryStorage`, `fakeAudio` (`test/audioDoubles.ts`); `WEB_URL` (`tests/e2e/servers`).
- Produces:
  - `SoundControls(): ReactElement`: `<div role="group" aria-label={t('audio.controls.label')} data-testid="sound-controls">` com um `SoundToggle` por canal, `pressed={prefs[channel]}`, `onPressedChange={(on) => setPref(channel, on)}`.
  - `SoundInvite(): ReactElement | null`: `null` se `!inviteVisible`; senão `<section aria-labelledby="sound-invite-title" data-testid="sound-invite">` em `Panel`, com `h2#sound-invite-title`, o corpo e dois `Button`: `data-testid="sound-invite-accept"` (primário, `acceptInvite`) e `sound-invite-decline` (terciário, `dismissInvite`). Sem `role="dialog"`, `aria-modal`, `autoFocus`, `aria-live`, timer ou animação.
  - Ordem de providers em `main.tsx`: `I18nProvider` > `AudioProvider` > `KairyaPresenceProvider` (a mesma do `renderWithI18n`). `ServerLocaleSync` continua dentro do `I18nProvider`.
  - `SideNav`: `SoundControls` logo depois do `LanguageSwitcher`, no mesmo bloco da marca.
  - `App`: `<SoundInvite />` como primeiro filho do `div.min-w-0.flex-1`, acima do `Headquarters`.
  - `playwright.config.ts`, em `use`: `storageState: { cookies: [], origins: [{ origin: new URL(WEB_URL).origin, localStorage: [{ name: 'kairyaquest.soundInvite', value: '1' }] }] }` (D3 do original: os E2E existentes rodam sem o cartão e sem edição).
- Chaves novas (as mesmas do original, Tarefa 8; EN revisado com `design-skills:ux-writing`, sem pressão como "não perca"):

| Chave                  | PT                                                                                              | EN                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `audio.controls.label` | Som                                                                                             | Sound                                                                                                    |
| `audio.invite.title`   | Quer ouvir a Kairya?                                                                            | Want to hear Kairya?                                                                                     |
| `audio.invite.body`    | Voz e efeitos são opcionais e as legendas aparecem sempre. Dá para mudar no menu quando quiser. | Voice and sound effects are optional, and captions always show. You can change this in the menu anytime. |
| `audio.invite.accept`  | Ligar voz e efeitos                                                                             | Turn on voice and effects                                                                                |
| `audio.invite.decline` | Agora não                                                                                       | Not now                                                                                                  |

- [ ] **Step 1: Write the failing tests.** Todos com `renderWithI18n(<X />, { audio: { storage, createElement: fakeAudio } })`:
  - `SoundControls`: `getByRole('group', { name: 'Som' })` contém os botões `Voz da Kairya` e `Efeitos sonoros`, ambos `aria-pressed="false"`; clicar em Voz → `aria-pressed="true"` só nele e `storage.getItem('kairyaquest.sound')` é `'{"voice":true,"sfx":false}'`.
  - `SoundInvite` (com `memoryStorage({})`, sem o convite dispensado): aparece (`getByTestId('sound-invite')`), `queryByRole('dialog')` é `null`, não tem `aria-modal`, `document.activeElement === document.body`; "Ligar voz e efeitos" deixa os dois canais ligados, grava `kairyaquest.sound` e some; "Agora não" some, grava `kairyaquest.soundInvite = '1'` e o som fica desligado; com `kairyaquest.sound` salvo (mesmo desligado) o convite não aparece; com `storage` que lança em `getItem`/`setItem` o convite aparece e "Agora não" o esconde (Review Focus 4 do original); título e corpo nos dois idiomas não casam `/não perca|última chance|don't miss|last chance/i`.
  - `SideNav.test.tsx`: `compareDocumentPosition` mostra `sound-controls` depois do `LanguageSwitcher`.
  - `App.test.tsx`: sem opções, `queryByTestId('sound-invite')` é `null`; com `audio: { storage: memoryStorage({}) }`, o convite está acima do `headquarters` no DOM.
  - `main.test.tsx`: o teste existente de montagem passa a provar que `useAudio()` funciona dentro de `App` (um filho que o chama não lança).
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/shared/audio src/app src/App.test.tsx src/main.test.tsx`. Expected: FAIL (módulos e chaves inexistentes).
- [ ] **Step 3: Implement** os dois componentes, as 5 chaves nos dois catálogos, a montagem e o `storageState`. O `App.tsx` ganha só a linha do `SoundInvite`.
- [ ] **Step 4: Run** `cd frontend && npx vitest run && npm run typecheck && npm run lint`. Expected: PASS, testes existentes de `App`, `SideNav` e páginas **sem edição**. O catálogo e a fitness de "nenhuma string em JSX" passam.
- [ ] **Step 5: E2E existente intacto.** `cd frontend && npx playwright test layout.spec.ts presenca.spec.ts tutor-focus.spec.ts cycle-focus.spec.ts` (porta deslocada se a outra sessão estiver rodando E2E). Expected: PASS, sem o cartão na tela.
- [ ] **Step 6: Commit** `feat(audio): botões de voz e efeitos no menu e convite não modal` (arquivos da lista acima).

---

### Task 4: voz das falas no `KairyaBubble` e funções de efeito (PR B)

**Files:**

- Create: `frontend/src/features/kairya/soundCues.ts`, `frontend/src/features/kairya/useSpokenCue.ts` (+ `soundCues.test.ts`, `useSpokenCue.test.tsx`)
- Modify: `frontend/src/features/kairya/KairyaBubble.tsx`, `KairyaPresenceProvider.tsx`, `presenceContext.ts`, `index.ts`; `frontend/src/App.tsx` (D16)
- Test: `KairyaBubble.test.tsx`, `KairyaPresenceProvider.test.tsx`, `App.test.tsx`

**Interfaces:**

- Consumes: `useAudio` (`playVoice(src)`, `playSfx(name)`, `stopVoice()`); `lineSrc(locale, id)` (`lineAudio.ts`); `useLocale()`; `useKairya()`; `SpeechCue`, `LINE_GROUPS`, `SfxName`, `SFX_NAMES`, `Reward`, `MissionType`, `Verdict`, `KairyaEvent`.
- Produces:
  - `sfxForCompletion(done: { type: MissionType; reward: Reward | null | undefined }): SfxName`: `level_up` se `level_after > level_before`; senão `achievement` se há conquistas; senão `lantern_lit` (`diaria`) ou `mission_done` (`avulsa`, `especial`). Sem `reward`, o efeito do tipo.
  - `sfxForEvaluation(done: { verdict: Verdict | null; reward: Reward | null | undefined }): SfxName | null`: só `atende` com `reward` não nulo: `level_up` > `achievement` > `xp_tick`; o resto `null`.
  - `sfxForTutorEvent(event: KairyaEvent): SfxName | null`: `questionSent` → `message_sent`; `tutorFailed` (offline ou não) → `soft_error`; o resto `null`.
  - `sfxForOpening(cue: SpeechCue, lastStreak: number | null): SfxName | null`: `streak_kept` se `cue.line` é de `greetMorning`, `greetAfternoon` ou `greetEvening` (`LINE_GROUPS`) e `lastStreak > 0`; senão `null`.
  - `useSpokenCue(cue: SpeechCue | null): void` (regras no D14, e `sfxForOpening` por `playSfx` uma vez por `cue`).
  - `KairyaContextValue.readStreak(): number | null` (D18).
  - `index.ts` exporta `sfxForCompletion`, `sfxForEvaluation`, `sfxForTutorEvent` (as features de missões e tutoria importam só do índice, `noCrossFeatureInternals`).

- [ ] **Step 1: Write the failing tests.**
  - `soundCues.test.ts`: as tabelas `COMPLETION_CASES`, `EVALUATION_CASES`, `TUTOR_CASES`, `OPENING_CASES` do original (Tarefa 9), com `test.each` e os valores esperados lá fixados (`diária sem reward → lantern_lit`, `especial com nível → level_up`, `parcial`/`nao_atende`/`atende sem reward → null`, `greet_afternoon_1` com sequência 0 → `null`, `comeback_1` → `null`). Mais `test('todo SfxName é produzido por algum gatilho')`: o conjunto produzido pelas quatro funções sobre as tabelas, unido a `PAGE_WIRED = ['proposal_arrived', 'panel_open', 'weekly_trial_unlocked', 'trail_step']`, **é igual** a `new Set(SFX_NAMES)` (o conjunto vem da aplicação das funções, não da coluna de esperados).
  - `useSpokenCue.test.tsx` (`renderWithI18n` com `audio: { storage: memoryStorage({ 'kairyaquest.sound': '{"voice":true,"sfx":true}', 'kairyaquest.soundInvite': '1' }), createElement: fakeAudio }`; um componente de teste que chama o hook com a `cue` da prop, e o `fakeAudio` do canal de voz registra `play`/`pause`/`src`):
    - `a cue mostrada toca o arquivo do idioma atual`: em `en`, `src` termina em `/audio/en/greet_morning_1.mp3`; em `pt-BR`, em `/audio/pt-BR/...`.
    - `a mesma cue com re-render e troca de idioma não toca de novo` (Review Focus 4): `play` chamado exatamente 1 vez.
    - `cue nova interrompe a anterior e continua tocando`: rerender A→B, `await Promise.resolve()`; o último evento do elemento é o `play` de B (nenhum `pause` depois dele).
    - `cue null para a voz na microtask seguinte`: `pause` chamado 1 vez depois de `await Promise.resolve()`.
    - `dentro de StrictMode` (`strict: true`): cue mostrada → exatamente 1 `play` e nenhum `pause` depois dele; desmontar → exatamente 1 `pause`.
    - `voz desligada: nenhum elemento é criado` e, ligando a voz depois, a `cue` velha **não** toca (`WeakSet`).
    - `play() rejeitado com NotAllowedError`: nada lança, `console.warn` recebe `AUTOPLAY_BLOCKED_WARNING` uma vez.
    - `saudação com sequência > 0 toca streak_kept; com 0 ou null, não` (usa `readStreak` do provider via `reportStreak(3)` antes da `cue`); `saudação adiada`: `reportStreak(3)` com a Kairya `thinking` não toca nada; quando o humor libera e a `cue` da saudação aparece, toca `streak_kept` uma vez (Review Focus 3).
  - `KairyaPresenceProvider.test.tsx`: `readStreak()` é `null` antes de `reportStreak`, devolve a última sequência depois, tem identidade estável entre renders, e com `greeting: false` continua `null`.
  - `KairyaBubble.test.tsx` (casos novos): "Fechar a fala" corta a voz (`pause` depois da microtask) e a bolha fechada não toca de novo; o `data-testid="kairya-bubble-anchor"` continua recebendo o foco (sem regressão).
  - `App.test.tsx`: com a voz ligada e uma fala tocando no Quartel-General, trocar para Campanhas chama `pause` na voz e nenhum `play` novo dela; voltar ao Quartel-General não fala de novo.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/features/kairya src/App.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** as funções puras e o hook (D14); `KairyaBubble` chama `useSpokenCue(cue)` uma vez, sem mais nada; o provider guarda a sequência em `useRef` dentro de um `reportStreak` embrulhado (identidade estável por `useCallback`) e expõe `readStreak`; `App.navigate` chama `audio.stopVoice()` antes do `flushSync` (D16).
- [ ] **Step 4: Run** `cd frontend && npx vitest run --coverage && npm run typecheck && npm run lint`. Expected: PASS, 100%. Sabotagem: remova o cancelamento do corte agendado e confirme FAIL no teste de StrictMode e no de "cue A→B"; desfaça.
- [ ] **Step 5: Commit** `feat(audio): a Kairya fala a legenda que mostra, com corte seguro no StrictMode`.

---

### Task 5: efeitos ligados aos gatilhos (PR B)

**Files:**

- Modify: `features/missions/MissionCard.tsx` (`handleCompleted`), `features/missions/EvaluationPanel.tsx` (`handleResult`), `features/tutoring/tutorPresence.ts` (`arrivedProposal`), `features/tutoring/useTutorPresence.ts`, `features/tutoring/TutorPanel.tsx` (D15 e `panel_open`), `features/campaigns/LanternTrail.tsx` (D19)
- Test: `MissionCard.test.tsx`, `EvaluationPanel.test.tsx`, `tutorPresence.test.ts`, `useTutorPresence.test.tsx`, `TutorPanel.test.tsx`, `LanternTrail.test.tsx` (e o teste existente de página que cobre cada um)

**Interfaces:**

- Consumes: `useAudio().playSfx/stopVoice`; `sfxForCompletion`, `sfxForEvaluation`, `sfxForTutorEvent` (do índice `features/kairya`); `fakeAudio`, `memoryStorage`, `settlePlays`.
- Produces: `arrivedProposal(prev: PresenceInput, next: PresenceInput): boolean` em `tutorPresence.ts`: `prev.send.status` em `sending`/`writing`, `next.send.status === 'idle'` e `next.send.answer?.actions.some((a) => a.state === 'proposta') === true`. Nenhuma prop nova nos componentes (D19).

- [ ] **Step 1: Write the failing tests** (todos com som ligado e `fakeAudio`; asserções sobre o `src` do elemento de efeitos, que termina em `/audio/sfx/<name>.mp3`):
  - `MissionCard`: concluir diária → `lantern_lit`; avulsa → `mission_done`; avulsa com nível novo → `level_up`; com conquista → `achievement`; **um** `play` por conclusão, mesmo com nível e conquista juntos (Review Focus 5 do original). Com a Kairya `thinking` (celebração ignorada pelo reducer) o efeito toca igual (Review Focus 2).
  - `EvaluationPanel`: `atende` com `reward` → `xp_tick`; com nível → `level_up`; `parcial` e `nao_atende` → nenhum elemento de efeito criado.
  - `tutorPresence.test.ts`, `arrivedProposal`: `writing`→`idle` com ação `proposta` → `true`; com ação `executada` → `false`; `idle`→`idle` (histórico carregado) → `false`; `writing`→`failed` → `false`.
  - `useTutorPresence.test.tsx`: `questionSent` toca `message_sent`; falha (`failed` e `unknown`) toca `soft_error`; resposta com proposta toca `proposal_arrived`, sem proposta não toca; digitar não toca nada.
  - `TutorPanel.test.tsx`: no celular (`stubViewport`), o clique de `tutor-sheet-open` toca `panel_open` **e** chama `pause` na voz que estava tocando, e fechar a folha não chama `play` na voz (Review Focus 1); no desktop, expandir o painel recolhido toca `panel_open` e **não** corta a voz; recolher, montar com a preferência "aberto" e restaurar não tocam nada.
  - `LanternTrail.test.tsx`: com a especial `disponivel` o splash `trail-special-art` toca `weekly_trial_unlocked` uma vez por montagem; `bloqueada`, nenhum; o clique de `trail-go-headquarters` toca `trail_step` **antes** de `onOpenHeadquarters` (ordem verificada com um `vi.fn` que lê o `src` do elemento no momento da chamada).
  - **Jornada com o som desligado** (no `Headquarters.audio.test.tsx` novo, `routeFetch`): concluir a diária e mandar uma pergunta não cria nenhum elemento de áudio (Review Focus 3 do original).
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/features/missions src/features/tutoring src/features/campaigns src/pages`. Expected: FAIL.
- [ ] **Step 3: Implement.** Cada ponto só acrescenta a chamada de `playSfx` com o valor da função pura (sem regra nova nos componentes); `useTutorPresence` toca o primeiro `sfxForTutorEvent` não nulo dos eventos e `proposal_arrived` quando `arrivedProposal(previous.current, input)`; `TutorPanel` embrulha `setSheetOpen(true)` e a expansão do desktop (`toggleDesktop` com `next === true`).
- [ ] **Step 4: Run** `cd frontend && npx vitest run --coverage && npm run typecheck && npm run lint`. Expected: PASS, 100%.
- [ ] **Step 5: Commit** `feat(audio): efeitos nos eventos de missão, avaliação, tutora, trilha e painel`.

---

### Task 6: E2E de áudio (PR B)

**Files:**

- Create: `frontend/tests/e2e/audio.spec.ts`, `docs/handoff/2026-11-11-f8-integracao.md`
- Modify: `docs/AUDIO.md` (uma frase sobre o convite e a preferência)

**Interfaces:**

- Consumes: o app montado (Tarefas 3 a 5), os mp3 reais (PR A), o falso Anthropic do E2E, os helpers existentes de `cycle.spec.ts`/`presenca.spec.ts` (login, plano, conclusão da diária; `esperarAnimacoesFinitas` de `animacoes.ts`), `AUTOPLAY_BLOCKED_WARNING` e `UNAVAILABLE_WARNING_PREFIX` de `src/shared/audio/audioPlayer`, e o `test` do `@playwright/test` (não o de `saudacaoJaVista`, como `presenca.spec.ts`).
- Produces: o spec abaixo. No topo, `test.use({ storageState: { cookies: [], origins: [] } })` desfaz o convite dispensado (D3). Preferência ligada por `page.addInitScript` antes do `goto`. Todo teste coleta pedidos com `page.on('request')` filtrado por `pathname.startsWith('/audio/')` e falha com `page.on('pageerror')`.

- [ ] **Step 1: Write the failing tests** (mesmos cenários do original, Tarefa 10, com as formas de hoje):
  - `padrão`: convite visível, axe sem violação (depois de `esperarAnimacoesFinitas`), jornada inteira (concluir a diária, mandar pergunta, `tutor-answer` visível) e `audioRequests` igual a `[]`.
  - `"Agora não" e recarregar`: o convite não volta.
  - `ligar pelo convite`: concluir a diária pede **≥ 1** `/audio/sfx/lantern_lit.mp3` e **≥ 1** `/audio/pt-BR/`, com `kairya-bubble-anchor` mostrando a legenda (o Chromium pode pedir com `Range`; por isso ≥ 1).
  - `404 em toda fala` e `arquivo corrompido` (`page.route('**/audio/pt-BR/**', ...)` com 404 e com 200 + `'lixo'`): legenda visível, nenhum `pageerror`, o aviso `${UNAVAILABLE_WARNING_PREFIX} <path>` **exatamente 1 vez**, e a mesma fala não é pedida de novo na sessão (helper `assertSameLineIsNotRetried`). A fala é lida do texto da legenda comparado ao catálogo pt-BR (a bolha **não** tem mais `data-line`; o helper mapeia o texto para o `LineId` pela tabela `CATALOGS['pt-BR']` importada do app, ou, se o spec não puder importar `src`, acrescente `data-line={cue.line}` ao `<p>` da fala no `KairyaBubble` na Tarefa 4 e use-o). **Evento repetido** sem recarregar: concluir avulsas em sequência; o sorteio é fixado por `page.addInitScript` que substitui `Math.random` por uma função que alterna `0` e `2 ** -31` (sementes 0 e 1: `pickLine` usa `seed % n`, então saem `mission_done_1` e `mission_done_2` em ordem A, B, A); o E2E não é varrido pelo `noMathRandom.test.ts`, que só olha `src/**/*.test.*`. Repetição válida só conta depois de um pedido de **outro** caminho de voz desde a última tentativa; a 3ª conclusão é a repetição (teto determinístico 3, falha com mensagem se a alternância quebrar). Pré-condição: `grep -rn "Math.random" frontend/src --include=*.ts --include=*.tsx` fora de `*.test.*` mostra só o consumidor do `useKairyaMood`; se houver outro, pare e leve ao controlador.
  - `autoplay bloqueado`: `HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('blocked', 'NotAllowedError'))`, preferência ligada, saudação visível: exatamente **1** `console.warn` igual a `AUTOPLAY_BLOCKED_WARNING`, nenhum `pageerror`. (Reuso da saudação: limpar `kairyaquest.lastGreeting` neste teste, como `presenca.spec.ts`.)
  - `prefers-reduced-motion não desliga o som`: contexto com `reducedMotion: 'reduce'`, preferência ligada, concluir a diária pede ≥ 1 `/audio/sfx/lantern_lit.mp3`.
  - `folha da tutora no celular corta a voz`: viewport de celular, voz ligada, com a bolha aberta abrir `tutor-sheet-open`; afirmar que `[...document.querySelectorAll('audio')]`-equivalente não está tocando: o spec instala em `addInitScript` um espião em `HTMLMediaElement.prototype.pause`/`play` que incrementa `window.__audioLog`, e o teste exige `pause` depois do `play` e nenhum `play` novo ao fechar a folha (Review Focus 1).
- [ ] **Step 2: Run** `cd frontend && npx playwright test tests/e2e/audio.spec.ts`. Expected: FAIL sem as Tarefas 3 a 5; PASS com elas.
- [ ] **Step 3: Gate.** `export UV_PYTHON=3.14.10 && make check`. Expected: PASS, com `presenca.spec.ts`, `cycle-focus.spec.ts`, `tutor-focus.spec.ts` e `layout.spec.ts` sem edição.
- [ ] **Step 4: Verificação manual de fim de fase** (se o dono pedir; não use screenshot por padrão): `npm run dev` (com `<StrictMode>`), ligar pelo convite, concluir a diária, ouvir a fala **uma vez e sem corte**, trocar o idioma e ouvir a fala seguinte no novo idioma, desligar a Voz no meio de uma fala.
- [ ] **Step 5: Handoff e commit.** `docs/handoff/2026-11-11-f8-integracao.md`: decisões D14 a D19, pendências (escuta do dono dos efeitos; N1 a N3 da F6 seguem abertos). Atualize a frase em `docs/AUDIO.md`.

```bash
git add frontend/tests/e2e/audio.spec.ts docs/handoff/2026-11-11-f8-integracao.md docs/AUDIO.md
git commit -m "test(audio): E2E de convite, 404, corrompido, autoplay bloqueado e folha da tutora"
```

---

## Self-review

- **Cobertura:** Tarefa 4 do original → Tarefas 1 e 2; integridade e procedência de efeitos (Tarefa 7) → Tarefas 1 e 2 (D20); Tarefa 8 → 3; Tarefa 9 → 4 e 5 (voz no 4, efeitos no 5); Tarefa 10 → 6. As Global Constraints, os cinco Review Focus, D1–D13 e a tabela de gatilhos do original estão citados, com os novos Review Focus 1 a 5 desta rodada e D14 a D22. Os 12 efeitos têm gatilho: `proposal_arrived`, `panel_open`, `weekly_trial_unlocked` e `trail_step` pelo `PAGE_WIRED` e pelos testes da Tarefa 5; os outros 8 pelas funções puras.
- **Passos:** a Tarefa 2 mistura passos pagos e de QA; cada um tem comando e critério (`Step 4b` é a loudness, entre o 5 e o 6). Nenhum corpo de função é transcrito.
- **Consistência de tipos:** `sfxForCompletion`/`sfxForEvaluation` recebem `{type|verdict, reward}`, o mesmo formato de `completionEvents`/`evaluationEvents`; `readStreak()` é definido na Tarefa 4 e só consumido nela; `arrivedProposal` é definido e usado na Tarefa 5; `useSpokenCue(cue)` tem uma assinatura só.
- **Pontos a conferir na execução (não resolvidos aqui):** (1) o E2E precisa do `LineId` da legenda: o plano deixa a escolha entre importar o catálogo ou acrescentar `data-line` na bolha (a segunda é uma linha em `KairyaBubble.tsx`, na Tarefa 4); (2) `MessageRead.actions` e `ActionState` devem expor `'proposta'` como no original (conferir em `features/tutoring/types.ts` antes de escrever `arrivedProposal`); (3) o teste da folha no E2E depende do viewport de celular do projeto `chromium`.
- **Proporção:** o plano tem o tamanho de uma fração do original (~1000 linhas) e só decide o que o implementador não decide sozinho.
