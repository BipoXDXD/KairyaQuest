# Áudio — procedência

Registro das vozes, falas gravadas e efeitos sonoros do KairyaQuest. Todo
áudio é pré-gerado no ElevenLabs e versionado no repositório; não há TTS ao
vivo. As regras de voz e tom, as descrições usadas no voice design e o
processo de escolha estão em `docs/kairya/voz.md` (§5 e §6).

## 1. Vozes

As duas vozes são originais, projetadas por descrição (`creative_design_voice`),
sem clonar nem imitar voz real. Uma voz só entra nesta tabela depois que o dono
escolhe a prévia.

| Idioma | Nome no ElevenLabs | `voice_id`             | Descrição                 | Prévia escolhida    | Data       | Estado                      |
| ------ | ------------------ | ---------------------- | ------------------------- | ------------------- | ---------- | --------------------------- |
| EN     | Kairya EN          | `nDPrY1ROoHMmgN9arroD` | `docs/kairya/voz.md` §6.1 | EN-2                | 10/11/2026 | Escolhida pelo dono e salva |
| PT     | Kairya PT          | `ammaQj63LoLEE4PB1dxU` | `docs/kairya/voz.md` §6.2 | v6-2 (sexta rodada) | 10/11/2026 | Escolhida pelo dono e salva |

A voz PT foi projetada com o modelo `eleven_ttv_v3` e guidance 7, depois de
seis rodadas de prévias; a §6.2 de `docs/kairya/voz.md` traz a descrição final
e o retorno do dono que a moldou.

O `voice_id` não é segredo: identifica a voz dentro da conta e só funciona com
a chave da conta, que nunca entra no repositório.

## 2. Falas e efeitos

Cada lote pago começa com uma medição de duas falas (ou dois efeitos), com o
custo real informado ao dono, e só continua com o OK dele. Cada lote entra aqui
com o modelo de TTS, a data, o custo real e os arquivos produzidos.

### 2.1 Falas EN

| Lote      | Modelo      | Voz       | Data       | Falas                               | Tomadas            | Créditos  |
| --------- | ----------- | --------- | ---------- | ----------------------------------- | ------------------ | --------- |
| Medição   | `eleven_v4` | Kairya EN | 10/11/2026 | `greet_morning_1`, `mission_done_1` | 2 por fala (A e B) | 170       |
| Restante  | `eleven_v4` | Kairya EN | 10/11/2026 | as outras 34                        | 1 por fala         | 1.844     |
| **Total** |             |           |            | **36**                              |                    | **2.014** |

- **Texto:** o de `kairya.lines.<id>` no catálogo EN, com a tag de direção
  `[warmly]` no início, que combina com a §6 de `docs/kairya/voz.md`. A tag
  entra na contagem de caracteres cobrada.
- **Tomada usada na medição:** a A, nas duas falas. As durações das tomadas A e
  B ficaram a menos de 4% uma da outra.
- **QA automática, em todas as 36:** transcrição com `creative_transcribe_audio`
  (sem custo) comparada com o texto do catálogo; duração dentro de ±40% da
  mediana das falas de tamanho parecido; nada cortado nem silêncio sobrando no
  início ou no fim. As 36 passaram na primeira tomada: **nenhuma refação**.
- **Pós-processo:** `scripts/encode-audio.sh` (loudnorm em -18 LUFS, mono,
  44,1 kHz, mp3 CBR de 64 kbps, aparo das bordas).
- **Arquivos:** `frontend/public/audio/en/<id>.mp3`, um por `LineId`.
- **Escuta do dono:** pendente, uma amostra por categoria.

### 2.2 Falas PT

| Lote      | Modelo      | Voz       | Data       | Falas                               | Tomadas    | Créditos  |
| --------- | ----------- | --------- | ---------- | ----------------------------------- | ---------- | --------- |
| Medição   | `eleven_v4` | Kairya PT | 10/11/2026 | `greet_morning_1`, `mission_done_1` | 1 por fala | 92        |
| Restante  | `eleven_v4` | Kairya PT | 10/11/2026 | as outras 34                        | 1 por fala | 1.820     |
| **Total** |             |           |            | **36**                              |            | **1.912** |

- **Texto:** o de `kairya.lines.<id>` no catálogo PT, com uma tag de direção no
  início. `[excited]` nas comemorações (`mission_done_*`,
  `weekly_trial_done_*`, `level_up_*`, `achievement_*`, `streak_kept_*`), para
  a empolgação real que o dono pediu na §6.2 de `docs/kairya/voz.md`;
  `[warmly]` em todas as outras. A tag entra na contagem de caracteres cobrada.
- **Autorização:** o dono deu o OK da medição e do lote junto com a escolha da
  voz, com a condição de receber o custo real de cada um.
- **Teto do lote:** 2.800 créditos, com refação seletiva só das falas que a QA
  reprovar, no máximo uma por fala.
- **QA automática, em todas as 36:** os mesmos critérios da §2.1. As 36
  passaram na primeira tomada: **nenhuma refação**. A transcrição do PT
  devolve a tag no início, entre colchetes (`[warmly]`, `[excited]`), com 0,07
  a 0,23 s, menos que qualquer palavra falada; a fala começa em 0 s e o texto
  vem inteiro depois dela. A tag foi tratada como marcação da transcrição, não
  como fala, e o dono confirmou essa leitura.
- **Pós-processo:** `scripts/encode-audio.sh`, como no EN.
- **Arquivos:** `frontend/public/audio/pt-BR/<id>.mp3`, um por `LineId`.
- **Escuta do dono:** feita em 10/11/2026, uma amostra por categoria. As 36
  falas PT foram aprovadas.

### 2.3 Efeitos

| Lote      | Modelo                    | Data       | Efeitos        | Variações    | Créditos |
| --------- | ------------------------- | ---------- | -------------- | ------------ | -------- |
| Medição   | `eleven_text_to_sound_v2` | 11/11/2026 | `mission_done` | 2 (A e B)    | 34       |
| Restante  | `eleven_text_to_sound_v2` | 11/11/2026 | os outros 11   | 2 por efeito | 374      |
| **Total** |                           |            | **12**         |              | **408**  |

Um arquivo por linha (o teste `sfx.assets.test.ts` confere que cada efeito está aqui):

| Arquivo                                             | Efeito                | Prompt                                                                                   | Segundos (alvo) | Modelo                  | Data       | Créditos (2 variações) | Variação |
| --------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------- | --------------- | ----------------------- | ---------- | ---------------------- | -------- |
| frontend/public/audio/sfx/mission_done.mp3          | mission_done          | Soft wooden wind chime with a gentle bell, short warm resolve, quiet                     | 1               | eleven_text_to_sound_v2 | 11/11/2026 | 34                     | B        |
| frontend/public/audio/sfx/xp_tick.mp3               | xp_tick               | Tiny soft wooden tick with a faint sparkle, very short quiet interface sound             | 0.5             | eleven_text_to_sound_v2 | 11/11/2026 | 34                     | A        |
| frontend/public/audio/sfx/level_up.mp3              | level_up              | Warm rising three-note marimba phrase with a soft temple bell tail, gentle and uplifting | 2               | eleven_text_to_sound_v2 | 11/11/2026 | 34                     | A        |
| frontend/public/audio/sfx/achievement.mp3           | achievement           | Gentle bright chime with a soft paper rustle, a small proud moment, warm                 | 1.5             | eleven_text_to_sound_v2 | 11/11/2026 | 34                     | A        |
| frontend/public/audio/sfx/weekly_trial_unlocked.mp3 | weekly_trial_unlocked | Soft low drum tap followed by a warm resonant bell, calm anticipation                    | 2               | eleven_text_to_sound_v2 | 11/11/2026 | 34                     | A        |
| frontend/public/audio/sfx/lantern_lit.mp3           | lantern_lit           | Soft match strike and a warm gentle flame whoosh, cozy and quiet                         | 1               | eleven_text_to_sound_v2 | 11/11/2026 | 34                     | A        |
| frontend/public/audio/sfx/proposal_arrived.mp3      | proposal_arrived      | Soft paper scroll unrolling with a light wooden knock, friendly notification             | 0.8             | eleven_text_to_sound_v2 | 11/11/2026 | 34                     | B        |
| frontend/public/audio/sfx/message_sent.mp3          | message_sent          | Short soft whoosh of paper, light and airy, quiet interface sound                        | 0.5             | eleven_text_to_sound_v2 | 11/11/2026 | 34                     | B        |
| frontend/public/audio/sfx/soft_error.mp3            | soft_error            | Two muted soft wooden taps, low and gentle, not alarming                                 | 0.5             | eleven_text_to_sound_v2 | 11/11/2026 | 34                     | A        |
| frontend/public/audio/sfx/streak_kept.mp3           | streak_kept           | Single soft wooden clapper tap with a short warm chime, steady                           | 0.8             | eleven_text_to_sound_v2 | 11/11/2026 | 34                     | A        |
| frontend/public/audio/sfx/trail_step.mp3            | trail_step            | Single soft footstep on a stone path at night, quiet                                     | 0.5             | eleven_text_to_sound_v2 | 11/11/2026 | 34                     | B        |
| frontend/public/audio/sfx/panel_open.mp3            | panel_open            | Soft sliding paper door opening, gentle wooden glide, quiet                              | 0.8             | eleven_text_to_sound_v2 | 11/11/2026 | 34                     | B        |

- **Prompt:** o de `SFX_GUIDE` em `frontend/src/features/kairya/recordingScript.ts`.
  O modelo não aceita duração: a do guia é alvo, e o aparo vem no pós-processo.
- **Variação escolhida (QA automática):** a que tem o som inteiro, sem cauda
  longa de silêncio e dentro de ~2 s. B em `mission_done`, `proposal_arrived`,
  `message_sent`, `trail_step` e `panel_open`; A nos outros sete. Descartadas:
  `xp_tick` B (quase só silêncio) e `soft_error` B (5 s, longa demais).
- **Pós-processo:** `scripts/encode-audio.sh <bruto> <saída> sfx trim`
  (loudnorm em -20 LUFS, mono, 44,1 kHz, mp3 CBR de 64 kbps, aparo das bordas).
  Depois do loudnorm, `soft_error` e `xp_tick` ficaram com pico acima de 0 dBFS.
  Os dois receberam -3 dB numa segunda passada (`volume=-3dB`, mesmo formato).
  Todos ficam com pico ≤ -1,5 dBFS.
- **Loudness medida (ebur128, aproximada):** `level_up` -20,4 LUFS;
  `lantern_lit` -22,3 LUFS; `soft_error` -25,5 LUFS depois do ajuste. Efeitos
  abaixo de 0,4 s, como `xp_tick`, ficam curtos demais para o integrado do
  ebur128.
- **Prompt de `soft_error`:** a troca proposta no D22 do plano de fechamento
  não foi aplicada, porque o efeito já tinha sido gerado com o prompt original.
  A variação A passou na QA e soa suave.
- **Tamanho:** de 2.089 a 16.300 bytes por efeito, 106.868 no total. O teste
  `frontend/src/shared/audio/sfx.assets.test.ts` prende o teto de 20.000 bytes
  por efeito e de 4.000.000 para todo o áudio do app.
- **Arquivos:** `frontend/public/audio/sfx/<nome>.mp3`, um por `SfxName`.
- **Brutos:** `assets-src/audio/raw/sfx/<nome>.{a,b}.mp3`, fora do git.
- **Escuta do dono:** pendente.

### 2.4 Como o app toca

O som nasce desligado: a primeira visita mostra um convite não modal, e a
escolha (voz e efeitos, separados) fica em `localStorage` por dispositivo,
sem passar pela conta. Com a preferência desligada, nenhum arquivo é pedido.

### Totais

| Item     | Créditos |
| -------- | -------- |
| Falas EN | 2.014    |
| Falas PT | 1.912    |
| Efeitos  | 408      |
