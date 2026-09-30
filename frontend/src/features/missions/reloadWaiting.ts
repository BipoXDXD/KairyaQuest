/**
 * O texto do botao de recarga enquanto um pedido esta em voo: uma conclusao,
 * um Iniciar ou um Reagendar. O texto diz "pedido", e nao "conclusao", porque
 * o registro conta os tres e a espera e a mesma. Mora aqui, e nao no
 * `MissionCard`, porque o botao do `EvaluationPanel` diz o MESMO texto e o
 * cartao importa o painel (importar de volta seria circular).
 */
export const RELOAD_WAITING_LABEL = 'Aguardando o pedido em andamento…'
