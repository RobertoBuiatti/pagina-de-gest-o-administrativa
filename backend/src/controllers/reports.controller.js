const { getDb } = require('../database');

function getSummary(req, res) {
  const db = getDb();
  const { start, end, limit } = req.query;

  // Build optional date filters using COALESCE(date, date(created_at))
  const baseFilters = [];
  const params = [];
  if (start) {
    baseFilters.push("COALESCE(date, date(created_at)) >= ?");
    params.push(start);
  }
  if (end) {
    baseFilters.push("COALESCE(date, date(created_at)) <= ?");
    params.push(end);
  }
  const baseWhere = baseFilters.length ? `WHERE ${baseFilters.join(' AND ')}` : '';

  // Aggregate totals (respecting optional date range)
  const incomeFilters = baseFilters.slice();
  incomeFilters.push("amount > 0");
  const incomeWhere = `WHERE ${incomeFilters.join(' AND ')}`;
  const incomeRow = db.prepare(`SELECT SUM(amount) as income FROM transactions ${incomeWhere}`).get(...params);

  const expensesFilters = baseFilters.slice();
  expensesFilters.push("amount < 0");
  const expensesWhere = `WHERE ${expensesFilters.join(' AND ')}`;
  const expensesRow = db.prepare(`SELECT SUM(amount) as expenses FROM transactions ${expensesWhere}`).get(...params);

  const income = incomeRow && incomeRow.income ? incomeRow.income : 0;
  const expenses = Math.abs(expensesRow && expensesRow.expenses ? expensesRow.expenses : 0);
  const balance = income - expenses;

  // Timeseries: list transactions in chronological order within the same optional date range.
  const limitVal = Number(limit || 100);
  const timeseriesSql = `
    SELECT
      id,
      COALESCE(date, date(created_at)) as date,
      description,
      category,
      amount,
      created_at
    FROM transactions
    ${baseWhere}
    ORDER BY date ASC, created_at ASC
    LIMIT ?
  `;

  // Prepare parameters: date params (if any) followed by limit
  const stmtParams = params.slice(0);
  stmtParams.push(limitVal);

  const rows = db.prepare(timeseriesSql).all(...stmtParams);

  // Compute running balance for the series (cumulative) and derive type from amount
  let running = 0;
  const timeseries = (rows || []).map(r => {
    const val = Number(r.amount || 0);
    running += val;
    return {
      id: r.id,
      date: r.date,
      description: r.description,
      category: r.category,
      type: val >= 0 ? 'Entrada' : 'Saída',
      value: val,
      amount: val,
      balance: running
    };
  });

  res.json({ income, expenses, balance, timeseries });
}

function getAnalytics(req, res) {
  const db = getDb();
  const categories = db.prepare("SELECT category, SUM(amount) as amount FROM transactions GROUP BY category").all();
  
  // Corrigido: usar COALESCE sem date() para evitar NULL
  const timeseries = db.prepare(`
    SELECT 
      COALESCE(date, date(created_at)) as date, 
      SUM(amount) as income, 
      SUM(CASE WHEN amount<0 THEN amount ELSE 0 END) as expenses 
    FROM transactions 
    GROUP BY date 
    ORDER BY date DESC 
    LIMIT 30
  `).all().reverse().map(r => ({
    date: r.date,
    income: r.income || 0,
    expenses: Math.abs(r.expenses || 0)
  }));

  res.json({
    categories: categories.map(c => ({ name: c.category || 'Uncategorized', amount: c.amount || 0 })),
    timeseries
  });
}

function getDre(req, res) {
  const db = getDb();
  const { start, end } = req.query;

  // Filtros de data opcionais
  const baseFilters = [];
  const params = [];
  if (start) {
    baseFilters.push("COALESCE(date, date(created_at)) >= ?");
    params.push(start);
  }
  if (end) {
    baseFilters.push("COALESCE(date, date(created_at)) <= ?");
    params.push(end);
  }
  const baseWhere = baseFilters.length ? `WHERE ${baseFilters.join(' AND ')}` : '';

  // Buscar todas as transações agrupadas por categoria
  const sql = `
    SELECT 
      category,
      description,
      amount
    FROM transactions
    ${baseWhere}
    ORDER BY amount DESC
  `;

  const transactions = db.prepare(sql).all(...params);

  // Mapear transações para linhas do DRE
  const rows = transactions.map(t => {
    const valor = Number(t.amount || 0);
    let categoria = 'Outros';
    
    // Classificar baseado no valor e categoria
    if (valor > 0) {
      categoria = 'Receitas';
    } else if (t.category && t.category.toLowerCase().includes('custo')) {
      categoria = 'Custos';
    } else if (t.category && (
      t.category.toLowerCase().includes('despesa') ||
      t.category.toLowerCase().includes('administrativ') ||
      t.category.toLowerCase().includes('operacional')
    )) {
      categoria = 'Despesas Operacionais';
    } else if (t.category && (
      t.category.toLowerCase().includes('financ') ||
      t.category.toLowerCase().includes('jur')
    )) {
      categoria = 'Despesas Financeiras';
    } else if (valor < 0) {
      categoria = 'Despesas Operacionais';
    }

    return {
      categoria,
      descricao: t.description || t.category || 'Sem descrição',
      valor
    };
  });

  // Calcular totais
  const totalReceitas = rows
    .filter(r => r.valor > 0)
    .reduce((sum, r) => sum + r.valor, 0);
  
  const totalCustos = Math.abs(
    rows
      .filter(r => r.categoria === 'Custos')
      .reduce((sum, r) => sum + r.valor, 0)
  );
  
  const totalDespesas = Math.abs(
    rows
      .filter(r => 
        r.categoria === 'Despesas Operacionais' || 
        r.categoria === 'Despesas Financeiras'
      )
      .reduce((sum, r) => sum + r.valor, 0)
  );

  // Calcular indicadores do DRE
  const receitaOperacionalLiquida = totalReceitas;
  const lucroBruto = totalReceitas - totalCustos;
  const resultadoOperacional = lucroBruto - totalDespesas;
  
  // Provisão de IR simplificada (15% sobre lucro positivo)
  const provisaoIR = Math.max(0, resultadoOperacional * 0.15);
  const lucroLiquido = resultadoOperacional - provisaoIR;

  const summary = {
    receita_operacional_liquida: receitaOperacionalLiquida,
    lucro_bruto: lucroBruto,
    resultado_operacional: resultadoOperacional,
    lucro_liquido: lucroLiquido
  };

  res.json({ rows, summary });
}

module.exports = { getSummary, getAnalytics, getDre };
