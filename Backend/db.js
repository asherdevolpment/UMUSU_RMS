const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

const dbName = process.env.DB_NAME || "umusu_rms";
const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || "Admin@123";

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: dbName,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
});

async function testConnection() {
  const [rows] = await pool.query("SELECT 1 AS ok");
  return rows;
}

async function initializeDatabase() {
  const setupConnection = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
  });

  await setupConnection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
  await setupConnection.end();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS campuses (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE,
      is_main BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS roles (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE,
      description VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(160) NOT NULL,
      email VARCHAR(190) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role_id INT UNSIGNED NOT NULL,
      campus_id INT UNSIGNED NOT NULL,
      office_title VARCHAR(160) NOT NULL DEFAULT 'General User',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id),
      CONSTRAINT fk_users_campus FOREIGN KEY (campus_id) REFERENCES campuses(id)
    )
  `);

  await ensureUserOfficeTitleColumn();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS role_office_titles (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      role_id INT UNSIGNED NOT NULL,
      title VARCHAR(160) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_role_title (role_id, title),
      CONSTRAINT fk_role_office_titles_role FOREIGN KEY (role_id) REFERENCES roles(id)
    )
  `);

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

  await seedBaseData();
}

async function ensureUserOfficeTitleColumn() {
  const [rows] = await pool.execute(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'office_title'
      LIMIT 1
    `,
    [dbName]
  );

  if (rows.length > 0) {
    return;
  }

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN office_title VARCHAR(160) NOT NULL DEFAULT 'General User'
    AFTER campus_id
  `);
}

async function seedBaseData() {
  const campuses = [
    ["Nkozi", true],
    ["Fort Portal", false],
    ["Rubaga", false],
    ["Ngetta", false],
    ["Masaka", false],
  ];

  const roles = [
    ["Admin", "Manages users, roles, campuses, and system setup"],
    ["Requester", "Creates and tracks requisitions"],
    ["Campus Approver", "Reviews campus-level requisitions before they move to main campus"],
    ["Union Approver", "Main campus UMUSU leaders who review requisitions from all campuses"],
    ["Dean of Students", "Reviews and recommends requisitions"],
    ["Finance Officer", "Performs finance office review"],
    ["Budget Officer", "Verifies budget and marks requests ready for payment"],
    ["Asset Officer", "Handles general asset requisitions"],
  ];

  const roleOfficeTitles = {
    Admin: ["System Administrator"],
    Requester: ["Student Requester", "Staff Requester"],
    "Campus Approver": [
      "Campus Director",
      "Union Governor",
      "Campus Secretary for Finance",
      "Campus Union Chairperson",
    ],
    "Union Approver": [
      "Union President",
      "Union Chairperson",
      "Union Secretary for Finance",
    ],
    "Dean of Students": ["Dean of Students"],
    "Finance Officer": ["CFO Office Officer", "Finance Office Reviewer"],
    "Budget Officer": ["Budget Office Verifier"],
    "Asset Officer": ["Estates / Asset Officer"],
  };

  for (const [name, isMain] of campuses) {
    await pool.execute(
      `
        INSERT INTO campuses (name, is_main)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE is_main = VALUES(is_main)
      `,
      [name, isMain]
    );
  }

  for (const [name, description] of roles) {
    await pool.execute(
      `
        INSERT INTO roles (name, description)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE description = VALUES(description)
      `,
      [name, description]
    );
  }

  for (const [roleName, titles] of Object.entries(roleOfficeTitles)) {
    const role = await getRoleByName(roleName);

    for (const title of titles) {
      await pool.execute(
        `
          INSERT INTO role_office_titles (role_id, title)
          VALUES (?, ?)
          ON DUPLICATE KEY UPDATE title = VALUES(title)
        `,
        [role.id, title]
      );
    }
  }

  const [existingAdmins] = await pool.execute(
    `
      SELECT users.id
      FROM users
      INNER JOIN roles ON roles.id = users.role_id
      WHERE roles.name = 'Admin'
      LIMIT 1
    `
  );

  if (existingAdmins.length > 0) {
    return;
  }

  const adminRole = await getRoleByName("Admin");
  const mainCampus = await getCampusByName("Nkozi");
  const passwordHash = await bcrypt.hash(defaultAdminPassword, 12);

  await pool.execute(
    `
      INSERT INTO users (full_name, email, password_hash, role_id, campus_id, office_title)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      "System Administrator",
      "admin@umusu.ac.ug",
      passwordHash,
      adminRole.id,
      mainCampus.id,
      "System Administrator",
    ]
  );
}

function mapNlpAnalysis(row) {
  return {
    id: row.id,
    text: row.source_text,
    summary: row.summary,
    keywords: JSON.parse(row.keywords_json || "[]"),
    category: row.category,
    createdAt: row.created_at,
  };
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
    createdAt: new Date().toISOString(),
  };
}

async function getNlpAnalyses() {
  const [rows] = await pool.query(`
    SELECT id, source_text, summary, keywords_json, category, created_at
    FROM nlp_analyses
    ORDER BY created_at DESC, id DESC
  `);

  return rows.map(mapNlpAnalysis);
}

function mapUser(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: {
      id: row.role_id,
      name: row.role_name,
    },
    campus: {
      id: row.campus_id,
      name: row.campus_name,
      isMain: Boolean(row.is_main),
    },
    officeTitle: row.office_title,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
  };
}

async function getRoleByName(name) {
  const [rows] = await pool.execute(
    "SELECT id, name, description FROM roles WHERE name = ? LIMIT 1",
    [name]
  );

  if (rows.length === 0) {
    throw new Error(`Role not found: ${name}`);
  }

  return rows[0];
}

async function getCampusByName(name) {
  const [rows] = await pool.execute(
    "SELECT id, name, is_main FROM campuses WHERE name = ? LIMIT 1",
    [name]
  );

  if (rows.length === 0) {
    throw new Error(`Campus not found: ${name}`);
  }

  return rows[0];
}

async function getRoles() {
  const [rows] = await pool.query(`
    SELECT id, name, description
    FROM roles
    ORDER BY id
  `);

  return rows;
}

async function createRole({ name, description }) {
  const [result] = await pool.execute(
    `
      INSERT INTO roles (name, description)
      VALUES (?, ?)
    `,
    [name, description]
  );

  return getRoleById(result.insertId);
}

async function getRoleById(id) {
  const [rows] = await pool.execute(
    "SELECT id, name, description FROM roles WHERE id = ? LIMIT 1",
    [id]
  );

  return rows[0] || null;
}

async function updateRole(id, { name, description }) {
  await pool.execute(
    `
      UPDATE roles
      SET name = ?, description = ?
      WHERE id = ?
    `,
    [name, description, id]
  );

  return getRoleById(id);
}

async function deleteRole(id) {
  const [users] = await pool.execute("SELECT id FROM users WHERE role_id = ? LIMIT 1", [id]);

  if (users.length > 0) {
    const error = new Error("Role is assigned to users");
    error.code = "ROLE_IN_USE";
    throw error;
  }

  await pool.execute("DELETE FROM role_office_titles WHERE role_id = ?", [id]);
  const [result] = await pool.execute("DELETE FROM roles WHERE id = ?", [id]);
  return result.affectedRows > 0;
}

async function getCampuses() {
  const [rows] = await pool.query(`
    SELECT id, name, is_main
    FROM campuses
    ORDER BY is_main DESC, name
  `);

  return rows.map((campus) => ({
    id: campus.id,
    name: campus.name,
    isMain: Boolean(campus.is_main),
  }));
}

async function createCampus({ name, isMain }) {
  if (isMain) {
    await pool.execute("UPDATE campuses SET is_main = FALSE");
  }

  const [result] = await pool.execute(
    `
      INSERT INTO campuses (name, is_main)
      VALUES (?, ?)
    `,
    [name, isMain]
  );

  return getCampusById(result.insertId);
}

async function getCampusById(id) {
  const [rows] = await pool.execute(
    "SELECT id, name, is_main FROM campuses WHERE id = ? LIMIT 1",
    [id]
  );

  if (rows.length === 0) {
    return null;
  }

  return {
    id: rows[0].id,
    name: rows[0].name,
    isMain: Boolean(rows[0].is_main),
  };
}

async function updateCampus(id, { name, isMain }) {
  if (isMain) {
    await pool.execute("UPDATE campuses SET is_main = FALSE WHERE id <> ?", [id]);
  }

  await pool.execute(
    `
      UPDATE campuses
      SET name = ?, is_main = ?
      WHERE id = ?
    `,
    [name, isMain, id]
  );

  return getCampusById(id);
}

async function deleteCampus(id) {
  const [users] = await pool.execute("SELECT id FROM users WHERE campus_id = ? LIMIT 1", [id]);

  if (users.length > 0) {
    const error = new Error("Campus is assigned to users");
    error.code = "CAMPUS_IN_USE";
    throw error;
  }

  const [result] = await pool.execute("DELETE FROM campuses WHERE id = ?", [id]);
  return result.affectedRows > 0;
}

async function getRoleOfficeTitles() {
  const [rows] = await pool.query(`
    SELECT
      role_office_titles.id,
      role_office_titles.role_id,
      roles.name AS role_name,
      role_office_titles.title,
      role_office_titles.created_at
    FROM role_office_titles
    INNER JOIN roles ON roles.id = role_office_titles.role_id
    ORDER BY roles.id, role_office_titles.title
  `);

  return rows.map((row) => ({
    id: row.id,
    roleId: row.role_id,
    roleName: row.role_name,
    title: row.title,
    createdAt: row.created_at,
  }));
}

async function createRoleOfficeTitle({ roleId, title }) {
  const [result] = await pool.execute(
    `
      INSERT INTO role_office_titles (role_id, title)
      VALUES (?, ?)
    `,
    [roleId, title]
  );

  return getRoleOfficeTitleById(result.insertId);
}

async function getRoleOfficeTitleById(id) {
  const [rows] = await pool.execute(
    `
      SELECT
        role_office_titles.id,
        role_office_titles.role_id,
        roles.name AS role_name,
        role_office_titles.title,
        role_office_titles.created_at
      FROM role_office_titles
      INNER JOIN roles ON roles.id = role_office_titles.role_id
      WHERE role_office_titles.id = ?
      LIMIT 1
    `,
    [id]
  );

  if (rows.length === 0) {
    return null;
  }

  return {
    id: rows[0].id,
    roleId: rows[0].role_id,
    roleName: rows[0].role_name,
    title: rows[0].title,
    createdAt: rows[0].created_at,
  };
}

async function updateRoleOfficeTitle(id, { roleId, title }) {
  await pool.execute(
    `
      UPDATE role_office_titles
      SET role_id = ?, title = ?
      WHERE id = ?
    `,
    [roleId, title, id]
  );

  return getRoleOfficeTitleById(id);
}

async function deleteRoleOfficeTitle(id) {
  const [result] = await pool.execute("DELETE FROM role_office_titles WHERE id = ?", [id]);
  return result.affectedRows > 0;
}

async function findUserByEmail(email) {
  const [rows] = await pool.execute(
    `
      SELECT
        users.id,
        users.full_name,
        users.email,
        users.password_hash,
        users.role_id,
        roles.name AS role_name,
        users.campus_id,
        campuses.name AS campus_name,
        campuses.is_main,
        users.office_title,
        users.is_active,
        users.created_at
      FROM users
      INNER JOIN roles ON roles.id = users.role_id
      INNER JOIN campuses ON campuses.id = users.campus_id
      WHERE users.email = ?
      LIMIT 1
    `,
    [email]
  );

  return rows[0] || null;
}

async function findUserById(id) {
  const [rows] = await pool.execute(
    `
      SELECT
        users.id,
        users.full_name,
        users.email,
        users.role_id,
        roles.name AS role_name,
        users.campus_id,
        campuses.name AS campus_name,
        campuses.is_main,
        users.office_title,
        users.is_active,
        users.created_at
      FROM users
      INNER JOIN roles ON roles.id = users.role_id
      INNER JOIN campuses ON campuses.id = users.campus_id
      WHERE users.id = ?
      LIMIT 1
    `,
    [id]
  );

  return rows.length > 0 ? mapUser(rows[0]) : null;
}

async function getUsers() {
  const [rows] = await pool.query(`
    SELECT
      users.id,
      users.full_name,
      users.email,
      users.role_id,
      roles.name AS role_name,
      users.campus_id,
      campuses.name AS campus_name,
      campuses.is_main,
      users.office_title,
      users.is_active,
      users.created_at
    FROM users
    INNER JOIN roles ON roles.id = users.role_id
    INNER JOIN campuses ON campuses.id = users.campus_id
    ORDER BY users.created_at DESC, users.id DESC
  `);

  return rows.map(mapUser);
}

async function createUser({ fullName, email, password, roleId, campusId, officeTitle }) {
  const passwordHash = await bcrypt.hash(password, 12);
  const [result] = await pool.execute(
    `
      INSERT INTO users (full_name, email, password_hash, role_id, campus_id, office_title)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [fullName, email, passwordHash, roleId, campusId, officeTitle]
  );

  return findUserById(result.insertId);
}

async function resetDefaultAdmin() {
  const adminRole = await getRoleByName("Admin");
  const mainCampus = await getCampusByName("Nkozi");
  const passwordHash = await bcrypt.hash(defaultAdminPassword, 12);

  await pool.execute(
    `
      INSERT INTO users (full_name, email, password_hash, role_id, campus_id, office_title, is_active)
      VALUES (?, ?, ?, ?, ?, ?, TRUE)
      ON DUPLICATE KEY UPDATE
        full_name = VALUES(full_name),
        password_hash = VALUES(password_hash),
        role_id = VALUES(role_id),
        campus_id = VALUES(campus_id),
        office_title = VALUES(office_title),
        is_active = TRUE
    `,
    [
      "System Administrator",
      "admin@umusu.ac.ug",
      passwordHash,
      adminRole.id,
      mainCampus.id,
      "System Administrator",
    ]
  );

  return findUserByEmail("admin@umusu.ac.ug");
}

async function updateUser(id, { fullName, roleId, campusId, isActive }) {
  await pool.execute(
    `
      UPDATE users
      SET full_name = ?, role_id = ?, campus_id = ?, is_active = ?
      WHERE id = ?
    `,
    [fullName, roleId, campusId, isActive, id]
  );

  return findUserById(id);
}

async function deleteUser(id) {
  const [result] = await pool.execute("DELETE FROM users WHERE id = ?", [id]);
  return result.affectedRows > 0;
}

module.exports = {
  createCampus,
  createRole,
  createRoleOfficeTitle,
  createUser,
  deleteCampus,
  deleteRole,
  deleteRoleOfficeTitle,
  deleteUser,
  findUserByEmail,
  findUserById,
  getCampuses,
  getNlpAnalyses,
  getRoleOfficeTitles,
  getRoles,
  getUsers,
  initializeDatabase,
  pool,
  resetDefaultAdmin,
  saveNlpAnalysis,
  testConnection,
  updateCampus,
  updateRole,
  updateRoleOfficeTitle,
  updateUser,
};
