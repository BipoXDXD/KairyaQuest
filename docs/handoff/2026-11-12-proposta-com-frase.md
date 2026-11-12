# Proposta sempre vem com uma frase — 2026-11-12

Branch `wt/proposta-com-frase`, revisão-base `913a669`.

## Objetivo

Medido com a API real: ao pedir "cria uma missão", a tutora chamava
`create_mission` e devolvia texto vazio. A UI mostrava só o cartão, com a bolha
da Kairya sem texto, e o leitor de tela não lia nada de quem propôs.

## Decisão

1. **Prompt (causa).** As seções `## 4.` (Missões) e `## 5.` (Reagendar) das
   duas personas mandam escrever, na mesma resposta, uma frase curta com o
   porquê da proposta, no tom da persona, e nunca deixar o texto vazio. Os
   cabeçalhos continuam iguais nos dois idiomas.
2. **Defesa no frontend (sintoma).** Se a mensagem da Kairya tem proposta
   (`create_mission` ou `reschedule_mission`) e o texto é vazio ou só espaços,
   a bolha mostra uma frase padrão do catálogo i18n
   (`tutoring.proposal.line.create` e `tutoring.proposal.line.reschedule`, PT e
   EN). A decisão mora em `TutorConversation.tsx` (`proposalLine`), que desenha
   tanto a resposta ao vivo (`done`) quanto o histórico recarregado: a frase
   vem do render, não do estado, então a bolha vazia não reaparece ao
   recarregar. Um `kind` desconhecido não ganha frase (o cartão já avisa).
   Nenhuma mudança no back; nada é persistido.

## Alterações

- `src/focusquest/modules/tutoring/prompts/persona.{pt-BR,en}.md`
- `frontend/src/features/tutoring/TutorConversation.tsx`
- `frontend/src/shared/i18n/messages/{pt-BR,en}.ts` (duas chaves novas)
- Testes: `frontend/src/features/tutoring/TutorPanel.test.tsx` (S1 a S5),
  `tests/unit/test_prompts_concordancia.py` (`test_a_proposta_sempre_vem_com_uma_frase`)

## Caso do "test set" dos prompts

O repositório não tem test set nem changelog de prompts. O caso ficou no padrão
existente, o teste de concordância entre idiomas: afirma, por ferramenta e por
idioma, que a seção traz a instrução. É um teste de presença do texto; não mede
o comportamento do modelo (isso exige a API real, fora do escopo deste PR).

## Pendências

- `P-proposta-com-frase-1`: reconferir com a API real, depois do deploy, que a
  Kairya passou a escrever a frase; a frase padrão é só a rede de segurança.

Nenhuma dependência nova.
