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
  'missions.completionFailure.evidenceRejected.message': 'A evidência não foi aceita.',
  'missions.completionFailure.evidenceRejected.recovery': 'Revise o texto e o link.',

  'missions.startFailure.alreadyStarted.message': 'Esta missão já foi iniciada ou concluída.',
  'missions.startFailure.expired.message':
    'O prazo desta missão já terminou e ela não pode mais ser iniciada.',
  'missions.startFailure.unconfirmed.message': 'Não foi possível confirmar o início.',
  'missions.startFailure.unconfirmed.recovery':
    'Tentar de novo é seguro: a missão não será iniciada duas vezes.',

  'missions.rescheduleFailure.deadlinePassed.message': 'O novo prazo precisa estar no futuro.',
  'missions.rescheduleFailure.deadlinePassed.recovery': 'Escolha uma data e um horário futuros.',
  'missions.rescheduleFailure.unchanged.message': 'O novo prazo é igual ao atual.',
  'missions.rescheduleFailure.unchanged.recovery': 'Escolha outro horário.',
  'missions.rescheduleFailure.alreadyCompleted.message':
    'Esta missão já foi concluída e não pode ser reagendada.',
  'missions.rescheduleFailure.derivedDeadline.message':
    'O prazo desta missão vem do plano da semana e não pode ser reagendado.',
  'missions.rescheduleFailure.unconfirmed.message': 'Não foi possível confirmar o reagendamento.',
  'missions.rescheduleFailure.unconfirmed.recovery':
    'Tentar de novo é seguro: o prazo não mudará duas vezes.',
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
  'tutoring.actionFailure.unconfirmedCreate.message': 'Não foi possível confirmar a missão.',
  'tutoring.actionFailure.unconfirmedCreate.recovery':
    'Tentar de novo é seguro: a missão não será criada duas vezes.',
  'tutoring.actionFailure.unconfirmedReschedule.message':
    'Não foi possível confirmar o reagendamento.',
  'tutoring.actionFailure.unconfirmedReschedule.recovery':
    'Tentar de novo é seguro: o prazo não mudará duas vezes.',
  'tutoring.actionFailure.unconfirmedReject.message': 'Não foi possível recusar a proposta.',
  'tutoring.actionFailure.unconfirmedReject.recovery': 'Tentar de novo é seguro.',
  'tutoring.actionFailure.failed.message': 'Esta proposta não pôde ser executada.',
} as const
