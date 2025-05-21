function generateAnnualSummary() {
  const currentYear = moment().format('YYYY');
  const expenses = readDataFile(EXPENSE_FILE).filter(expense => expense.date.startsWith(currentYear));

  if (expenses.length === 0) {
    return "Ainda não foi adicionado nenhuma despesa no ano atual!";
  }

  // Calcular totais por método de pagamento
  const totals = {
    total: 0,
    dinheiro: 0,
    pix: 0,
    credito: 0,
    debito: 0
  };

  // Agrupar despesas por mês
  const expensesByMonth = {};

  expenses.forEach(expense => {
    const month = expense.date.substring(0, 7); // YYYY-MM
    const monthName = moment(month).format('MMMM');

    if (!expensesByMonth[monthName]) {
      expensesByMonth[monthName] = 0;
    }

    const amount = expense.amount;
    expensesByMonth[monthName] += amount;
    totals.total += amount;

    if (expense.paymentMethod.includes('dinheiro')) {
      totals.dinheiro += amount;
    } else if (expense.paymentMethod.includes('pix')) {
      totals.pix += amount;
    } else if (expense.paymentMethod.includes('crédito')) {
      totals.credito += amount;
    } else if (expense.paymentMethod.includes('débito')) {
      totals.debito += amount;
    }
  });

  let details = "Aqui está seu Resumo Anual.\n\n";
  details += "TOTAL POR MÊS:\n";

  for (const [month, total] of Object.entries(expensesByMonth)) {
    details += `- ${month}: R$ ${total.toFixed(2)}\n`;
  }

  details += "\nTOTAL POR MÉTODO DE PAGAMENTO:\n";
  if (totals.dinheiro > 0) {
    details += `- Dinheiro: R$ ${totals.dinheiro.toFixed(2)}\n`;
  }
  if (totals.pix > 0) {
    details += `- PIX: R$ ${totals.pix.toFixed(2)}\n`;
  }
  if (totals.credito > 0) {
    details += `- Cartão de Crédito: R$ ${totals.credito.toFixed(2)}\n`;
  }
  if (totals.debito > 0) {
    details += `- Cartão de Débito: R$ ${totals.debito.toFixed(2)}\n`;
  }

  details += `\nAté o momento suas despesas anuais somam um total de: R$ ${totals.total.toFixed(2)}`;

  return details;
}