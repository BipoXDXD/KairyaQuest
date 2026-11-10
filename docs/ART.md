# Arte do projeto e identidade Kairya

Kairya é a tutora e personagem do projeto. Toda a arte em uso foi gerada na
Fase 7, em 2026-11-10, pela Tripo (text-to-image e image-to-image, modelos
`seedream_v4` e `seedream_v5`), e aprovada pelo responsável em quatro lotes:
A (retrato), B (expressões), C (cenários) e D (estados vazios e prova da
semana). Cada prompt termina com a cláusula "Original design, not based on any
existing character or franchise." Nenhuma imagem foi extraída de jogo ou obra
existente.

## Processo

- Fontes: a imagem escolhida na decisão de cada lote. Os originais e os
  registros de procedência de cada lote (saldos antes e depois, candidatos
  descartados, revisão visual) ficam fora do repositório, nas notas locais da
  coordenação da Fase 7.
- Pós-processo local, sem nova geração e sem custo: redução Lanczos só acima
  do teto de largura (personagem 864 px; cenários, estados vazios e prova
  1600 px), proporção mantida; `cwebp -q <Q> -m 6 -sharp_yuv -metadata none`,
  de q=85 descendo de 2 em 2 até caber em 200 KB (204.800 bytes). Nenhum
  arquivo precisou de q abaixo de 80.
- Metadados removidos: sem EXIF, XMP nem ICC.
- Custo real: 5 créditos Tripo por tarefa, igual ao `credits_consumed` de cada
  uma e conferido pela diferença de saldo. As 12 tarefas usadas custaram 60
  créditos; os quatro lotes, com candidatos descartados e refações, somaram
  175 créditos (saldo 3000 → 2825). O pós-processo não consumiu créditos.

## Arquivos

Datas em UTC, no envio da tarefa. Bytes medidos com `ls -l` no repositório.

| Arquivo em `frontend/public/art/` | Dimensões | Bytes | Uso | Tarefa Tripo | Data | Modelo | Custo |
|---|---:|---:|---|---|---|---|---:|
| `kairya/portrait.webp` | 864×1152 | 59.506 | Retrato aberto no painel da Kairya (desktop) | `642b0c67-36ae-426d-b343-e2378fab71fb` | 2026-11-10T09:12:43Z | seedream_v4, text-to-image | 5 |
| `kairya/avatar.webp` | 128×160 | 3.560 | Avatar compacto (painel recolhido e celular) | `642b0c67-36ae-426d-b343-e2378fab71fb` (recorte do retrato) | 2026-11-10T09:12:43Z | seedream_v4, text-to-image | 0 adicional |
| `kairya/neutral.webp` | 864×1184 | 56.232 | Ainda sem uso no front; será ligado na Fase 6 (expressões) | `8efbe441-09ac-4e7e-a364-8533f86f3cdf` | 2026-11-10T09:36:54Z | seedream_v5, image-to-image | 5 |
| `kairya/listening.webp` | 864×1184 | 54.640 | Ainda sem uso no front; será ligado na Fase 6 (expressões) | `8f7aa585-68a6-43b6-9954-0aa47d3d8cd2` | 2026-11-10T09:25:10Z | seedream_v5, image-to-image | 5 |
| `kairya/thinking.webp` | 864×1184 | 53.424 | Ainda sem uso no front; será ligado na Fase 6 (expressões) | `e6e16af0-b5d4-4c5a-858c-e706ffe6f898` | 2026-11-10T09:37:33Z | seedream_v5, image-to-image | 5 |
| `kairya/celebrating.webp` | 864×1152 | 73.988 | Ainda sem uso no front; será ligado na Fase 6 (expressões) | `2407c88d-d5ea-4800-a381-0b1461ca83b5` | 2026-11-10T09:29:45Z | seedream_v5, image-to-image | 5 |
| `kairya/concerned.webp` | 864×1184 | 51.638 | Ainda sem uso no front; será ligado na Fase 6 (expressões) | `88cae423-6aee-435d-b2be-332aac7c8e90` | 2026-11-10T09:41:47Z | seedream_v5, image-to-image | 5 |
| `scenes/hq.webp` | 1600×900 | 196.442 | Hero do Quartel-General | `d56e28be-0e14-47b7-98b7-4fd1bf873532` | 2026-11-10T09:45:18Z | seedream_v5, text-to-image | 5 |
| `scenes/campaigns.webp` | 1600×900 | 131.476 | Hero de Campanhas | `143b2921-e32a-41e2-8dfb-e40093efbfa7` | 2026-11-10T09:47:45Z | seedream_v5, text-to-image | 5 |
| `empty/missions.webp` | 1600×1600 | 47.662 | Ainda sem uso no front; será ligado na Fase 5 (estados vazios, prova da semana) | `c218f28f-bbda-4f03-9bba-5480622a29bf` | 2026-11-10T09:56:03Z | seedream_v5, text-to-image | 5 |
| `empty/plan.webp` | 1600×1600 | 29.710 | Ainda sem uso no front; será ligado na Fase 5 (estados vazios, prova da semana) | `2c52d2a7-f981-4cdb-9bff-45f534658e7f` | 2026-11-10T09:52:23Z | seedream_v5, text-to-image | 5 |
| `empty/campaign-new.webp` | 1600×1600 | 55.600 | Ainda sem uso no front; será ligado na Fase 5 (estados vazios, prova da semana) | `57e6a21e-c788-4ec3-a065-b5cb7cc82942` | 2026-11-10T09:53:00Z | seedream_v5, text-to-image | 5 |
| `trial/weekly-trial.webp` | 1600×2133 | 146.342 | Ainda sem uso no front; será ligado na Fase 5 (estados vazios, prova da semana) | `1f8940df-3bb8-4f3d-b493-e80a425d522f` | 2026-11-10T09:54:25Z | seedream_v5, image-to-image | 5 |

Total: 13 arquivos, 960.220 bytes. O maior é `scenes/hq.webp` (q=80); os
demais saíram em q=85.

As expressões (`neutral`, `listening`, `thinking`, `celebrating`,
`concerned`) e a prova da semana são edições image-to-image que têm o
retrato aprovado como referência, direta ou por uma rodada anterior do mesmo
lote, para manter a identidade da personagem.

### Retoques locais

- `kairya/avatar.webp`: recorte de 768×960 px em +501+45 da fonte (rosto e
  alto dos ombros centrados), reduzido para 128×160.
- `empty/campaign-new.webp`: o contorno âmbar fica em volta da lanterna, no
  centro do quadro, e não na borda da imagem. Um recorte cortaria o próprio
  motivo, então não houve recorte. O retoque local dessaturou, escureceu e
  tingiu de azul os pixels alaranjados numa janela de 400×400 px em volta da
  lanterna, que passou a ler como apagada. Ressalvas: resta um halo âmbar
  fraco fora da linha; algumas faixas do papel perto da borda esquerda ficaram
  levemente azuladas no detalhe 1:1; o topo do poste ficou acinzentado.
- `trial/weekly-trial.webp`: a lanterna do alto à esquerda encostava no
  cabelo, e um recorte cortaria a cabeça ou a mão estendida. Ela foi removida
  por preenchimento local a partir do fundo azul, com máscara que preserva os
  fios de cabelo, grão leve e bordas suavizadas. Ressalva: os reflexos quentes
  no lado esquerdo do cabelo continuam, agora lidos como luz ambiente.

### Textos alternativos

O retrato aberto tem nome acessível descritivo em português. O avatar
compacto é decorativo (`alt=""` e `aria-hidden`), porque aparece ao lado do
nome "Kairya" ou dentro do botão "Falar com a Kairya": um texto alternativo
repetiria o nome e alteraria o nome acessível do botão. Os cenários são fundo
CSS do hero, sob o título da área; o gradiente escuro por cima garante
contraste de pelo menos 4,5:1 no pior caso (conta no `docs/HANDOFF.md`). As versões em inglês entram com a i18n
(Fase 3).

## Prompts

Prompts exatos de cada tarefa usada. O campo de negativos não existe no
endpoint; eles vão na linha "Avoid:".

### `kairya/portrait.webp` e `kairya/avatar.webp`

```text
Painterly semi-realistic illustration, warm lantern rim light, deep slate-blue night palette with amber and jade accents, calm, original character. Waist-up portrait, 3:4. A woman around thirty-one, deep brown skin, dark brown wavy shoulder-length hair with a side fringe held by a jade hair clip, dark brown eyes. Short slate-blue kimono-style training jacket, closed with a crossed collar, over a dark navy high-neck inner layer, a small matte gold-thread embroidered lantern motif on the left chest, amber fabric sash tied at the waist, plain off-white cloth wraps on both wrists. Background: softly blurred library-dojo with paper lanterns and tall bookshelves at dusk.
Expression and pose: Facing forward, relaxed shoulders, hands joined in front of the sash. Direct, calm gaze, a gentle closed-lip half smile.
Avoid: long straight black hair, white tank top, suspenders, red eyes, leather gloves, weapons, text, logo, watermark.
Original design, not based on any existing character or franchise.
```

### `kairya/neutral.webp`

```text
Keep the small embroidered lantern on the left chest in the same place and shape as in the reference, but unlit: only thin matte gold outline stitches on the blue fabric, its inside filled with the same slate-blue fabric, no orange, no glow.
Change nothing else: same woman, face, expression, pose, hands, hair, jade hair clip, outfit, colors, lighting, background and framing.
Avoid: long straight black hair, white tank top, suspenders, red eyes, leather gloves, glowing embroidery, weapons, text, logo, watermark.
Original design, not based on any existing character or franchise.
```

### `kairya/listening.webp`

```text
Edit the reference image. Keep the same woman and scene: deep brown skin, same face, dark brown eyes, dark brown wavy shoulder-length hair with a side fringe held by the jade hair clip, short-sleeved slate-blue kimono-style training jacket closed with a crossed collar, dark navy high-neck inner layer, amber fabric sash tied at the waist, plain off-white cloth wraps on both forearms. Same painterly semi-realistic style, warm lantern rim light, softly blurred library-dojo with paper lanterns and tall bookshelves at dusk, waist-up portrait, 3:4. The small golden lantern on the left chest is flat matte thread embroidery with no glow.
Expression and pose: Head tilted slightly, body leaning a little forward, one hand resting on her chin. Eyes open, relaxed eyebrows.
Avoid: long straight black hair, white tank top, suspenders, red eyes, leather gloves, glowing embroidery, weapons, text, logo, watermark.
Original design, not based on any existing character or franchise.
```

### `kairya/thinking.webp`

```text
Keep the small embroidered lantern on the left chest in the same place and shape as in the reference, but unlit: only thin matte gold outline stitches on the blue fabric, its inside filled with the same slate-blue fabric, no orange, no glow.
Keep the same woman and scene: deep brown skin, same face, dark brown eyes, dark brown wavy shoulder-length hair with a side fringe held by the jade hair clip, short-sleeved slate-blue kimono-style jacket, crossed collar, dark navy high-neck inner layer, amber sash, off-white cloth wraps on both forearms, same painterly style, lighting, library-dojo background and waist-up 3:4 framing.
Expression and pose: Eyes looking up and to the side, chin slightly raised. Her left hand is raised and two fingers touch the green jade hair clip. Mouth closed, smooth forehead.
Avoid: long straight black hair, white tank top, suspenders, red eyes, leather gloves, glowing embroidery, weapons, text, logo, watermark.
Original design, not based on any existing character or franchise.
```

### `kairya/celebrating.webp`

```text
Edit the reference image. Keep the same woman and scene: deep brown skin, same face, dark brown eyes, dark brown wavy shoulder-length hair with a side fringe held by the jade hair clip, short-sleeved slate-blue kimono-style training jacket closed with a crossed collar, dark navy high-neck inner layer, amber fabric sash tied at the waist, plain off-white cloth wraps on both forearms. Same painterly semi-realistic style, warm lantern rim light, softly blurred library-dojo with paper lanterns and tall bookshelves at dusk, waist-up portrait, 3:4. The small golden lantern on the left chest is flat matte thread embroidery with no glow.
Expression and pose: Closed fist raised to shoulder height, not striking. Open smile, eyes crinkled with joy. Stronger amber light from the paper lanterns in the background.
Avoid: long straight black hair, white tank top, suspenders, red eyes, leather gloves, glowing embroidery, weapons, text, logo, watermark.
Original design, not based on any existing character or franchise.
```

### `kairya/concerned.webp`

```text
Keep the small embroidered lantern on the left chest exactly as in the reference: unlit, only thin matte gold outline stitches, its inside the same slate-blue fabric, no glow.
Keep everything else exactly as in the reference: same woman, deep brown skin, dark brown eyes, hair, jade hair clip, outfit, cloth wraps, pose, both arms, the open palm-up hand offering help, lighting, background and framing.
Change only the facial expression and head: head tilted slightly, eyebrows slightly raised in the center, mouth neutral and closed with no smile, attentive and gentle gaze toward the viewer. Warm, caring concern, without sadness or fear.
Avoid: long straight black hair, white tank top, suspenders, red eyes, leather gloves, glowing embroidery, weapons, text, logo, watermark.
Original design, not based on any existing character or franchise.
```

### `scenes/hq.webp`

```text
Painterly semi-realistic illustration, warm lantern rim light, deep slate-blue night palette with amber and jade accents, calm.
Wide landscape environment, 16:9, no people. Interior of a library-dojo in an old stone warehouse near the harbor at dusk: tatami mats on the training floor in the center, wooden galleries around it with floor-to-ceiling bookshelves full of books, warm amber paper lanterns lit and hanging from the wooden beams, tall windows showing the slate-blue evening sky over the port. Quiet and welcoming, soft depth of field, open uncluttered space in the center of the frame.
Avoid: people, human figures, characters, weapons, text, letters, signs, logo, watermark.
Original design, not based on any existing character or franchise.
```

### `scenes/campaigns.webp`

```text
Painterly semi-realistic illustration, warm lantern rim light, deep slate-blue night palette with amber and jade accents, calm.
Wide landscape environment, 16:9, no people. At night, a winding stone trail lined with small lit amber paper lanterns climbs a grassy hillside, the lantern lights forming a path up the slope. Far below in the background, a quiet port city by the sea: calm slate-blue water, soft harbor lights and a few distant boats under a deep blue night sky with faint stars. Calm, inviting sense of a journey ahead.
Avoid: people, human figures, characters, weapons, text, letters, signs, logo, watermark.
Original design, not based on any existing character or franchise.
```

### `empty/missions.webp`

```text
Painterly semi-realistic illustration, warm lantern rim light, deep slate-blue night palette with amber and jade accents, calm.
Simple spot illustration, square, one clear subject centered with plenty of empty space and a plain soft background, bold readable shapes that stay clear at small size, no people. An empty wooden study desk with nothing on it except one small paper lantern that is switched off: no flame and no light inside, its paper cool grey-blue in shadow. The only warm light is a thin amber rim along the desk edge from off-screen. Quiet slate-blue room, subtle jade accent.
Avoid: lit lantern, glowing lantern, candle flame, people, human figures, characters, text, letters, logo, watermark.
Original design, not based on any existing character or franchise.
```

### `empty/plan.webp`

```text
Painterly semi-realistic illustration, warm lantern rim light, deep slate-blue night palette with amber and jade accents, calm.
Simple spot illustration, square, one clear subject centered with plenty of empty space and a plain soft background, bold readable shapes that stay clear at small size, no people. A blank unrolled paper scroll lying flat on a low wooden table, completely empty with no marks or writing, a calligraphy brush resting beside it, soft slate-blue surroundings with a small jade accent.
Avoid: people, human figures, characters, writing on the scroll, text, letters, symbols, logo, watermark.
Original design, not based on any existing character or franchise.
```

### `empty/campaign-new.webp`

```text
Painterly semi-realistic illustration, warm lantern rim light, deep slate-blue night palette with amber and jade accents, calm.
Simple spot illustration, square, one clear subject centered with plenty of empty space and a plain soft background, bold readable shapes that stay clear at small size, no people. The beginning of a stone trail on a hillside at night: the first small paper lantern on a short wooden post beside the path is still unlit, dark and waiting, the trail ahead fading gently into slate-blue darkness.
Avoid: people, human figures, characters, weapons, text, letters, signs, logo, watermark.
Original design, not based on any existing character or franchise.
```

### `trial/weekly-trial.webp`

```text
Keep the small embroidered lantern on the left chest unlit: only thin matte gold outline stitches, its inside the same slate-blue fabric, no glow.
Keep the same woman: deep brown skin, same face, dark brown eyes, dark brown wavy shoulder-length hair with side fringe held by the jade hair clip, same short-sleeved slate-blue jacket, navy inner layer, amber sash, off-white forearm wraps.
Painterly semi-realistic illustration, warm lantern rim light, deep slate-blue night palette with amber and jade accents, calm. Waist-up, 3:4.
Scene and pose: one large lit paper lantern hangs behind her in the library-dojo, its warm amber light around her. Firm, grounded stance, shoulders back, one hand open toward the viewer, inviting. Confident, encouraging gaze, small determined smile.
Avoid: long straight black hair, white tank top, suspenders, red eyes, leather gloves, glowing embroidery, weapons, fighting stance, text, logo, watermark.
Original design, not based on any existing character or franchise.
```

## Arte aposentada

Os arquivos abaixo saíram de `frontend/public/art/` na Fase 7. Nenhum
código, teste ou documento corrente depende deles; continuam no histórico do
git.

| Arquivo | Estado | Substituto |
|---|---|---|
| `kairya-mentor.webp` | placeholder aposentado | `kairya/portrait.webp` |
| `kairya-avatar.webp` | placeholder aposentado | `kairya/avatar.webp` |
| `medieval-library.webp` | aposentado | `scenes/hq.webp` |
| `medieval-citadel.webp` | aposentado | `scenes/campaigns.webp` |

Os quatro vieram da ferramenta integrada image_gen, em 2026-10-05; os dois
retratos eram placeholders até a arte própria da Kairya. A procedência
histórica, com prompts e hashes dos originais, está no
[registro anterior](https://github.com/BipoXDXD/KairyaQuest/blob/49c79af13557ded9ef37332084b060d9c6220dae/docs/ART.md).

## Fontes

Tipografia do design system, servida localmente de `frontend/public/fonts/`
(sem CDN, sem requisição a terceiro). Declaração em
`frontend/src/styles/fonts.css`; tokens `--font-display` e `--font-body` em
`frontend/src/styles/tokens.css`.

| Família | Uso | Pesos | Autor | Licença |
|---|---|---|---|---|
| Alegreya | títulos (`font-display`) | 500 a 700 (arquivo variável) | Juan Pablo del Peral, Huerta Tipográfica | SIL OFL 1.1 (`OFL-Alegreya.txt`) |
| Alegreya Sans | texto (`font-body`) | 400 e 700 (arquivos estáticos) | Juan Pablo del Peral, Huerta Tipográfica | SIL OFL 1.1 (`OFL-AlegreyaSans.txt`) |

Procedência: CSS da Google Fonts CSS API v2,
`https://fonts.googleapis.com/css2?family=Alegreya:wght@500;700&family=Alegreya+Sans:wght@400;700&display=swap`,
pedido com User-Agent de navegador moderno em 2026-11-10. Só os blocos
`latin` e `latin-ext` foram usados; os woff2 vieram das URLs
`fonts.gstatic.com` desses blocos (Alegreya `v41`, Alegreya Sans `v28`), com
o mesmo `unicode-range`. Na Alegreya, 500 e 700 apontavam para a mesma URL
(fonte variável), por isso há um arquivo por subset. As licenças vieram de
`https://raw.githubusercontent.com/google/fonts/main/ofl/alegreya/OFL.txt` e
`.../ofl/alegreyasans/OFL.txt`. Cada woff2 foi conferido pela assinatura
`wOF2` antes de entrar no repositório.

| Arquivo (`frontend/public/fonts/`) | Bytes | SHA-256 |
|---|---:|---|
| `alegreya-latin.woff2` | 43.420 | `34d902fd33b23ea3205daf8dd7696e6c49b50165e70165655e361f243dd3e083` |
| `alegreya-latin-ext.woff2` | 38.028 | `aab1eaa177d60b215b4dfa6cbe75316c2b8d27fd785f9c3604a58b3c0166aac9` |
| `alegreya-sans-400-latin.woff2` | 17.136 | `624ea7e85a53f6bcb15f862179386546d3182ec8edde32c512662d31e1bfde18` |
| `alegreya-sans-400-latin-ext.woff2` | 15.568 | `d8bf25eb11d09b785172d8f207dfd53f36ec969aa54c34d34aacc0c807e42be7` |
| `alegreya-sans-700-latin.woff2` | 17.172 | `1a2f3006ecc704345bd35be43341c07b2bc33ff25955d70f47980cffb3099c48` |
| `alegreya-sans-700-latin-ext.woff2` | 15.572 | `5c1cb227aa5a8f3ddfdb3164a3eb9092e7e041bd8d8ab8374f8dd6586d77545f` |
| `OFL-Alegreya.txt` | 4.395 | `f6f60d5d4cf4f4b1fc4e41353c897a2f5a16e6396c0cd8fa8bdfd2f4586a9a68` |
| `OFL-AlegreyaSans.txt` | 4.405 | `0677891e6a143f297350d260ad766ad33bfc18ed5fa4f213acf648d6b597ec1a` |
