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
    formula: '(último snapshot + Σ saldos livres futuros) − reservado p/ metas de gasto',
    desc: 'Parte da última posição real registrada, acumula o saldo livre projetado de cada mês seguinte, e desconta o quanto já está reservado para metas de categoria "gasto" (ver Categoria da meta) — esse dinheiro está comprometido com um gasto futuro, não é patrimônio disponível. Quando um mês é fechado com valores reais, a linha "real" substitui a projeção.',
  },
  {
    id: 'categoria-meta',
    term: 'Categoria da meta',
    formula: 'gasto | patrimônio',
    desc: '"Gasto": um compromisso futuro que vai consumir patrimônio (reforma, viagem) — o quanto já está reservado para ela é descontado do Patrimônio projetado. "Patrimônio": construção de patrimônio (reserva, previdência) — não desconta. A categoria não muda como a meta recebe aporte/posição, só como ela entra nesse cálculo.',
  },
  {
    id: 'modo-alocacao',
    term: 'Modo de distribuição dos aportes',
    formula: 'Aporte Mínimo (AM) | Prioridade',
    desc: 'Escolhido no topo da tela de Metas e vale para o app inteiro. "Aporte Mínimo": cada meta recebe o mínimo para fechar no prazo e o excedente vai à meta de prazo mais próximo. "Prioridade": todo o saldo livre vai para a meta de maior prioridade até 100%, depois cascateia para a próxima — não há aporte mínimo nem déficit, só a ordem de prioridade (definida na tela de Metas) decide. O modo também define como o patrimônio atual é atribuído às metas como posição inicial.',
  },
  {
    id: 'aporte-minimo',
    term: 'Aporte mínimo (AM)',
    formula: 'valor faltante da meta ÷ meses até o prazo',
    desc: 'Recalculado todo mês: se você aportou menos num mês, o faltante sobe e o AM seguinte aumenta sozinho. É o número exato que mantém a meta no prazo. Guia a distribuição no modo "Aporte Mínimo"; no modo "Prioridade" ele vira só uma referência (quanto seria preciso por mês para fechar no prazo), pois a distribuição segue a prioridade.',
  },
  {
    id: 'alocacao',
    term: 'Alocação sugerida',
    formula: 'depende do modo: Aporte Mínimo ou Prioridade',
    desc: 'No modo Aporte Mínimo: 1) cada meta ativa recebe seu AM; 2) o excedente vai à meta de prazo mais próximo; 3) em déficit, a ordem de prioridade decide. No modo Prioridade: todo o saldo livre vai para a meta de maior prioridade até completá-la, depois cascateia para a próxima. A ordem de prioridade é definida na tela de Metas.',
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
    term: 'Evolução das posições',
    formula: 'Σ posições mensais lançadas, total e por pessoa',
    desc: 'Construída a partir dos snapshots de investimento. Quanto mais fechamentos mensais registrados, mais longa a série. O gráfico só aparece a partir de dois meses de posições lançadas — continue registrando os fechamentos mensais para vê-lo crescer.',
  },
  {
    id: 'fluxo-caixa-diario',
    term: 'Fluxo de caixa diário',
    formula: 'saldo em contas no início do mês + Σ receitas do dia − Σ despesas do dia, dia a dia',
    desc: 'Distribui receitas, despesas recorrentes, parcelas de previsões e faturas de cartão pelo dia do mês em que ocorrem (dia do recebimento/pagamento/vencimento; sem essa informação, assume o dia 1) e acumula o saldo em contas correntes dia a dia. Não considera investimentos — só quando o saldo em contas fica negativo é que seria necessário sacar deles para cobrir as despesas do mês.',
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
