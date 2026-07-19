// Fonte única do glossário — consumida pela página /glossario e pelos tooltips ⓘ (InfoTip).
export interface GlossaryEntry {
  id: string;
  term: string;
  formula: string;
  desc: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    id: 'receitas',
    term: 'Receitas do mês',
    formula: 'Σ receitas recorrentes vigentes + receitas pontuais do mês',
    desc: 'Recorrentes (salários, rendimentos) contam em todo mês dentro da vigência. Pontuais (13º, férias, restituição) contam apenas no mês esperado.',
  },
  {
    id: 'despesas',
    term: 'Despesas do mês',
    formula: 'Σ despesas recorrentes vigentes + parcelas de previsões + faturas de cartão',
    desc: 'Despesas recorrentes valem até o fim do prazo (ou para sempre, se não houver). Previsões parceladas contam da primeira à última parcela. Cartões usam a fatura real quando já lançada; senão, o valor-base do cartão.',
  },
  {
    id: 'valor-base',
    term: 'Valor-base do cartão',
    formula: 'estimativa fixa por cartão para meses sem fatura lançada',
    desc: 'É o "chute educado" da fatura futura. Quando a fatura real é lançada no fechamento do mês, ela substitui o valor-base naquele mês.',
  },
  {
    id: 'saldo-livre',
    term: 'Saldo livre',
    formula: 'receitas do mês − despesas do mês',
    desc: 'O que sobra (ou falta) no mês antes dos aportes em metas. É a matéria-prima da alocação: aportes só são sugeridos quando o saldo livre é positivo. No gráfico de 24 meses, a linha mostra o saldo livre acumulado — o total projetado somado até o fim do período.',
  },
  {
    id: 'patrimonio',
    term: 'Patrimônio projetado',
    formula: 'último snapshot (contas + investimentos) + Σ saldos livres futuros',
    desc: 'Parte da última posição real registrada e acumula o saldo livre projetado de cada mês seguinte. Quando um mês é fechado com valores reais, a linha "real" substitui a projeção.',
  },
  {
    id: 'aporte-minimo',
    term: 'Aporte mínimo (AM)',
    formula: 'valor faltante da meta ÷ meses até o prazo',
    desc: 'Recalculado todo mês: se você aportou menos num mês, o faltante sobe e o AM seguinte aumenta sozinho. É o número exato que mantém a meta no prazo — substituiu o antigo sistema de pesos.',
  },
  {
    id: 'alocacao',
    term: 'Alocação sugerida',
    formula: '1) cada meta ativa recebe seu AM; 2) excedente vai à meta de prazo mais próximo; 3) em déficit, a ordem de prioridade decide',
    desc: 'Concluir antes a meta mais urgente libera caixa para as demais. A ordem de prioridade (definida na tela de Metas) só é usada quando o saldo livre não cobre a soma dos AMs.',
  },
  {
    id: 'status-meta',
    term: 'Status da meta',
    formula: 'simulação mês a mês até o último prazo',
    desc: 'No prazo: a simulação conclui a meta até o deadline. Vai atrasar: conclui, mas depois do prazo. Inviável: não conclui dentro do horizonte simulado. Pausada: fora da alocação por decisão sua. Alcançada: aportes ≥ alvo.',
  },
  {
    id: 'conclusao-projetada',
    term: 'Conclusão projetada',
    formula: 'mês em que os aportes simulados completam o alvo',
    desc: 'Resultado da simulação de alocação sobre o saldo livre projetado. Compare com o prazo: se vier depois, a meta está atrasada e o app sugere adiar prazo, reduzir alvo ou repriorizar.',
  },
  {
    id: 'previsoes',
    term: 'Previsões (despesas planejadas)',
    formula: 'valor total ÷ nº de parcelas, do mês inicial ao final',
    desc: 'Gastos futuros já decididos (empréstimo, obra, 13º de funcionárias). Entram como parcelas mensais nas despesas projetadas até a última parcela.',
  },
  {
    id: 'snapshot',
    term: 'Snapshot mensal',
    formula: 'foto do saldo de cada conta/investimento no fechamento do mês',
    desc: 'O Dinheiritos não registra transações: registra posições. Uma por conta/investimento por mês. É o que ancora o patrimônio real e recalibra as projeções.',
  },
  {
    id: 'composicao-despesas',
    term: 'Composição das despesas',
    formula: 'recorrentes + faturas de cartão + parcelas de previsões',
    desc: 'A visão empilhada em Análises mostra quanto de cada mês é despesa fixa, fatura de cartão e parcela de compromissos futuros — útil para ver o que aperta o orçamento em cada período.',
  },
  {
    id: 'acumulados',
    term: 'Acumulados',
    formula: 'soma corrente, mês a mês, dos aportes sugeridos, das parcelas de previsões e das despesas',
    desc: 'Mostra a trajetória ao longo do horizonte de 24 meses: quanto vai para metas (aportes), quanto pesam os compromissos parcelados (previsões) e o total gasto (despesas), acumulados.',
  },
  {
    id: 'tabela-saldo',
    term: 'Tabela saldo',
    formula: 'meses fechados (reais) + meses projetados, nas mesmas colunas',
    desc: 'Tabela de conferência: cada linha marca a origem (real ou projetado). Os meses reais vêm dos fechamentos; os projetados, do motor. Se um valor parecer estranho, confira os insumos em Lançamentos, Contas e Cartões.',
  },
  {
    id: 'evolucao-investimentos',
    term: 'Evolução dos investimentos',
    formula: 'Σ posições mensais lançadas, total e por pessoa',
    desc: 'Construída a partir dos snapshots de investimento. Quanto mais fechamentos mensais registrados, mais longa a série.',
  },
  {
    id: 'mes-fechado',
    term: 'Mês fechado',
    formula: 'mês com snapshots e faturas reais lançados',
    desc: 'Vira histórico: os valores reais substituem as estimativas nos gráficos, e a projeção futura parte dele.',
  },
];

export const glossaryById = (id: string): GlossaryEntry | undefined =>
  GLOSSARY.find((e) => e.id === id);
