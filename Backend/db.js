const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "umusu_rms",
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
});

async function testConnection() {
  const [rows] = await pool.query("SELECT 1 AS ok");
  return rows;
}

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nlp_analyses (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      source_text TEXT NOT NULL,
      summary TEXT NOT NULL,
      keywords_json TEXT NOT NULL,
      category VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function saveNlpAnalysis({ text, summary, keywords, category }) {
  const [result] = await pool.execute(
    `
      INSERT INTO nlp_analyses (source_text, summary, keywords_json, category)
      VALUES (?, ?, ?, ?)
    `,
    [text, summary, JSON.stringify(keywords), category]
  );

  return {
    id: result.insertId,
    text,
    summary,
    keywords,
    category,
  };
}

module.exports = {
  initializeDatabase,
  pool,
  saveNlpAnalysis,
  testConnection,
};
