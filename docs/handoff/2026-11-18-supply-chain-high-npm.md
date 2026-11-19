# Atualizações npm e backport verificado do Picomatch

Refs #208. Revisão-base `0adeab9a2306b39c76a3b9c8b79e7feb861d376a`.

O lock atualiza source-map-js para 1.2.2, undici para 8.12.2,
Vite para 8.3.3 e zod para 4.6.6. Vite requer Rolldown 1.2.11,
seus bindings e @oxc-project/types 0.151.0. Na árvore que contém
apenas essas atualizações, a auditoria retirou 16 advisories
distintos, incluindo sete altos. A instalação dos 263 pacotes,
o check-web e o build passaram nessa árvore, com 2.875 testes
Vitest, zero pulados e 100% nas quatro métricas.

O tarball do Picomatch preserva a versão npm 4.0.7 e incorpora o
backport v4 verificado no Duora #595, para CVE-2026-112366. O
manifesto registra os hashes e a origem. Docker copia o único
tarball autorizado antes da instalação. O build recebe a configuração,
o HTML de entrada, as fontes e os arquivos públicos do frontend. O gate confere
a árvore do índice no hook e sua igualdade com o commit no CI. Valida
a resolução local no lock, todos os arquivos instalados e o que
Vite, Vitest, tinyglobby e fdir realmente resolvem antes dos testes.

O alvo `make check-supply-chain-npm` e seu job executam o Trivy
0.76.2 fixado por digest. Os relatórios bruto e final são
confrontados com a mesma base de dados. A declaração VEX se aplica
ao advisory e ao pacote cuja origem e bytes conferiram. Descobertas
altas ou críticas ativas bloqueiam o gate.

A validação integral da árvore combinada deve reconfirmar o
artefato instalado e os quatro consumidores. A revisão e os
recibos do PR registram o resultado desse gate e do CI.

[Backport de origem](https://github.com/BipoXDXD/duora/pull/595)
