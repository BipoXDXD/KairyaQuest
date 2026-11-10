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
