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
  'shell.locale.ptBR.endonym': 'Português (Brasil)',
  'shell.locale.en.endonym': 'English',
  'shell.locale.saveFailed':
    'Não foi possível salvar o idioma {language}. O servidor não confirmou a troca. Tente de novo.',
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
  'kairya.face.neutral': 'Kairya, serena, com as mãos juntas à frente',
  'kairya.face.listening': 'Kairya ouve com a cabeça inclinada e a mão no queixo',
  'kairya.face.thinking': 'Kairya pensa, com os olhos para o alto e os dedos no grampo de jade',
  'kairya.face.celebrating': 'Kairya comemora, de punho erguido e sorriso aberto',
  'kairya.face.concerned': 'Kairya, atenta e preocupada, olha com carinho',
  'kairya.turntable.alt': 'A Kairya gira e comemora o seu novo nível',
  'kairya.turntable.placeholderAlt': 'A Kairya comemora o seu novo nível',
  'kairya.turntable.pause': 'Pausar a animação',
  'kairya.turntable.resume': 'Retomar a animação',
  'kairya.speaker': 'Kairya',
  'kairya.bubble.close': 'Fechar a fala da Kairya',

  'shell.nav.label': 'Áreas',
  'shell.brand.name': 'KairyaQuest',
  'shell.brand.tagline': 'Sua jornada de estudos',
  'shell.area.headquarters': 'Quartel-General',
  'shell.area.campaigns': 'Campanhas',

  'headquarters.header.title': 'Quartel-General — seu painel de estudos',
  'headquarters.header.subtitle': 'O que está em aberto, com prazo e recompensa.',

  'ui.dialog.cancel': 'Cancelar',
  'ui.language.short.ptBR': 'PT',
  'ui.language.short.en': 'EN',
  'ui.loading': 'Carregando…',
  'ui.sound.voice': 'Voz da Kairya',
  'ui.sound.sfx': 'Efeitos sonoros',

  'audio.controls.label': 'Som',
  'audio.invite.title': 'Quer ouvir a Kairya?',
  'audio.invite.body':
    'Voz e efeitos são opcionais e as legendas aparecem sempre. Dá para mudar no menu quando quiser.',
  'audio.invite.accept': 'Ligar voz e efeitos',
  'audio.invite.decline': 'Agora não',

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
  'shared.apiError.serverBusy.message': 'O servidor está ocupado agora.',
  'shared.apiError.serverBusy.recovery': 'Tente de novo em alguns segundos.',

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
    'Tentar de novo é seguro: nada será duplicado.',
  'missions.completionFailure.unconfirmed.timeout':
    'Não foi possível concluir a missão: o servidor demorou demais.',
  'missions.completionFailure.unconfirmed.network':
    'Não foi possível concluir a missão: sem conexão.',
  'missions.completionFailure.evidenceRejected.message': 'A evidência não foi aceita.',
  'missions.completionFailure.evidenceRejected.recovery': 'Revise o texto e o link.',

  'missions.startFailure.alreadyStarted.message': 'Esta missão já foi iniciada ou concluída.',
  'missions.startFailure.expired.message':
    'O prazo desta missão já terminou e ela não pode mais ser iniciada.',
  'missions.startFailure.unconfirmed.message': 'Não foi possível confirmar o início.',
  'missions.startFailure.unconfirmed.recovery': 'Tentar de novo é seguro: nada será duplicado.',
  'missions.startFailure.unconfirmed.timeout':
    'Não foi possível iniciar a missão: o servidor demorou demais.',
  'missions.startFailure.unconfirmed.network': 'Não foi possível iniciar a missão: sem conexão.',

  'missions.rescheduleFailure.deadlinePassed.message': 'O novo prazo precisa estar no futuro.',
  'missions.rescheduleFailure.deadlinePassed.recovery': 'Escolha uma data e um horário futuros.',
  'missions.rescheduleFailure.tooFar.message':
    'O novo prazo pode ser no máximo {days} dias a partir de agora.',
  'missions.rescheduleFailure.tooFar.recovery': 'Escolha uma data mais próxima.',
  'missions.rescheduleFailure.unchanged.message': 'O novo prazo é igual ao atual.',
  'missions.rescheduleFailure.unchanged.recovery': 'Escolha outro horário.',
  'missions.rescheduleFailure.alreadyCompleted.message':
    'Esta missão já foi concluída e não pode ser reagendada.',
  'missions.rescheduleFailure.derivedDeadline.message':
    'O prazo desta missão vem do plano da semana e não pode ser reagendado.',
  'missions.rescheduleFailure.unconfirmed.message': 'Não foi possível confirmar o reagendamento.',
  'missions.rescheduleFailure.unconfirmed.recovery':
    'Tentar de novo é seguro: nada será duplicado.',
  'missions.rescheduleFailure.unconfirmed.timeout':
    'Não foi possível reagendar a missão: o servidor demorou demais.',
  'missions.rescheduleFailure.unconfirmed.network':
    'Não foi possível reagendar a missão: sem conexão.',
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
  'missions.evaluationFailure.generic.recovery': 'Tentar de novo é seguro: nada será duplicado.',
  'missions.evaluationFailure.generic.timeout':
    'Não foi possível pedir a avaliação: o servidor demorou demais.',
  'missions.evaluationFailure.generic.network': 'Não foi possível pedir a avaliação: sem conexão.',

  'tutoring.name': 'Kairya',
  'tutoring.panel.subtitle': 'sua tutora',
  'tutoring.panel.collapse': 'Recolher o painel da Kairya',
  'tutoring.panel.expand': 'Abrir o painel da Kairya',
  'tutoring.panel.openSheet': 'Falar com a Kairya',
  'tutoring.panel.closeSheet': 'Fechar a conversa',

  'tutoring.conversation.region': 'Conversa com a Kairya',
  'tutoring.conversation.greeting':
    'Aqui você conversa com a Kairya, sua tutora. Peça uma missão de estudo ou tire uma dúvida.',
  'tutoring.history.loading': 'Carregando a conversa…',
  'tutoring.history.loadFailed': 'Não foi possível carregar a conversa.',
  'tutoring.status.loadFailed': 'Não foi possível verificar se a Kairya está disponível.',
  'tutoring.retryLoad': 'Tentar novamente',
  'tutoring.retry': 'Tentar de novo',
  'tutoring.writing': 'Kairya está escrevendo…',
  'tutoring.message.author.user': 'Você',
  'tutoring.message.mark.generating': 'Resposta em andamento',
  'tutoring.message.mark.interrupted': 'Resposta interrompida',
  'tutoring.message.mark.failed': 'Resposta com falha',
  'tutoring.message.fallback':
    'Respondida por um modelo substituto ({model}), porque o modelo principal não pôde responder a esta pergunta.',
  'tutoring.input.label': 'Sua mensagem para a Kairya',
  'tutoring.send.idle': 'Enviar',
  'tutoring.send.busy': 'Enviando…',
  'tutoring.counter.remaining.zero': 'Restam 0 caracteres.',
  'tutoring.counter.remaining.one': 'Resta 1 caractere.',
  'tutoring.counter.remaining.other': 'Restam {count} caracteres.',
  'tutoring.counter.over.one': 'Passou 1 caractere do limite de {max}.',
  'tutoring.counter.over.other': 'Passou {count} caracteres do limite de {max}.',

  'tutoring.answer.announce.complete': 'Kairya terminou de responder.',
  'tutoring.answer.announce.cut':
    'A resposta da Kairya ficou longa demais e foi cortada. Tente pedir por partes.',
  'tutoring.answer.announce.incomplete': 'A resposta da Kairya chegou incompleta.',
  'tutoring.answer.note.long':
    'A última resposta ficou longa demais e foi cortada. Tente pedir por partes, um tópico de cada vez. Tentar de novo refaz a mesma pergunta e pode cortar outra vez.',
  'tutoring.answer.note.refused':
    'A Kairya não pôde responder à última pergunta. Tentar de novo tende a dar o mesmo resultado: pergunte de outro jeito.',
  'tutoring.answer.note.general':
    'A última pergunta ficou sem resposta completa. Tentar de novo é seguro: a pergunta não será duplicada.',

  'tutoring.decision.confirm': 'Confirmar',
  'tutoring.decision.confirming': 'Confirmando…',
  'tutoring.decision.reject': 'Recusar',
  'tutoring.decision.rejecting': 'Recusando…',
  'tutoring.decision.refresh': 'Atualizar a conversa',

  'tutoring.proposal.title': 'Proposta de missão',
  'tutoring.proposal.target': 'a proposta: {instructions}',
  'tutoring.proposal.criterion': 'Critério de conclusão:',
  'tutoring.proposal.difficulty': 'Dificuldade',
  'tutoring.proposal.difficultyValue': '{value} de {max}',
  'tutoring.proposal.estimate': 'Estimativa',
  'tutoring.proposal.minutes': '{minutes} min',
  'tutoring.proposal.deadline': 'Prazo',
  'tutoring.proposal.created': 'Missão criada',
  'tutoring.proposal.rejected': 'Proposta recusada',
  'tutoring.proposal.boardLink': 'Ver no Quartel-General',
  'tutoring.proposal.unknown': 'Proposta que esta versão não sabe mostrar.',
  'tutoring.proposal.line.create': 'Deixei uma proposta de missão para você revisar.',
  'tutoring.proposal.line.reschedule': 'Deixei uma proposta de novo prazo para você revisar.',

  'tutoring.reschedule.title': 'Proposta de reagendamento',
  'tutoring.reschedule.target': 'o reagendamento: {instructions}',
  'tutoring.reschedule.previousDeadline': 'Prazo atual',
  'tutoring.reschedule.newDeadline': 'Prazo proposto',
  'tutoring.reschedule.reason': 'Motivo:',
  'tutoring.reschedule.done': 'Prazo reagendado',
  'missions.action.retry': 'Tentar de novo',
  'missions.action.retryLoad': 'Tentar novamente',
  'missions.reload.board': 'Atualizar o quadro',
  'missions.reload.today': 'Atualizar a missão de hoje',
  'missions.reload.lateDaily': 'Atualizar a diária de ontem',
  'missions.reload.special': 'Atualizar a missão especial',
  'missions.reload.waiting': 'Aguardando o pedido em andamento…',

  'missions.card.whichMission': 'a missão: {instructions}',
  'missions.card.completionCriterion': 'Critério de conclusão:',
  'missions.card.deadline': 'Prazo',
  'missions.card.difficulty': 'Dificuldade',
  'missions.card.difficultyValue': '{difficulty} de {max}',
  'missions.card.estimate': 'Estimativa',
  'missions.card.minutes': '{minutes} min',
  'missions.card.reward': 'Recompensa',
  'missions.card.xp': '{xp} XP',
  'missions.card.actualDuration': 'Duração real',
  'missions.card.startedAt': 'Iniciada em',
  'missions.card.complete': 'Concluir',
  'missions.card.completing': 'Concluindo…',
  'missions.card.completingStatus': 'Concluindo a missão…',
  'missions.card.completedStatus': 'Missão concluída.',
  'missions.card.blocked.fixLink': 'Corrija o link da evidência para concluir. {reason}',
  'missions.card.blocked.textMissing': 'Conte o que você fez para concluir com o link.',
  'missions.card.blocked.textTooLong':
    'Encurte o texto da evidência para concluir: o limite é de {max} caracteres.',
  'missions.card.start': 'Iniciar',
  'missions.card.starting': 'Iniciando…',
  'missions.card.startingStatus': 'Iniciando a missão…',
  'missions.card.startedStatus': 'Missão iniciada.',
  'missions.card.reschedulingStatus': 'Salvando o novo prazo…',
  'missions.card.rescheduledStatus': 'Prazo reagendado.',

  'missions.evidence.toggle': 'Entregar com evidência (opcional)',
  'missions.evidence.retryNotice':
    'A entrega anterior pode ter chegado. Tente de novo antes de editar a evidência.',
  'missions.evidence.textLabel': 'O que você fez',
  'missions.evidence.textMissing': 'Para entregar o link, conte também o que você fez.',
  'missions.evidence.linkLabel': 'Link (opcional)',
  'missions.evidence.linkError.format':
    'O link precisa começar com http:// ou https:// e não ter espaços.',
  'missions.evidence.linkError.tooLong': 'O link passa de {max} caracteres.',
  'missions.evidence.counter.remaining.zero': 'Restam 0 caracteres.',
  'missions.evidence.counter.remaining.one': 'Resta 1 caractere.',
  'missions.evidence.counter.remaining.other': 'Restam {count} caracteres.',
  'missions.evidence.counter.over.one': 'Passou 1 caractere do limite de {max}.',
  'missions.evidence.counter.over.other': 'Passou {count} caracteres do limite de {max}.',

  'missions.reward.xp': '+{xp} XP',
  'missions.reward.bonusXp': '+{xp} XP de bônus',
  'missions.reward.levelUp': 'Subiu para o nível {level}!',
  'missions.reward.achievement': 'Conquista: {title}',

  'missions.history.count.one': 'Reagendada 1 vez',
  'missions.history.count.other': 'Reagendada {count} vezes',
  'missions.history.title': 'Histórico de prazos',
  'missions.history.origin.user': 'por você',
  'missions.history.origin.kairya': 'proposto pela Kairya',

  'missions.reschedule.toggle': 'Reagendar prazo',
  'missions.reschedule.deadlineLabel': 'Novo prazo (horário de Brasília)',
  'missions.reschedule.reasonLegend': 'Por que reagendar?',
  'missions.reschedule.submit': 'Salvar novo prazo',
  'missions.reschedule.retryNotice':
    'O pedido anterior pode ter chegado. Sem mudar nada, “Tentar de novo” o reenvia com segurança.',
  'missions.reschedule.blocked.missingDeadline': 'Informe a data e a hora do novo prazo.',
  'missions.reschedule.blocked.nonexistentTime':
    'Esse horário não existe no horário de Brasília. Escolha outro.',
  'missions.reschedule.blocked.tooFar':
    'O novo prazo pode ser no máximo {days} dias a partir de agora.',
  'missions.reschedule.blocked.missingReason': 'Escolha o motivo para salvar o novo prazo.',

  'missions.evaluation.modelLabel':
    'Avaliação da Kairya — interpretação do modelo, não verificação automática',
  'missions.evaluation.verification.selfDeclared': 'Autodeclarada',
  'missions.evaluation.verification.withEvidence': 'Com evidência',
  'missions.evaluation.verdict.meets': 'Critério atendido',
  'missions.evaluation.verdict.partial': 'Atendido em parte',
  'missions.evaluation.verdict.notMet': 'Critério não atendido',
  'missions.evaluation.requesting': 'A Kairya está avaliando…',
  'missions.evaluation.concluded': 'Avaliação concluída: {verdict}.',
  'missions.evaluation.link': 'Link:',
  'missions.evaluation.opensInNewTab': '(abre em nova aba)',
  'missions.evaluation.bonusCredited': 'Bônus de XP creditado ao seu saldo.',
  'missions.evaluation.inProgress': 'Avaliação em andamento',
  'missions.evaluation.request': 'Pedir avaliação da Kairya',

  'missions.list.title': 'Outras missões — tarefas com prazo',
  'missions.list.loading': 'Convocando as missões…',
  'missions.list.empty': 'Nenhuma missão no quadro. Peça uma nova campanha à Kairya para começar.',
  'missions.list.loadFailed': 'Falha ao carregar as missões.',
  'missions.list.unexpectedFailure': 'Falha inesperada ao carregar as missões.',
  'missions.list.reloadWaiting': 'Aguardando o pedido em andamento para atualizar o quadro.',
  'missions.list.loadMore': 'Carregar mais missões',
  'missions.list.loadingMore': 'Carregando mais missões…',
  'missions.list.loadMoreFailed':
    'Falha ao carregar mais missões. As que já estão no quadro continuam aqui.',

  'missions.cycle.title': 'Missão de hoje — sua diária',
  'missions.cycle.loading': 'Consultando o ciclo…',
  'missions.cycle.loadFailed': 'Falha ao carregar o ciclo.',
  'missions.cycle.unexpectedFailure': 'Falha inesperada ao carregar o ciclo.',
  'missions.cycle.today': 'Hoje é {date}.',
  'missions.cycle.noPlan':
    'Sem plano nesta semana: não há diária para hoje. Um dia sem plano não quebra a sua sequência.',
  'missions.cycle.lateDaily.title': 'Diária de ontem — iniciada a tempo',
  'missions.cycle.lateDaily.pending':
    'Você começou esta diária no dia dela: ela ainda pode ser concluída até o fim de hoje, e conta para a sequência.',
  'missions.cycle.lateDaily.completed':
    'Concluída com atraso — você começou no dia dela, e ela contou para a sequência.',
  'missions.cycle.lateSpecial.pending':
    'Você começou esta missão dentro da janela: ela ainda pode ser concluída até o fim de hoje.',
  'missions.cycle.lateSpecial.completed':
    'Concluída depois do fim da janela — você começou a tempo.',
  'missions.cycle.streak': 'Sequência: {days}',
  'missions.cycle.streakDays.one': '1 dia seguido',
  'missions.cycle.streakDays.other': '{count} dias seguidos',
  'missions.cycle.progress': 'Missão especial: {progress} de {total} — {remaining}.',
  'missions.cycle.remainingDays.one': 'falta 1 dia',
  'missions.cycle.remainingDays.other': 'faltam {count} dias',
  'missions.cycle.special.title': 'Missão especial — bônus da sequência',
  'missions.cycle.refreshFailed': 'Não foi possível atualizar a sequência.',
  'missions.cycle.refresh': 'Atualizar',

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
  'tutoring.messageFailure.unrecognizedFailure.message':
    'A Kairya não conseguiu responder a esta pergunta.',
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
    'A estimativa desta proposta precisa ficar entre {min} e {max} minutos.',
  'tutoring.actionFailure.deadlineOutOfBounds.message':
    'O prazo desta proposta passa de {days} dias a partir de agora.',
  'tutoring.actionFailure.unconfirmedCreate.message': 'Não foi possível confirmar a missão.',
  'tutoring.actionFailure.unconfirmedCreate.recovery':
    'Tentar de novo é seguro: nada será duplicado.',
  'tutoring.actionFailure.unconfirmedCreate.timeout':
    'Não foi possível confirmar a missão: o servidor demorou demais.',
  'tutoring.actionFailure.unconfirmedCreate.network':
    'Não foi possível confirmar a missão: sem conexão.',
  'tutoring.actionFailure.unconfirmedReschedule.message':
    'Não foi possível confirmar o reagendamento.',
  'tutoring.actionFailure.unconfirmedReschedule.recovery':
    'Tentar de novo é seguro: nada será duplicado.',
  'tutoring.actionFailure.unconfirmedReschedule.timeout':
    'Não foi possível confirmar o reagendamento: o servidor demorou demais.',
  'tutoring.actionFailure.unconfirmedReschedule.network':
    'Não foi possível confirmar o reagendamento: sem conexão.',
  'tutoring.actionFailure.unconfirmedReject.message': 'Não foi possível recusar a proposta.',
  'tutoring.actionFailure.unconfirmedReject.recovery': 'Tentar de novo é seguro.',
  'tutoring.actionFailure.unconfirmedReject.timeout':
    'Não foi possível recusar a proposta: o servidor demorou demais.',
  'tutoring.actionFailure.unconfirmedReject.network':
    'Não foi possível recusar a proposta: sem conexão.',
  'tutoring.actionFailure.failed.message': 'Esta proposta não pôde ser executada.',

  'progression.panel.title': 'Seu progresso — nível e conquistas',
  'progression.panel.loading': 'Consultando o seu progresso…',
  'progression.panel.unexpectedFailure': 'Falha inesperada ao carregar o progresso.',
  'progression.panel.retry': 'Tentar novamente',
  'progression.panel.refreshFailed': 'Não foi possível atualizar o progresso.',
  'progression.panel.refresh': 'Atualizar',
  'progression.level': 'Nível {level}',
  'progression.xpTotal': '{xp} XP no total',
  'progression.rank.label': 'Faixa: {name}',
  'progression.rank.rank_seed': 'Semente',
  'progression.rank.rank_sprout': 'Broto',
  'progression.rank.rank_blade': 'Lâmina',
  'progression.rank.rank_flame': 'Chama',
  'progression.rank.rank_star': 'Estrela',
  'progression.bar.label': 'Progresso até o nível {level}',
  'progression.bar.valueText': '{into} de {span} XP',
  'progression.bar.text': '{into} de {span} XP até o nível {level}',
  'progression.achievements.title': 'Conquistas',
  'progression.achievement.unlockedOn': 'Conquistada em {date}',
  'progression.achievement.locked': 'Bloqueada: {description}',
  'progression.achievement.first_steps.title': 'Primeiros passos',
  'progression.achievement.first_steps.description': 'Conclua a sua primeira missão.',
  'progression.achievement.streak_7.title': 'Uma semana inteira',
  'progression.achievement.streak_7.description': 'Complete a diária 7 dias seguidos.',
  'progression.achievement.streak_30.title': 'Um mês de hábito',
  'progression.achievement.streak_30.description': 'Complete a diária 30 dias seguidos.',
  'progression.achievement.veteran_10.title': 'Veterano I',
  'progression.achievement.veteran_10.description': 'Conclua 10 missões.',
  'progression.achievement.veteran_50.title': 'Veterano II',
  'progression.achievement.veteran_50.description': 'Conclua 50 missões.',
  'progression.achievement.veteran_100.title': 'Veterano III',
  'progression.achievement.veteran_100.description': 'Conclua 100 missões.',
  'progression.achievement.kairya_partnership.title': 'Parceria com a Kairya',
  'progression.achievement.kairya_partnership.description':
    'Conclua uma missão proposta pela Kairya.',
  'progression.achievement.first_pass.title': 'Primeira aprovação',
  'progression.achievement.first_pass.description':
    'Receba da Kairya uma avaliação “atende” numa entrega.',
  'progression.achievement.weekly_trial.title': 'Prova da semana vencida',
  'progression.achievement.weekly_trial.description': 'Conclua a sua primeira missão especial.',
  'progression.achievement.comeback.title': 'A volta',
  'progression.achievement.comeback.description':
    'Conclua uma diária depois de 3 dias ou mais sem nenhuma concluída.',

  'campaigns.page.title': 'Campanhas — planos de estudo',
  'campaigns.page.subtitle': 'A semana inteira, dia a dia, e a missão especial.',
  'campaigns.form.open': 'Criar o plano da semana',
  'campaigns.form.title': 'Plano da semana',
  'campaigns.form.intro': 'Monte sete treinos e uma prova. Dá para começar pequeno.',
  'campaigns.form.week.legend': 'Para qual semana?',
  'campaigns.form.week.current': 'Esta semana',
  'campaigns.form.week.next': 'Próxima semana',
  'campaigns.form.daily.legend': 'Treinos do dia',
  'campaigns.form.daily.ready': 'Pronto',
  'campaigns.form.daily.missing': 'Falta preencher',
  'campaigns.form.field.instructions': 'Instruções',
  'campaigns.form.field.instructions.help': 'O que você vai estudar e como.',
  'campaigns.form.field.criterion': 'Critério de conclusão',
  'campaigns.form.field.criterion.help': 'Como você sabe que terminou.',
  'campaigns.form.field.difficulty': 'Dificuldade',
  'campaigns.form.field.difficulty.option': '{n} de 5',
  'campaigns.form.field.minutes': 'Minutos',
  'campaigns.form.counter': '{used} de {max} caracteres.',
  'campaigns.form.copyMonday': 'Copiar segunda para os outros dias',
  'campaigns.form.copyMonday.done': 'Segunda copiada para os dias vazios.',
  'campaigns.form.trial.legend': 'Prova da semana',
  'campaigns.form.submit': 'Criar plano',
  'campaigns.form.submitting': 'Criando o plano…',
  'campaigns.form.cancel': 'Cancelar',
  'campaigns.form.error.required': 'Preencha este campo.',
  'campaigns.form.error.tooLong': 'Use até {max} caracteres.',
  'campaigns.form.error.minutesRange': 'Use de {minMinutes} a {maxMinutes} minutos.',
  'campaigns.form.error.invalidChars':
    'Este campo tem um caractere que não pode ser salvo. Remova-o.',
  'campaigns.form.error.summary.one': 'Falta 1 campo. Ele está destacado.',
  'campaigns.form.error.summary.other': 'Faltam {n} campos. O primeiro está destacado.',
  'campaigns.form.failure.plano_existente':
    'O plano não foi criado. Esta semana já tem um plano. Veja o plano abaixo.',
  'campaigns.form.failure.plano_existente_next':
    'O plano não foi criado. A próxima semana já tem um plano.',
  'campaigns.form.failure.semana_encerrada':
    'O plano não foi criado. Esta semana já acabou. Escolha a próxima semana.',
  'campaigns.form.failure.semana_distante':
    'O plano não foi criado. Só dá para planejar esta semana ou a próxima.',
  'campaigns.form.failure.invalid':
    'O plano não foi criado. Algum dado ficou fora do esperado. Revise os campos e tente de novo.',
  'campaigns.form.failure.transport.fallback':
    'O plano não foi criado: o servidor não conseguiu atender o pedido.',
  'campaigns.form.failure.transport.timeout':
    'O plano não foi criado: o servidor demorou demais para responder.',
  'campaigns.form.failure.transport.network': 'O plano não foi criado: sem conexão.',
  'campaigns.form.failure.transport.recovery': 'Seus dados continuam aqui. Tente de novo.',
  'campaigns.form.success': 'Plano criado. Bom treino.',
  'campaigns.form.createdNext': 'Plano da próxima semana criado. Ele começa {date}.',
  'campaigns.trail.loading': 'Consultando a trilha…',
  'campaigns.trail.loadFailed': 'Falha ao carregar a trilha.',
  'campaigns.trail.unexpectedFailure': 'Falha inesperada ao carregar a trilha.',
  'campaigns.trail.retry': 'Tentar novamente',
  'campaigns.trail.noPlan':
    'Sem plano nesta semana. Um dia sem plano não quebra a sequência, e a trilha volta a mostrar os dias assim que houver um plano para a semana atual.',
  'campaigns.trail.week': 'Semana de {date}.',
  'campaigns.trail.today': 'Hoje',
  'campaigns.trail.refreshFailed': 'Não foi possível atualizar a trilha.',
  'campaigns.trail.refresh': 'Atualizar',
  'campaigns.trail.special.title': 'Missão especial — bônus da sequência',
  'campaigns.trail.special.progress': 'Progresso até a especial: {progress} de {total}',
  'campaigns.lantern.title': 'Trilha de lanternas da semana',
  'campaigns.lantern.list': 'Lanternas da semana',
  'campaigns.lantern.summary': '{lit} de {total} lanternas acesas nesta semana',
  'campaigns.lantern.day.concluida': 'Acesa: diária concluída',
  'campaigns.lantern.day.perdida': 'Apagada: sem diária neste dia',
  'campaigns.lantern.day.expirada': 'Apagada: sem diária neste dia',
  'campaigns.lantern.day.disponivel': 'Pronta: dá tempo hoje',
  'campaigns.lantern.day.bloqueada': 'Ainda por vir',
  'campaigns.lantern.day.fora_do_plano': 'Sem plano neste dia',
  'campaigns.lantern.special.concluida': 'Lanterna grande acesa: especial concluída',
  'campaigns.lantern.special.disponivel': 'Lanterna grande pronta: a especial está aberta',
  'campaigns.lantern.special.bloqueada': 'Lanterna grande: acende com 7 dias seguidos',
  'campaigns.lantern.special.expirada': 'Lanterna grande apagada: a especial desta semana passou',
  'campaigns.lantern.special.perdida': 'Lanterna grande apagada: a especial desta semana passou',
  'campaigns.lantern.special.fora_do_plano': 'Lanterna grande: acende com 7 dias seguidos',
  'campaigns.headquarters.hint': 'Conclua esta missão no Quartel-General.',
  'campaigns.headquarters.go': 'Ir ao Quartel-General',
} as const
