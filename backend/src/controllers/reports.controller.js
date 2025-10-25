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

module.exports = { getSummary, getAnalytics };
