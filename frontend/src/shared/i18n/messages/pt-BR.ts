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

  'shell.nav.label': 'Áreas',
  'shell.nav.caption': 'Explorar',
  'shell.brand.name': 'KairyaQuest',
  'shell.brand.tagline': 'Sua jornada de estudos',
  'shell.area.headquarters': 'Quartel-General',
  'shell.area.campaigns': 'Campanhas',

  'headquarters.header.eyebrow': 'Biblioteca do aventureiro',
  'headquarters.header.title': 'Quartel-General — seu painel de estudos',
  'headquarters.header.subtitle': 'O que está em aberto, com prazo e recompensa.',

  'shared.apiError.network.message': 'Não foi possível falar com o servidor.',
  'shared.apiError.network.recovery': 'Confira a conexão e tente de novo.',
  'shared.apiError.timeout.message': 'O servidor demorou demais para responder.',
  'shared.apiError.timeout.recovery': 'Tente de novo em instantes.',
  'shared.apiError.http.message': 'O servidor não conseguiu atender o pedido.',
  'shared.apiError.http.recovery': 'Tente de novo em instantes.',
  'shared.apiError.format.message': 'A resposta chegou num formato inesperado.',
  'shared.apiError.format.recovery': 'Tente de novo.',
  'shared.apiError.interrupted.message': 'A resposta foi interrompida no caminho.',
  'shared.apiError.interrupted.recovery': 'Tente de novo.',

  'missions.state.pending': 'Pendente',
  'missions.state.inProgress': 'Em andamento',
  'missions.state.completed': 'Concluída',
  'missions.rescheduleReason.difficulty': 'Dificuldade',
  'missions.rescheduleReason.lackOfTime': 'Falta de tempo',
  'missions.rescheduleReason.priorityChange': 'Mudança de prioridade',

  'missions.failure.refresh': 'Atualize para ver o estado atual.',
  'missions.failure.tryAgain': 'Tente de novo.',
  'missions.failure.notAvailable': 'Esta missão não está mais disponível.',
  'missions.failure.reusedOperation': 'Não foi possível registrar esta tentativa.',

  'missions.completionFailure.notFound.message':
    'Esta missão não está mais no quadro. Ela pode ter sido removida.',
  'missions.completionFailure.notFound.recovery': 'Atualize o quadro para ver as missões atuais.',
  'missions.completionFailure.alreadyCompleted.message': 'Esta missão já estava concluída.',
  'missions.completionFailure.alreadyCompleted.recovery':
    'Atualize o quadro para ver o estado atual.',
  'missions.completionFailure.expired.message':
    'O prazo desta missão já terminou e ela não pode mais ser concluída.',
  'missions.completionFailure.unconfirmed.message': 'Não foi possível confirmar a conclusão.',
  'missions.completionFailure.unconfirmed.recovery':
    'Tentar de novo é seguro: a missão não será concluída duas vezes.',
  'missions.completionFailure.unconfirmed.timeout':
    'Não foi possível concluir a missão: o servidor demorou demais para responder.',
  'missions.completionFailure.unconfirmed.network':
    'Não foi possível concluir a missão: sem conexão com o servidor.',
  'missions.completionFailure.evidenceRejected.message': 'A evidência não foi aceita.',
  'missions.completionFailure.evidenceRejected.recovery': 'Revise o texto e o link.',

  'missions.startFailure.alreadyStarted.message': 'Esta missão já foi iniciada ou concluída.',
  'missions.startFailure.expired.message':
    'O prazo desta missão já terminou e ela não pode mais ser iniciada.',
  'missions.startFailure.unconfirmed.message': 'Não foi possível confirmar o início.',
  'missions.startFailure.unconfirmed.recovery':
    'Tentar de novo é seguro: a missão não será iniciada duas vezes.',
  'missions.startFailure.unconfirmed.timeout':
    'Não foi possível iniciar a missão: o servidor demorou demais para responder.',
  'missions.startFailure.unconfirmed.network':
    'Não foi possível iniciar a missão: sem conexão com o servidor.',

  'missions.rescheduleFailure.deadlinePassed.message': 'O novo prazo precisa estar no futuro.',
  'missions.rescheduleFailure.deadlinePassed.recovery': 'Escolha uma data e um horário futuros.',
  'missions.rescheduleFailure.tooFar.message':
    'O novo prazo pode ser no máximo 365 dias a partir de agora.',
  'missions.rescheduleFailure.tooFar.recovery': 'Escolha uma data mais próxima.',
  'missions.rescheduleFailure.unchanged.message': 'O novo prazo é igual ao atual.',
  'missions.rescheduleFailure.unchanged.recovery': 'Escolha outro horário.',
  'missions.rescheduleFailure.alreadyCompleted.message':
    'Esta missão já foi concluída e não pode ser reagendada.',
  'missions.rescheduleFailure.derivedDeadline.message':
    'O prazo desta missão vem do plano da semana e não pode ser reagendado.',
  'missions.rescheduleFailure.unconfirmed.message': 'Não foi possível confirmar o reagendamento.',
  'missions.rescheduleFailure.unconfirmed.recovery':
    'Tentar de novo é seguro: o prazo não mudará duas vezes.',
  'missions.rescheduleFailure.unconfirmed.timeout':
    'Não foi possível reagendar a missão: o servidor demorou demais para responder.',
  'missions.rescheduleFailure.unconfirmed.network':
    'Não foi possível reagendar a missão: sem conexão com o servidor.',
  'missions.rescheduleFailure.notAccepted.message': 'O novo prazo não foi aceito.',
  'missions.rescheduleFailure.notAccepted.recovery': 'Revise a data e o motivo.',

  'missions.evaluationFailure.noEvidence.message':
    'Esta missão não tem evidência para a Kairya avaliar.',
  'missions.evaluationFailure.inProgress.message': 'A Kairya já está avaliando esta entrega.',
  'missions.evaluationFailure.inProgress.recovery': 'Tente de novo em instantes.',
  'missions.evaluationFailure.providerNotConfigured.message':
    'A Kairya está fora do ar: falta configurar o provedor.',
  'missions.evaluationFailure.providerNotConfigured.recovery':
    'Configure o provedor e tente de novo.',
  'missions.evaluationFailure.providerUnavailable.message': 'A Kairya não conseguiu avaliar agora.',
  'missions.evaluationFailure.timeout.message': 'A avaliação demorou demais.',
  'missions.evaluationFailure.invalidEvaluation.message': 'A Kairya respondeu fora da rubrica.',
  'missions.evaluationFailure.generic.message': 'Não foi possível pedir a avaliação.',
  'missions.evaluationFailure.generic.recovery':
    'Tentar de novo é seguro: o bônus nunca é concedido duas vezes.',
  'missions.evaluationFailure.generic.timeout':
    'Não foi possível pedir a avaliação: o servidor demorou demais para responder.',
  'missions.evaluationFailure.generic.network':
    'Não foi possível pedir a avaliação: sem conexão com o servidor.',

  'tutoring.messageFailure.safeRetry': 'Tentar de novo é seguro: a pergunta não será duplicada.',
  'tutoring.messageFailure.tryAgain': 'Tente de novo.',
  'tutoring.messageFailure.unknownResult.message':
    'Não deu para saber se a resposta chegou inteira. Ela foi interrompida no caminho.',
  'tutoring.messageFailure.providerNotConfigured.message':
    'A Kairya está fora do ar: falta configurar o provedor.',
  'tutoring.messageFailure.providerNotConfigured.recovery': 'Configure o provedor e tente de novo.',
  'tutoring.messageFailure.inProgress.message':
    'A Kairya ainda está respondendo a pergunta anterior.',
  'tutoring.messageFailure.inProgress.recovery': 'Espere um instante e tente de novo.',
  'tutoring.messageFailure.reusedOperation.message': 'Não foi possível registrar esta pergunta.',
  'tutoring.messageFailure.dailyLimit.message': 'Você chegou ao limite de conversas de hoje.',
  'tutoring.messageFailure.dailyLimit.backAtMidnight': 'A Kairya volta à meia-noite.',
  'tutoring.messageFailure.dailyLimit.backTomorrow': 'Tente de novo amanhã.',
  'tutoring.messageFailure.providerUnavailable.message': 'A Kairya não conseguiu responder agora.',
  'tutoring.messageFailure.timeout.message': 'A resposta da Kairya demorou demais.',
  'tutoring.messageFailure.invalidProposal.message':
    'A Kairya tentou propor uma missão que não passou na validação.',
  'tutoring.messageFailure.invalidProposal.recovery': 'Tente de novo ou peça de outro jeito.',
  'tutoring.messageFailure.refused.message':
    'A Kairya não pôde responder a esta pergunta. O conteúdo foi recusado.',
  'tutoring.messageFailure.refused.recovery': 'Pergunte de outro jeito.',
  'tutoring.messageFailure.rejectedBody.message': 'A pergunta não foi aceita.',
  'tutoring.messageFailure.rejectedBody.recovery': 'Confira o texto e envie de novo.',

  'tutoring.actionFailure.askNewProposal': 'Peça à Kairya uma nova proposta.',
  'tutoring.actionFailure.refreshConversation': 'Atualize a conversa para ver o estado atual.',
  'tutoring.actionFailure.reusedOperation.message': 'Não foi possível registrar esta tentativa.',
  'tutoring.actionFailure.reusedOperation.recovery': 'Tente de novo.',
  'tutoring.actionFailure.alreadyDecided.message': 'Esta proposta já foi decidida.',
  'tutoring.actionFailure.notFound.message': 'Esta proposta não existe mais.',
  'tutoring.actionFailure.expired.message': 'O prazo desta proposta já passou.',
  'tutoring.actionFailure.rescheduleInvalid.message':
    'A missão mudou desde a proposta e não pôde ser reagendada.',
  'tutoring.actionFailure.estimateOutOfBounds.message':
    'A estimativa desta proposta precisa ficar entre 1 e 1440 minutos.',
  'tutoring.actionFailure.deadlineOutOfBounds.message':
    'O prazo desta proposta passa de 365 dias a partir de agora.',
  'tutoring.actionFailure.unconfirmedCreate.message': 'Não foi possível confirmar a missão.',
  'tutoring.actionFailure.unconfirmedCreate.recovery':
    'Tentar de novo é seguro: a missão não será criada duas vezes.',
  'tutoring.actionFailure.unconfirmedCreate.timeout':
    'Não foi possível confirmar a missão: o servidor demorou demais para responder.',
  'tutoring.actionFailure.unconfirmedCreate.network':
    'Não foi possível confirmar a missão: sem conexão com o servidor.',
  'tutoring.actionFailure.unconfirmedReschedule.message':
    'Não foi possível confirmar o reagendamento.',
  'tutoring.actionFailure.unconfirmedReschedule.recovery':
    'Tentar de novo é seguro: o prazo não mudará duas vezes.',
  'tutoring.actionFailure.unconfirmedReschedule.timeout':
    'Não foi possível confirmar o reagendamento: o servidor demorou demais para responder.',
  'tutoring.actionFailure.unconfirmedReschedule.network':
    'Não foi possível confirmar o reagendamento: sem conexão com o servidor.',
  'tutoring.actionFailure.unconfirmedReject.message': 'Não foi possível recusar a proposta.',
  'tutoring.actionFailure.unconfirmedReject.recovery': 'Tentar de novo é seguro.',
  'tutoring.actionFailure.unconfirmedReject.timeout':
    'Não foi possível recusar a proposta: o servidor demorou demais para responder.',
  'tutoring.actionFailure.unconfirmedReject.network':
    'Não foi possível recusar a proposta: sem conexão com o servidor.',
  'tutoring.actionFailure.failed.message': 'Esta proposta não pôde ser executada.',
} as const
