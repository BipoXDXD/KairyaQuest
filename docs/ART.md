# Arte do projeto e identidade Kairya

Os cenários e retratos atuais foram gerados pela ferramenta integrada
image_gen em 2026-10-05, sem extração de imagens de jogos. Os retratos são
placeholders visuais da versão anterior, ainda preservados até a entrega das
artes autorais de Kairya. Nenhuma nova imagem foi criada nesta renomeação.
A procedência e os hashes abaixo continuam referentes à geração anterior.

## Biblioteca
Wide cinematic environment illustration, semi-realistic high-end medieval fantasy game art, for a desktop learning RPG background banner. A peaceful stone citadel library and adventurers' study hall high in the mountains, vaulted gothic windows, dark walnut writing tables, parchment books, warm candlelight and brass lamps, distant forested valley and castle towers in the mist beyond the windows, dusk blue atmosphere contrasted with soft amber lights. Detailed believable stone wood and metal materials, elegant rich composition, strong atmospheric depth, quiet motivating scholarly mood. No people, no characters, no creatures, no lettering, no logo, no user interface, no watermark. Landscape very wide 16:9 composition, visual focal point architecture to the right, darker quieter empty space on left for interface overlay.

## Kairya — identidade e futuras artes autorais

Kairya é o nome da tutora e personagem do projeto. Os retratos atuais são
assets temporários da geração anterior; renomear os arquivos não altera seus
pixels nem os transforma nas novas artes de autoria do responsável. Eles
serão substituídos quando essas artes forem fornecidas.

O prompt histórico completo e a referência visual original permanecem
consultáveis no [registro anterior da geração](https://github.com/BipoXDXD/KairyaQuest/blob/49c79af13557ded9ef37332084b060d9c6220dae/docs/ART.md).

## Caminho da cidadela
A wide semi-realistic medieval fantasy environment illustration for the Campaigns header in a premium desktop study RPG. An old stone trail winding across green highlands toward a majestic fortified hilltop citadel, distant layered mountains, ancient arched bridge crossing a misty valley, small amber lanterns along the path, blue-hour sky with subtle sunrise golden light on the towers. Sophisticated believable architecture, lush natural materials and atmospheric depth, inviting journey of learning and progress, dignified and calm, consistent with a dark navy and muted bronze game UI. Wide panoramic landscape 16:9, horizon and citadel centered toward right half, left lower half quieter darker for heading overlay. No people, no text, no numbers, no logo, no interface, no watermark.


## Arquivos integrados

| Arquivo local | Dimensões | Bytes | Uso |
|---|---:|---:|---|
| `frontend/public/art/medieval-library.webp` | 1672×941 | 311.500 | Hero do Quartel-General |
| `frontend/public/art/medieval-citadel.webp` | 1672×941 | 302.826 | Hero de Campanhas |
| `frontend/public/art/kairya-mentor.webp` | 561×701 | 49.138 | Retrato aberto no desktop |
| `frontend/public/art/kairya-avatar.webp` | 128×160 | 5.144 | Avatar compacto e mobile |

Derivadas de entrega transcodificadas localmente com Canvas/Chromium, WebP
qualidade 0,88 e redução proporcional apenas no retrato. Não há nova geração,
recorte destrutivo ou alteração de identidade da arte. O retrato clássico
substitui o estudo medieval anterior, que não foi integrado. Dimensões
proporcionais são reservadas no HTML; a imagem é decorativa (`alt` vazio), sem
nome acessível ou interatividade.

Os quatro arquivos somam 668.608 bytes, redução de 90,4% em relação aos três
PNG originais (6.989.716 bytes). Cada área carrega seu cenário; o avatar de
5 KB evita baixar o retrato maior quando apenas o controle compacto aparece.
Sem fontes, downloads externos ou dependências adicionais: a fonte serifada
usa Georgia/Times New Roman do sistema.

Originais PNG preservados sem alteração fora de `public`, no ledger local
`.superpowers/sdd/desktop-medieval/art-originals/`. O manifesto de hashes
SHA-256 está no mesmo ledger em `art-manifest.json`. Para conferir procedência
sem depender da cópia local:

| Original PNG | SHA-256 |
|---|---|
| Biblioteca | `462659cfcbbe554e8af1a0006757331605b182cf700aeb1c7878c628580977d7` |
| Cidadela | `83cbf002615cb5ce677879582f98fdce93f313a243ead6ce6cdb61e6d2c6bd7f` |
| Retrato temporário da geração anterior | `0386ce391d50275f14eaebf335d0ff94f9970b45a8883d855acebb4fff2dba83` |

Status: revisão visual técnica no layout real aprovada nesta sessão com fixtures
locais: QG/Campanhas desktop, estados cheio/vazio, Kairya aberta/recolhida e
mobile; as duas capturas finais prioritárias e as duas geometrias curtas
confirmaram rosto/traje completo, primeira dobra e composer. Os hashes de
src/public/dist permaneceram estáveis durante as capturas. Essa validação não
é aprovação humana definitiva da arte nem certificação de contraste AA:
axe não calculou todos os contrastes sobre gradientes. O retrato não representa
disponibilidade, resposta ou emoção do provedor.
