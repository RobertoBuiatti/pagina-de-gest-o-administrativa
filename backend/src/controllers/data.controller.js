const { getDb, reinitializeDb } = require('../database');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

 // Função auxiliar para obter o caminho correto do banco de dados
function getDbFilePath() {
  // __dirname está em backend/src/controllers — o arquivo data.sqlite está em backend/
  return path.join(__dirname, '..', '..', 'data.sqlite');
}

async function exportSql(req, res) {
  try {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.-]/g, '').slice(0, 15); // YYYYMMDDTHHMMSS
    const filename = `data-${timestamp}.sqlite`;
    const dbFilePath = getDbFilePath();
    res.download(dbFilePath, filename, (err) => {
      if (err) {
        console.error('Error downloading SQL file:', err);
        res.status(500).send('Error downloading database file.');
      }
    });
  } catch (error) {
    console.error('Error in exportSql:', error);
    res.status(500).json({ error: 'Failed to export SQL.' });
  }
}

async function exportXls(req, res) {
  try {
    const db = getDb();
    const transactions = db.prepare('SELECT amount, date, category, description, created_at FROM transactions').all();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Transactions');

    worksheet.columns = [
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Description', key: 'description', width: 30 },
      { header: 'Created At', key: 'created_at', width: 20 },
    ];

    transactions.forEach(transaction => {
      worksheet.addRow(transaction);
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=' + 'transactions.xlsx'
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error in exportXls:', error);
    res.status(500).json({ error: 'Failed to export XLS.' });
  }
}

async function importData(req, res) {
  console.log('Import data request received.');
  if (!req.files || req.files.length === 0) {
    console.log('No files uploaded.');
    return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  }

  const importResults = [];
  const dbFilePath = getDbFilePath();

  for (const file of req.files) {
    console.log('Processing file:', file);
    const filePath = file.path;
    const fileExtension = path.extname(file.originalname).toLowerCase();
    let message = '';
    let success = false;

    try {
      const db = getDb();
      if (fileExtension === '.sql') {
        console.log(`Attempting to read SQL file: ${file.originalname}`);
        const sqlContent = fs.readFileSync(filePath, 'utf8');
        const statements = sqlContent.split(';').filter(s => s.trim().length > 0);
        console.log(`Found ${statements.length} SQL statements.`);
        if (statements.length > 0) {
          db.transaction(() => {
            for (const stmt of statements) {
              try {
                db.exec(stmt);
                console.log('Executed SQL statement:', stmt.substring(0, 100) + '...');
              } catch (execError) {
                console.error('Error executing SQL statement:', stmt, execError);
                throw execError; // Re-throw to rollback transaction
              }
            }
          })();
          message = `Dados SQL de ${file.originalname} importados com sucesso.`;
          success = true;
        } else {
          message = `Nenhuma instrução SQL encontrada no arquivo ${file.originalname}.`;
          success = false;
        }
      } else if (fileExtension === '.xls' || fileExtension === '.xlsx') {
        console.log(`Attempting to read Excel file: ${file.originalname}`);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.getWorksheet(1); // Get the first worksheet
        console.log(`Worksheet 1 found with ${worksheet.actualRowCount} rows.`);

        const transactions = [];
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) { // Skip header row
            console.log('Skipping header row:', row.values);
            return;
          }
          const amount = row.getCell(1).value;
          const date = row.getCell(2).value;
          const category = row.getCell(3).value;
          const description = row.getCell(4).value;
          
          // Validação aprimorada - só adiciona linhas com dados válidos
          if (amount !== null && amount !== undefined && 
              date !== null && date !== undefined && 
              category !== null && category !== undefined && 
              description !== null && description !== undefined) {
            console.log(`Extracted row ${rowNumber}:`, { amount, date, category, description });
            transactions.push({ amount, date, category, description });
          } else {
            console.warn(`Row ${rowNumber} ignorada por dados incompletos:`, { amount, date, category, description });
          }
        });
        console.log(`Extracted ${transactions.length} transactions from Excel.`);

        if (transactions.length > 0) {
          db.transaction(() => {
            const stmt = db.prepare('INSERT INTO transactions (amount, date, category, description) VALUES (?, ?, ?, ?)');
            for (const transaction of transactions) {
              try {
                stmt.run(transaction.amount, transaction.date, transaction.category, transaction.description);
                console.log('Inserted transaction:', transaction);
              } catch (insertError) {
                console.error('Error inserting transaction:', transaction, insertError);
                throw insertError; // Re-throw to rollback transaction
              }
            }
          })();
          message = `Dados XLS de ${file.originalname} importados com sucesso.`;
          success = true;
        } else {
          message = `Nenhuma transação encontrada no arquivo XLS ${file.originalname}.`;
          success = false;
        }
      } else if (fileExtension === '.sqlite') {
        console.log(`Attempting to read SQLite file: ${file.originalname}`);
        const Database = require('better-sqlite3');
        const tempDb = new Database(filePath);
        const transactions = tempDb.prepare('SELECT * FROM transactions').all();
        console.log(`Found ${transactions.length} transactions in temporary SQLite file.`);
        
        if (transactions.length > 0) {
          const db = getDb();
          
          // Verificar se a estrutura da tabela é compatível
          try {
            const tempTableInfo = tempDb.pragma('table_info(transactions)');
            console.log('Estrutura da tabela no arquivo importado:', tempTableInfo);
          } catch (pragmaError) {
            console.warn('Não foi possível verificar estrutura da tabela:', pragmaError);
          }
          
          const stmt = db.prepare('INSERT OR IGNORE INTO transactions (id, amount, date, category, description, created_at) VALUES (@id, @amount, @date, @category, @description, @created_at)');
          
          db.transaction(() => {
            for (const transaction of transactions) {
              try {
                stmt.run(transaction);
                console.log('Inserted SQLite transaction:', transaction);
              } catch (insertError) {
                console.error('Error inserting SQLite transaction:', transaction, insertError);
                throw insertError; // Re-throw to rollback transaction
              }
            }
          })();
        }
        
        tempDb.close();
        message = `Dados do banco de dados ${file.originalname} importados com sucesso.`;
        success = true;
      } else {
        message = `Formato de arquivo não suportado para ${file.originalname}. Use .sql, .xls, .xlsx ou .sqlite.`;
        success = false;
      }
    } catch (error) {
      console.error(`Error processing file ${file.originalname}:`, error);
      message = `Erro ao importar ${file.originalname}: ${error.message}`; 
      success = false;
    } finally {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath); // Clean up the uploaded file
      }
      importResults.push({ filename: file.originalname, message, success });
    }
  }

  // Forçar sincronização do WAL para o arquivo principal
  try {
    const db = getDb();
    console.log('Executando checkpoint WAL para consolidar mudanças...');
    db.pragma('wal_checkpoint(TRUNCATE)');
    console.log('Checkpoint WAL concluído com sucesso.');
  } catch (walError) {
    console.error('Erro ao executar checkpoint WAL:', walError);
  }

  reinitializeDb(); // Force-close the current connection to ensure fresh data is read on next request
  
  console.log('Resultados finais da importação:', importResults);
  const allSuccess = importResults.every(result => result.success);
  if (allSuccess) {
    res.json({ message: 'Todos os arquivos importados com sucesso.', results: importResults });
  } else {
    res.status(400).json({ error: 'Alguns arquivos falharam na importação.', results: importResults });
  }
}

async function clearAll(req, res) {
  try {
    const db = getDb();
    // Deleta todas as linhas das tabelas principais em uma transação
    db.transaction(() => {
      db.prepare('DELETE FROM extractions').run();
      db.prepare('DELETE FROM transactions').run();
    })();

    // Reorganiza o banco para liberar espaço
    try {
      db.exec('VACUUM');
    } catch (vacuumError) {
      console.warn('VACUUM falhou ou não é necessário:', vacuumError);
    }

    // Reinitialize DB connection so other requests see the cleared state
    reinitializeDb();

    res.json({ message: 'Dados apagados com sucesso.' });
  } catch (error) {
    console.error('Error clearing data:', error);
    res.status(500).json({ error: 'Falha ao apagar dados.' });
  }
}

module.exports = { exportSql, exportXls, importData, clearAll };
