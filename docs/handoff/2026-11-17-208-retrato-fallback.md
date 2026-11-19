# #208 · Fallback do retrato da Kairya

Base `0adeab9a2306b39c76a3b9c8b79e7feb861d376a`.
O retrato de expressão podia ficar quebrado em cena ou na miniatura
quando o arquivo daquela expressão falhava. O fallback usa o avatar
compacto já versionado, com suas dimensões reais. A cena identifica
a Kairya pelo nome, e a miniatura mantém texto alternativo vazio.

O tratamento vale para a origem que falhou. Uma nova expressão pode
carregar a própria arte, e uma falha do avatar encerra a tentativa.
Os testes cobrem as duas apresentações, as dimensões e o texto alternativo
do avatar, a falha do fallback e a próxima expressão.

O Vitest dirigido a `KairyaFace.test.tsx`, `KairyaBubble.test.tsx` e
`TutorPanel.test.tsx` aprovou os 147 testes, com um worker e zero testes
pulados. O pre-commit executa o gate integral na reserva de commit.
