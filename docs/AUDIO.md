# Áudio — procedência

Registro das vozes, falas gravadas e efeitos sonoros do KairyaQuest. Todo
áudio é pré-gerado no ElevenLabs e versionado no repositório; não há TTS ao
vivo. As regras de voz e tom, as descrições usadas no voice design e o
processo de escolha estão em `docs/kairya/voz.md` (§5 e §6).

## 1. Vozes

As duas vozes são originais, projetadas por descrição (`creative_design_voice`),
sem clonar nem imitar voz real. Uma voz só entra nesta tabela depois que o dono
escolhe a prévia.

| Idioma | Nome no ElevenLabs | `voice_id` | Descrição | Prévia escolhida | Data | Estado |
|---|---|---|---|---|---|---|
| EN | Kairya EN | `nDPrY1ROoHMmgN9arroD` | `docs/kairya/voz.md` §6.1 | EN-2 | 10/11/2026 | Escolhida pelo dono e salva |
| PT | Kairya PT | `ammaQj63LoLEE4PB1dxU` | `docs/kairya/voz.md` §6.2 | v6-2 (sexta rodada) | 10/11/2026 | Escolhida pelo dono e salva |

A voz PT foi projetada com o modelo `eleven_ttv_v3` e guidance 7, depois de
seis rodadas de prévias; a §6.2 de `docs/kairya/voz.md` traz a descrição final
e o retorno do dono que a moldou.

O `voice_id` não é segredo: identifica a voz dentro da conta e só funciona com
a chave da conta, que nunca entra no repositório.

## 2. Falas e efeitos

Cada lote pago começa com uma medição de duas falas (ou dois efeitos), com o
custo real informado ao dono, e só continua com o OK dele. Cada lote entra aqui
com o modelo de TTS, a data, o custo real e os arquivos produzidos.

Nenhum efeito foi gerado ainda.

### 2.1 Falas EN

| Lote | Modelo | Voz | Data | Falas | Tomadas | Créditos |
|---|---|---|---|---|---|---|
| Medição | `eleven_v4` | Kairya EN | 10/11/2026 | `greet_morning_1`, `mission_done_1` | 2 por fala (A e B) | 170 |
| Restante | `eleven_v4` | Kairya EN | 10/11/2026 | as outras 34 | 1 por fala | 1.844 |
| **Total** | | | | **36** | | **2.014** |

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

| Lote | Modelo | Voz | Data | Falas | Tomadas | Créditos |
|---|---|---|---|---|---|---|
| Medição | `eleven_v4` | Kairya PT | 10/11/2026 | `greet_morning_1`, `mission_done_1` | 1 por fala | 92 |
| Restante | `eleven_v4` | Kairya PT | 10/11/2026 | as outras 34 | 1 por fala | 1.820 |
| **Total** | | | | **36** | | **1.912** |

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
