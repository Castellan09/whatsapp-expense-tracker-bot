// index.js - Arquivo principal do bot de gastos para WhatsApp
require('dotenv').config();
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
moment.locale('pt-br');

// Configuração do servidor Express
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Pasta para armazenar os dados
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

// Arquivos de dados
const EXPENSE_FILE = path.join(DATA_DIR, 'expenses.json');
const INCOME_FILE = path.join(DATA_DIR, 'income.json');
const FIXED_EXPENSE_FILE = path.join(DATA_DIR, 'fixed_expenses.json');
const FIXED_INCOME_FILE = path.join(DATA_DIR, 'fixed_income.json');

// Criar arquivos se não existirem
const createFileIfNotExists = (filePath) => {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify([]));
  }
};

createFileIfNotExists(EXPENSE_FILE);
createFileIfNotExists(INCOME_FILE);
createFileIfNotExists(FIXED_EXPENSE_FILE);
createFileIfNotExists(FIXED_INCOME_FILE);

// Funções para manipulação de dados
const readDataFile = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Erro ao ler arquivo ${filePath}:`, error);
    return [];
  }
};

const writeDataFile = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Erro ao escrever no arquivo ${filePath}:`, error);
  }
};

// Configuração do cliente WhatsApp
const client = new Client({
  authStrategy: new LocalAuth({ clientId: "expense-tracker-bot" }),
  puppeteer: {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ],
    headless: true,
  }
});

// Variáveis para controlar o estado da conversa
const sessions = {};

// Inicializar uma sessão
const initSession = (from) => {
  if (!sessions[from]) {
    sessions[from] = {
      step: 'initial',
      context: {},
    };
  }
  return sessions[from];
};

// Gerar QR code para autenticação
client.on('qr', (qr) => {
  console.log('QR Code gerado. Escaneie com seu WhatsApp para fazer login.');
  qrcode.generate(qr, { small: true });
  
  // Também podemos salvar o QR code em um arquivo para acesso remoto
  fs.writeFileSync('last_qr.txt', qr);
  console.log('QR Code salvo em last_qr.txt');
});

client.on('ready', () => {
  console.log('Cliente WhatsApp está pronto!');
});

client.on('authenticated', () => {
  console.log('Autenticado com sucesso!');
});

client.on('auth_failure', (msg) => {
  console.error('Falha na autenticação:', msg);
});

// Processar mensagens recebidas
client.on('message', async (message) => {
  try {
    const from = message.from;
    const session = initSession(from);
    const text = message.body.trim();

    console.log(`Mensagem recebida de ${from}: ${text}`);

    // Função para enviar mensagem
    const sendMessage = async (content) => {
      try {
        await client.sendMessage(from, content);
        console.log(`Mensagem enviada para ${from}`);
      } catch (error) {
        console.error(`Erro ao enviar mensagem para ${from}:`, error);
      }
    };

    // Função para mostrar o menu principal
    const showMainMenu = async () => {
      const menuOptions = 
        "Olá sou seu DEDO DURO! Como posso te ajudar?\n\n" +
        "- Registrar Despesas\n" +
        "- Registrar Receita\n" +
        "- Resumo Diário\n" +
        "- Resumo Mensal\n" +
        "- Resumo Anual\n" +
        "- Incluir Despesas Fixas\n" +
        "- Incluir Receitas Fixas\n" +
        "- DELETAR";
      
      await sendMessage(menuOptions);
      session.step = 'waitingForCommand';
    };

    // Se for uma mensagem inicial ou comando de retorno ao menu
    if (session.step === 'initial' || text.toLowerCase() === 'menu' || text.toLowerCase() === 'voltar') {
      return showMainMenu();
    }

    // Processar escolha do comando principal
    if (session.step === 'waitingForCommand') {
      switch (text.toLowerCase()) {
        case 'registrar despesas':
          await sendMessage("Em qual categoria se enquadra sua despesa?\n\n- Alimentação\n- Transporte\n- Moradia\n- Lazer\n- Assinaturas\n- Outros");
          session.step = 'waitingForExpenseCategory';
          break;
        
        case 'registrar receita':
          await sendMessage("Qual receita você quer adicionar?");
          session.step = 'waitingForIncomeDetails';
          break;
        
        case 'resumo diário':
          const dailySummary = generateDailySummary();
          await sendMessage(dailySummary);
          session.step = 'initial';
          break;
        
        case 'resumo mensal':
          const monthlySummary = generateMonthlySummary();
          await sendMessage(monthlySummary);
          session.step = 'initial';
          break;
        
        case 'resumo anual':
          const annualSummary = generateAnnualSummary();
          await sendMessage(annualSummary);
          session.step = 'initial';
          break;
        
        case 'incluir despesas fixas':
          await sendMessage("Qual a despesa fixa que você deseja incluir?");
          session.step = 'waitingForFixedExpenseDetails';
          break;
        
        case 'incluir receitas fixas':
          await sendMessage("Qual a receita fixa que você deseja incluir?");
          session.step = 'waitingForFixedIncomeDetails';
          break;
        
        case 'deletar':
          await sendMessage("O que você deseja deletar?\n\n- Despesa\n- Despesa fixa\n- Receita fixa");
          session.step = 'waitingForDeleteOption';
          break;
        
        default:
          await sendMessage("Comando não reconhecido. Por favor, escolha uma das opções:");
          return showMainMenu();
      }
      return;
    }

    // Processar categoria de despesa
    if (session.step === 'waitingForExpenseCategory') {
      const validCategories = ['alimentação', 'transporte', 'moradia', 'lazer', 'assinaturas', 'outros'];
      const category = text.toLowerCase();
      
      if (validCategories.includes(category)) {
        session.context.expenseCategory = category.charAt(0).toUpperCase() + category.slice(1);
        await sendMessage("Qual despesa você quer adicionar?");
        session.step = 'waitingForExpenseDetails';
      } else {
        await sendMessage("Categoria inválida. Por favor, escolha uma das seguintes opções:\n\n- Alimentação\n- Transporte\n- Moradia\n- Lazer\n- Assinaturas\n- Outros");
      }
      return;
    }

    // Processar detalhes da despesa
    if (session.step === 'waitingForExpenseDetails') {
      session.context.expenseDetails = text;
      await sendMessage("Como foi pago?\n\n- Dinheiro\n- PIX\n- Cartão de Crédito\n- Cartão de Débito");
      session.step = 'waitingForPaymentMethod';
      return;
    }

    // Processar método de pagamento
    if (session.step === 'waitingForPaymentMethod') {
      const validMethods = ['dinheiro', 'pix', 'cartão de crédito', 'cartão de débito', 'credito', 'debito'];
      const method = text.toLowerCase();
      
      if (validMethods.includes(method)) {
        let paymentMethod = method;
        if (method === 'credito') paymentMethod = 'cartão de crédito';
        if (method === 'debito') paymentMethod = 'cartão de débito';
        
        // Extrair descrição e valor
        const expenseDetails = session.context.expenseDetails;
        const regex = /(.+)\s+(\d+(?:[.,]\d+)?)\s*(?:reais|real|r\$)?/i;
        const match = expenseDetails.match(regex);
        
        if (match) {
          const description = match[1].trim();
          // Substitui vírgula por ponto para garantir conversão correta
          const amount = parseFloat(match[2].replace(',', '.'));
          
          // Salvar a despesa
          const expenses = readDataFile(EXPENSE_FILE);
          expenses.push({
            date: moment().format('YYYY-MM-DD'),
            category: session.context.expenseCategory,
            description,
            amount,
            paymentMethod,
          });
          writeDataFile(EXPENSE_FILE, expenses);
          
          await sendMessage(`Adicionado a DESPESAS - ${session.context.expenseCategory.toUpperCase()}, o item ${description} ${amount} reais. ECONOMIZA MEU FILHO!`);
        } else {
          await sendMessage("Não consegui identificar corretamente a descrição e o valor. Por favor, tente novamente usando o formato: 'Descrição valor reais'");
        }
      } else {
        await sendMessage("Método de pagamento inválido. Por favor, escolha uma das seguintes opções:\n\n- Dinheiro\n- PIX\n- Cartão de Crédito\n- Cartão de Débito");
        return;
      }
      
      // Resetar a sessão
      session.step = 'initial';
      session.context = {};
      return showMainMenu();
    }

    // Processar detalhes da receita
    if (session.step === 'waitingForIncomeDetails') {
      const regex = /(.+):\s*(\d+(?:[.,]\d+)?)\s*(?:reais|real|r\$)?/i;
      const match = text.match(regex);
      
      if (match) {
        const description = match[1].trim();
        // Substitui vírgula por ponto para garantir conversão correta
        const amount = parseFloat(match[2].replace(',', '.'));
        
        // Salvar a receita
        const incomes = readDataFile(INCOME_FILE);
        incomes.push({
          date: moment().format('YYYY-MM-DD'),
          description,
          amount,
        });
        writeDataFile(INCOME_FILE, incomes);
        
        await sendMessage(`Adicionado Receita ${description}: ${amount} reais. PARABENS CRIATURA, SEMPRE NA BUSCA DE MAIS DINDIN $$$`);
      } else {
        await sendMessage("Não consegui identificar corretamente a descrição e o valor. Por favor, tente novamente usando o formato: 'Descrição: valor reais'");
      }
      
      // Resetar a sessão
      session.step = 'initial';
      session.context = {};
      return showMainMenu();
    }

    // Processar detalhes da despesa fixa
    if (session.step === 'waitingForFixedExpenseDetails') {
      session.context.fixedExpenseDescription = text;
      await sendMessage("Em que dia do mês?");
      session.step = 'waitingForFixedExpenseDay';
      return;
    }

    // Processar dia da despesa fixa
    if (session.step === 'waitingForFixedExpenseDay') {
      const day = parseInt(text);
      
      if (isNaN(day) || day < 1 || day > 31) {
        await sendMessage("Por favor, informe um dia válido entre 1 e 31.");
        return;
      }
      
      // Extrair valor da descrição
      const regex = /(.+)\s+(\d+(?:[.,]\d+)?)\s*(?:reais|real|r\$)?/i;
      const match = session.context.fixedExpenseDescription.match(regex);
      
      if (match) {
        const description = match[1].trim();
        // Substitui vírgula por ponto para garantir conversão correta
        const amount = parseFloat(match[2].replace(',', '.'));
        
        // Salvar a despesa fixa
        const fixedExpenses = readDataFile(FIXED_EXPENSE_FILE);
        fixedExpenses.push({
          description,
          amount,
          day,
        });
        writeDataFile(FIXED_EXPENSE_FILE, fixedExpenses);
        
        await sendMessage(`A despesa fixa de ${description} todo dia ${day} foi adicionada com sucesso!`);
      } else {
        await sendMessage("Não consegui identificar corretamente a descrição e o valor da despesa fixa. Por favor, tente novamente no formato: 'Descrição valor reais'");
      }
      
      // Resetar a sessão
      session.step = 'initial';
      session.context = {};
      return showMainMenu();
    }

    // Processar detalhes da receita fixa
    if (session.step === 'waitingForFixedIncomeDetails') {
      session.context.fixedIncomeDescription = text;
      await sendMessage("Em que dia do mês?");
      session.step = 'waitingForFixedIncomeDay';
      return;
    }

    // Processar dia da receita fixa
    if (session.step === 'waitingForFixedIncomeDay') {
      const day = parseInt(text);
      
      if (isNaN(day) || day < 1 || day > 31) {
        await sendMessage("Por favor, informe um dia válido entre 1 e 31.");
        return;
      }
      
      // Extrair valor da descrição
      const regex = /(.+):\s*(\d+(?:[.,]\d+)?)\s*(?:reais|real|r\$)?/i;
      const match = session.context.fixedIncomeDescription.match(regex);
      
      if (match) {
        const description = match[1].trim();
        // Substitui vírgula por ponto para garantir conversão correta
        const amount = parseFloat(match[2].replace(',', '.'));
        
        // Salvar a receita fixa
        const fixedIncomes = readDataFile(FIXED_INCOME_FILE);
        fixedIncomes.push({
          description,
          amount,
          day,
        });
        writeDataFile(FIXED_INCOME_FILE, fixedIncomes);
        
        await sendMessage(`A receita fixa de ${description} todo dia ${day} foi adicionada com sucesso!`);
      } else {
        await sendMessage("Não consegui identificar corretamente a descrição e o valor da receita fixa. Por favor, tente novamente no formato: 'Descrição: valor reais'");
      }
      
      // Resetar a sessão
      session.step = 'initial';
      session.context = {};
      return showMainMenu();
    }

    // Processar opção de exclusão
    if (session.step === 'waitingForDeleteOption') {
      const option = text.toLowerCase();
      
      if (option === 'despesa') {
        await sendMessage("Em que dia a despesa foi incluída? (formato: DD/MM/YYYY)");
        session.step = 'waitingForExpenseDate';
      } else if (option === 'despesa fixa') {
        const fixedExpenses = readDataFile(FIXED_EXPENSE_FILE);
        
        if (fixedExpenses.length === 0) {
          await sendMessage("Não há despesas fixas cadastradas.");
          session.step = 'initial';
          return showMainMenu();
        }
        
        let message = "Escolha a despesa fixa que deseja deletar:\n\n";
        fixedExpenses.forEach((item, index) => {
          message += `${index + 1}. ${item.description} - R$ ${item.amount.toFixed(2)} (Dia ${item.day})\n`;
        });
        
        await sendMessage(message);
        session.step = 'waitingForFixedExpenseIndex';
      } else if (option === 'receita fixa') {
        const fixedIncomes = readDataFile(FIXED_INCOME_FILE);
        
        if (fixedIncomes.length === 0) {
          await sendMessage("Não há receitas fixas cadastradas.");
          session.step = 'initial';
          return showMainMenu();
        }
        
        let message = "Escolha a receita fixa que deseja deletar:\n\n";
        fixedIncomes.forEach((item, index) => {
          message += `${index + 1}. ${item.description} - R$ ${item.amount.toFixed(2)} (Dia ${item.day})\n`;
        });
        
        await sendMessage(message);
        session.step = 'waitingForFixedIncomeIndex';
      } else {
        await sendMessage("Opção inválida. Por favor, escolha entre:\n\n- Despesa\n- Despesa fixa\n- Receita fixa");
      }
      return;
    }

    // Processar data da despesa para exclusão
    if (session.step === 'waitingForExpenseDate') {
      const dateRegex = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
      const match = text.match(dateRegex);
      
      if (match) {
        const day = match[1].padStart(2, '0');
        const month = match[2].padStart(2, '0');
        const year = match[3];
        const dateStr = `${year}-${month}-${day}`;
        
        const expenses = readDataFile(EXPENSE_FILE);
        const dayExpenses = expenses.filter(expense => expense.date === dateStr);
        
        if (dayExpenses.length === 0) {
          await sendMessage("Não há despesas registradas para esta data.");
          session.step = 'initial';
          return showMainMenu();
        }
        
        let message = "Escolha a despesa que deseja deletar:\n\n";
        dayExpenses.forEach((expense, index) => {
          message += `${index + 1}. ${expense.category} - ${expense.description} - R$ ${expense.amount.toFixed(2)} (${expense.paymentMethod})\n`;
        });
        
        session.context.dateStr = dateStr;
        await sendMessage(message);
        session.step = 'waitingForExpenseIndex';
      } else {
        await sendMessage("Formato de data inválido. Por favor, utilize o formato DD/MM/YYYY.");
      }
      return;
    }

    // Processar índice da despesa para exclusão
    if (session.step === 'waitingForExpenseIndex') {
      const index = parseInt(text) - 1;
      const expenses = readDataFile(EXPENSE_FILE);
      const dayExpenses = expenses.filter(expense => expense.date === session.context.dateStr);
      
      if (isNaN(index) || index < 0 || index >= dayExpenses.length) {
        await sendMessage("Índice inválido. Por favor, escolha um número válido da lista.");
        return;
      }
      
      const expenseToDelete = dayExpenses[index];
      const updatedExpenses = expenses.filter(expense => 
        !(expense.date === session.context.dateStr && 
          expense.category === expenseToDelete.category && 
          expense.description === expenseToDelete.description && 
          expense.amount === expenseToDelete.amount &&
          expense.paymentMethod === expenseToDelete.paymentMethod)
      );
      
      writeDataFile(EXPENSE_FILE, updatedExpenses);
      await sendMessage(`Despesa "${expenseToDelete.description}" de R$ ${expenseToDelete.amount.toFixed(2)} excluída com sucesso!`);
      
      // Resetar a sessão
      session.step = 'initial';
      session.context = {};
      return showMainMenu();
    }

    // Processar índice da despesa fixa para exclusão
    if (session.step === 'waitingForFixedExpenseIndex') {
      const index = parseInt(text) - 1;
      const fixedExpenses = readDataFile(FIXED_EXPENSE_FILE);
      
      if (isNaN(index) || index < 0 || index >= fixedExpenses.length) {
        await sendMessage("Índice inválido. Por favor, escolha um número válido da lista.");
        return;
      }
      
      const expenseToDelete = fixedExpenses[index];
      fixedExpenses.splice(index, 1);
      writeDataFile(FIXED_EXPENSE_FILE, fixedExpenses);
      
      await sendMessage(`Despesa fixa "${expenseToDelete.description}" de R$ ${expenseToDelete.amount.toFixed(2)} excluída com sucesso!`);
      
      // Resetar a sessão
      session.step = 'initial';
      session.context = {};
      return showMainMenu();
    }

    // Processar índice da receita fixa para exclusão
    if (session.step === 'waitingForFixedIncomeIndex') {
      const index = parseInt(text) - 1;
      const fixedIncomes = readDataFile(FIXED_INCOME_FILE);
      
      if (isNaN(index) || index < 0 || index >= fixedIncomes.length) {
        await sendMessage("Índice inválido. Por favor, escolha um número válido da lista.");
        return;
      }
      
      const incomeToDelete = fixedIncomes[index];
      fixedIncomes.splice(index, 1);
      writeDataFile(FIXED_INCOME_FILE, fixedIncomes);
      
      await sendMessage(`Receita fixa "${incomeToDelete.description}" de R$ ${incomeToDelete.amount.toFixed(2)} excluída com sucesso!`);
      
      // Resetar a sessão
      session.step = 'initial';
      session.context = {};
      return showMainMenu();
    }

    // Se chegar aqui, a mensagem não foi processada
    await sendMessage("Não entendi sua mensagem. Por favor, escolha uma das opções:");
    return showMainMenu();
  } catch (error) {
    console.error('Erro ao processar mensagem:', error);
    try {
      await client.sendMessage(message.from, "Ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.");
    } catch (sendError) {
      console.error('Erro ao enviar mensagem de erro:', sendError);
    }
  }
});

// Funções para gerar relatórios
function generateDailySummary() {
  const today = moment().format('YYYY-MM-DD');
  const expenses = readDataFile(EXPENSE_FILE).filter(expense => expense.date === today);
  
  if (expenses.length === 0) {
    return "Ainda não foi adicionado nenhum gasto no dia de hoje!";
  }
  
  // Calcular totais por método de pagamento
  const totals = {
    total: 0,
    dinheiro: 0,
    pix: 0,
    credito: 0,
    debito: 0
  };
  
  let details = "Aqui está seu Resumo Diário.\n\n";
  
  expenses.forEach(expense => {
    const amount = expense.amount;
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
    
    details += `- ${expense.category}: ${expense.description} - R$ ${amount.toFixed(2)} (${expense.paymentMethod})\n`;
  });
  
  details += "\nTOTAL POR MÉTODO DE PAGAMENTO:\n";
  if (totals.dinheiro > 0) details += `- Dinheiro: R$ ${totals.dinheiro.toFixed(2)}\n`;
  if (totals.pix > 0) details += `- PIX: R$ ${totals.pix.toFixed(2)}\n`;
  if (totals.credito > 0) details += `- Cartão de Crédito: R$ ${totals.credito.toFixed(2)}\n`;
  if (totals.debito > 0) details += `- Cartão de Débito: R$ ${totals.debito.toFixed(2)}\n`;
  details += `\nAté o momento suas despesas diárias somam um total de: R$ ${totals.total.toFixed(2)}`;
  
  return details;
}

function generateMonthlySummary() {
  const currentMonth = moment().format('YYYY-MM');
  const expenses = readDataFile(EXPENSE_FILE).filter(expense => expense.date.startsWith(currentMonth));
  
  if (expenses.length === 0) {
    return "Ainda não foi adicionado nenhuma despesa no mês atual!";
  }
  
  // Calcular totais por método de pagamento
  const totals = {
    total: 0,
    dinheiro: 0,
    pix: 0,
    credito: 0,
    debito: 0
  };
  
  let details = "Aqui está seu Resumo Mensal.\n\n";
  
  expenses.forEach(expense => {
    const amount = expense.amount;
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
    
    details += `- ${moment(expense.date).format('DD/MM')}: ${expense.category} - ${expense.description} - R$ ${amount.toFixed(2)} (${expense.paymentMethod})\n`;
  });
  
  details += "\nTOTAL POR MÉTODO DE PAGAMENTO:\n";
  if (totals.dinheiro > 0) details += `- Dinheiro: R$ ${totals.dinheiro.toFixed(2)}\n`;
  if (totals.pix > 0) details