/**
 * O catalogo de referencia: define as chaves (`MessageKey`). Os textos PT sao
 * os da interface atual, sem reescrita.
 *
 * Convencoes (valem para todas as areas):
 * - chaves planas, com ponto: `<area>.<componente>.<papel>`;
 * - plural em chaves irmas `….one` e `….other` (e `….zero` quando o texto
 *   do zero difere), escolhidas por `plural`;
 * - interpolacao `{nome}`; numero e data chegam ja formatados por `Intl.*`.
 */
export const ptBR = {
  'shell.locale.label': 'Idioma',
  'shell.locale.ptBR': 'PT, Português (Brasil)',
  'shell.locale.en': 'EN, English',
  'shell.locale.saveFailed':
    'Não foi possível salvar o idioma {language}. A conexão falhou. Tente de novo.',
  // Falas gravadas da Kairya (F6): fonte da legenda e do roteiro da F8.
  // Sem número, nome nem placeholder: o específico vai só na legenda.
  'kairya.lines.greet_morning_1': 'Bom dia. Qual é o primeiro passo de hoje?',
  'kairya.lines.greet_morning_2': 'Bom dia. Começa pelo mais fácil e aquece.',
  'kairya.lines.greet_afternoon_1': 'Boa tarde. Bom te ver. O que cabe agora?',
  'kairya.lines.greet_afternoon_2': 'Boa tarde. Um bloco curto já conta como treino.',
  'kairya.lines.greet_evening_1': 'Boa noite. Bom te ver. Qual é o passo de hoje?',
  'kairya.lines.greet_evening_2': 'Boa noite. Pouco tempo? Escolhe uma coisa só.',
  'kairya.lines.mission_done_1': 'Feito. Isso é treino de verdade.',
  'kairya.lines.mission_done_2': 'Mais um passo dado. Treino bem feito.',
  'kairya.lines.mission_done_3': 'Concluído. Respira e escolhe o próximo.',
  'kairya.lines.mission_done_4': 'Isso. Constância se constrói assim.',
  'kairya.lines.weekly_trial_done_1': 'Prova da semana vencida. Você treinou para isso.',
  'kairya.lines.weekly_trial_done_2': 'Desafio maior concluído. Foi a semana inteira de treino.',
  'kairya.lines.level_up_1': 'Você construiu isso, dia após dia.',
  'kairya.lines.level_up_2': 'Subiu de nível. A base ficou mais forte.',
  'kairya.lines.level_up_3': 'Nível novo. Foi treino, não sorte.',
  'kairya.lines.achievement_1': 'Mais uma marca no caminho. Ela é sua.',
  'kairya.lines.achievement_2': 'Conquista nova. Ela conta o que você fez.',
  'kairya.lines.achievement_3': 'Isso merece registro. Você fez acontecer.',
  'kairya.lines.eval_meets_1': 'Atende. Pode seguir para o próximo passo.',
  'kairya.lines.eval_meets_2': 'Atende. A evidência mostra o que você aprendeu.',
  'kairya.lines.eval_partial_1': 'Quase lá. Veja o que falta e ajuste.',
  'kairya.lines.eval_partial_2': 'Tem base boa aqui. Falta um pedaço; vamos completar?',
  'kairya.lines.eval_not_meets_1': 'Ainda não atende. Vamos olhar juntos o que falta?',
  'kairya.lines.eval_not_meets_2': 'Ainda não. Começa pelo ponto que a avaliação apontou.',
  'kairya.lines.streak_kept_1': 'Mais um dia de treino. É assim que se constrói.',
  'kairya.lines.streak_kept_2': 'Treino do dia feito. O ritmo está aparecendo.',
  'kairya.lines.comeback_1': 'A sequência zerou. O que você aprendeu, não. Vamos de novo hoje?',
  'kairya.lines.comeback_2': 'Bom te ver de volta. Um passo pequeno hoje recomeça.',
  'kairya.lines.week_plan_created_1': 'Plano feito. Agora é um dia de cada vez.',
  'kairya.lines.week_plan_created_2': 'Semana montada. Começa pelo treino de hoje.',
  'kairya.lines.proposal_accepted_1': 'Combinado. Está na sua lista.',
  'kairya.lines.proposal_accepted_2': 'Acordo feito. Começa por ela quando quiser.',
  'kairya.lines.tutor_offline_1': 'Perdi a conexão. Vamos tentar de novo daqui a pouco?',
  'kairya.lines.tutor_offline_2': 'Não consegui responder agora. Tenta de novo em instantes.',
  'kairya.lines.farewell_1': 'Bom treino hoje. Descansar também é parte dele.',
  'kairya.lines.farewell_2': 'Por hoje está bom. Amanhã a gente continua.',
} as const
