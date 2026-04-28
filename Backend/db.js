const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

const dbName = process.env.DB_NAME || "umusu_rms";
const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || "Admin@123";
const defaultAdminEmail = process.env.DEFAULT_ADMIN_EMAIL || "admin@umu.ac.ug";
const databaseConfig = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: dbName,
};

const pool = mysql.createPool({
  ...databaseConfig,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
});

function formatDatabaseConnectionError(error) {
  const target = `${databaseConfig.host}:${databaseConfig.port}`;

  if (error.code === "ECONNREFUSED") {
    return [
      `Could not connect to MySQL at ${target}.`,
      "Start your MySQL/MariaDB server, or update DB_HOST and DB_PORT in Backend/.env to match the server you are using.",
      `Current database: ${databaseConfig.database}, user: ${databaseConfig.user}`,
    ].join("\n");
  }

  if (error.code === "ER_ACCESS_DENIED_ERROR") {
    return [
      `MySQL rejected the login for user "${databaseConfig.user}".`,
      "Check DB_USER and DB_PASSWORD in Backend/.env.",
    ].join("\n");
  }

  if (error.code === "ER_BAD_DB_ERROR") {
    return [
      `MySQL database "${databaseConfig.database}" was not found.`,
      "The app normally creates it during startup, so also check that the configured user has permission to create databases.",
    ].join("\n");
  }

  return error.message;
}

async function testConnection() {
  const [rows] = await pool.query("SELECT 1 AS ok");
  return rows;
}

async function initializeDatabase() {
  const setupConnection = await mysql.createConnection({
    host: databaseConfig.host,
    port: databaseConfig.port,
    user: databaseConfig.user,
    password: databaseConfig.password,
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
      must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id),
      CONSTRAINT fk_users_campus FOREIGN KEY (campus_id) REFERENCES campuses(id)
    )
  `);

  await ensureUserOfficeTitleColumn();
  await ensureUserMustChangePasswordColumn();

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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS requisitions (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      reference_no VARCHAR(40) NOT NULL UNIQUE,
      requester_id INT UNSIGNED NOT NULL,
      campus_id INT UNSIGNED NOT NULL,
      category VARCHAR(80) NOT NULL,
      subcategory VARCHAR(120) NULL,
      title VARCHAR(180) NOT NULL,
      purpose TEXT NOT NULL,
      amount DECIMAL(14, 2) NULL,
      needed_date DATE NULL,
      details_json TEXT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'Draft',
      current_step VARCHAR(120) NOT NULL DEFAULT 'Requester Draft',
      submitted_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_requisitions_requester FOREIGN KEY (requester_id) REFERENCES users(id),
      CONSTRAINT fk_requisitions_campus FOREIGN KEY (campus_id) REFERENCES campuses(id)
    )
  `);
  await ensureRequisitionDetailsColumn();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS requisition_events (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      requisition_id INT UNSIGNED NOT NULL,
      actor_id INT UNSIGNED NOT NULL,
      event_type VARCHAR(60) NOT NULL,
      note VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_requisition_events_requisition FOREIGN KEY (requisition_id) REFERENCES requisitions(id) ON DELETE CASCADE,
      CONSTRAINT fk_requisition_events_actor FOREIGN KEY (actor_id) REFERENCES users(id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS requisition_documents (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      requisition_id INT UNSIGNED NOT NULL,
      uploaded_by INT UNSIGNED NOT NULL,
      document_type VARCHAR(80) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      stored_name VARCHAR(255) NOT NULL,
      file_path VARCHAR(500) NOT NULL,
      mime_type VARCHAR(120) NOT NULL,
      file_size INT UNSIGNED NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_requisition_documents_requisition FOREIGN KEY (requisition_id) REFERENCES requisitions(id) ON DELETE CASCADE,
      CONSTRAINT fk_requisition_documents_user FOREIGN KEY (uploaded_by) REFERENCES users(id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS login_audits (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(190) NOT NULL,
      was_successful BOOLEAN NOT NULL,
      reason VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS asset_items (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      asset_type VARCHAR(80) NOT NULL,
      manager_office VARCHAR(160) NOT NULL,
      total_quantity INT UNSIGNED NOT NULL DEFAULT 1,
      available_quantity INT UNSIGNED NOT NULL DEFAULT 1,
      status VARCHAR(40) NOT NULL DEFAULT 'Available',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS budgets (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      office_title VARCHAR(160) NOT NULL,
      title VARCHAR(180) NOT NULL,
      academic_year VARCHAR(40) NOT NULL,
      term_label VARCHAR(80) NOT NULL,
      semester_scope VARCHAR(80) NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'Approved',
      approved_by VARCHAR(160) NOT NULL DEFAULT 'Union Council',
      approved_at DATE NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_budget_office_term (office_title, title, academic_year, term_label)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS budget_items (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      budget_id INT UNSIGNED NOT NULL,
      section_name VARCHAR(180) NOT NULL,
      item_name VARCHAR(220) NOT NULL,
      quantity DECIMAL(14, 2) NULL,
      unit_cost DECIMAL(14, 2) NULL,
      total_amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
      semester_label VARCHAR(80) NOT NULL DEFAULT 'Both semesters',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_budget_item (budget_id, section_name, item_name),
      CONSTRAINT fk_budget_items_budget FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE
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

async function ensureUserMustChangePasswordColumn() {
  const [rows] = await pool.execute(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'must_change_password'
      LIMIT 1
    `,
    [dbName]
  );

  if (rows.length > 0) {
    return;
  }

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT TRUE
    AFTER office_title
  `);
}

async function ensureRequisitionDetailsColumn() {
  const [rows] = await pool.execute(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = 'requisitions'
        AND COLUMN_NAME = 'details_json'
      LIMIT 1
    `,
    [dbName]
  );

  if (rows.length > 0) {
    return;
  }

  await pool.query(`
    ALTER TABLE requisitions
    ADD COLUMN details_json TEXT NULL
    AFTER needed_date
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
    Requester: [
      "Student Requester",
      "Staff Requester",
      "Secretary for Community and Cultural Affairs",
    ],
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
  const assetItems = [
    {
      name: "University Vehicle Fleet",
      assetType: "Vehicle",
      managerOffice: "Estates Office",
      totalQuantity: 3,
      availableQuantity: 3,
    },
    {
      name: "Event Tents",
      assetType: "Tent",
      managerOffice: "Union Vice President",
      totalQuantity: 10,
      availableQuantity: 10,
    },
    {
      name: "Plastic Chairs",
      assetType: "Chair",
      managerOffice: "Union Vice President",
      totalQuantity: 200,
      availableQuantity: 200,
    },
    {
      name: "Sports Equipment Set",
      assetType: "Sports Equipment",
      managerOffice: "Union Vice President",
      totalQuantity: 25,
      availableQuantity: 25,
    },
  ];
  const cultureBudgetItems = [
    {
      sectionName: "Cultural Week/Festival - Friday Entertainment",
      itemName: "Comedian/Musician",
      quantity: 1,
      unitCost: 1500000,
      totalAmount: 1500000,
    },
    {
      sectionName: "Cultural Week/Festival - Saturday Entertainment",
      itemName: "Musician",
      quantity: 1,
      unitCost: 1500000,
      totalAmount: 1500000,
    },
    {
      sectionName: "Cultural Week/Festival - General Items",
      itemName: "Coffee cups for the last day",
      quantity: 400,
      unitCost: 2500,
      totalAmount: 1000000,
    },
    {
      sectionName: "Cultural Week/Festival - General Items",
      itemName: "Public address system for 3 days",
      quantity: 8,
      unitCost: 700000,
      totalAmount: 5600000,
    },
    {
      sectionName: "Cultural Week/Festival - General Items",
      itemName: "Tents",
      quantity: 2,
      unitCost: 500000,
      totalAmount: 1000000,
    },
    {
      sectionName: "Cultural Week/Festival - General Items",
      itemName: "Chairs",
      quantity: 10,
      unitCost: 100000,
      totalAmount: 1000000,
    },
    {
      sectionName: "Cultural Week/Festival - General Items",
      itemName: "Decoration",
      quantity: 900,
      unitCost: 500,
      totalAmount: 450000,
    },
    {
      sectionName: "Cultural Week/Festival - General Items",
      itemName: "Carpet",
      quantity: 1,
      unitCost: 500000,
      totalAmount: 500000,
    },
    {
      sectionName: "Cultural Week/Festival - General Items",
      itemName: "Cake",
      quantity: 1,
      unitCost: 200000,
      totalAmount: 200000,
    },
    {
      sectionName: "Cultural Week/Festival - General Items",
      itemName: "Cultural Banner",
      quantity: 1,
      unitCost: 350000,
      totalAmount: 350000,
    },
    {
      sectionName: "Cultural Week/Festival - General Items",
      itemName: "Masters of Ceremonies",
      quantity: 2,
      unitCost: 150000,
      totalAmount: 300000,
    },
    {
      sectionName: "Cultural Week/Festival - General Items",
      itemName: "Others",
      quantity: 4,
      unitCost: 50000,
      totalAmount: 200000,
    },
    {
      sectionName: "Cultural Week/Festival - Accommodation for judges",
      itemName: "Facilitation for 3 judges amidst the week",
      quantity: 3,
      unitCost: 50000,
      totalAmount: 150000,
    },
    {
      sectionName: "Cultural Week/Festival - Accommodation for judges",
      itemName: "Transport",
      quantity: 4,
      unitCost: 60000,
      totalAmount: 240000,
    },
    {
      sectionName: "Cultural Week/Festival - Accommodation for judges",
      itemName: "Representatives from UMU Campuses",
      quantity: null,
      unitCost: null,
      totalAmount: 150000,
    },
  ];

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

  for (const asset of assetItems) {
    const [existingAssets] = await pool.execute("SELECT id FROM asset_items WHERE name = ? LIMIT 1", [
      asset.name,
    ]);

    if (existingAssets.length > 0) {
      await pool.execute(
        `
          UPDATE asset_items
          SET asset_type = ?,
            manager_office = ?,
            total_quantity = ?,
            available_quantity = LEAST(available_quantity, ?)
          WHERE id = ?
        `,
        [
          asset.assetType,
          asset.managerOffice,
          asset.totalQuantity,
          asset.totalQuantity,
          existingAssets[0].id,
        ]
      );
      continue;
    }

    await pool.execute(
      `
        INSERT INTO asset_items (name, asset_type, manager_office, total_quantity, available_quantity)
        VALUES (?, ?, ?, ?, ?)
      `,
      [asset.name, asset.assetType, asset.managerOffice, asset.totalQuantity, asset.availableQuantity]
    );
  }

  const [budgetResult] = await pool.execute(
    `
      INSERT INTO budgets (
        office_title,
        title,
        academic_year,
        term_label,
        semester_scope,
        status,
        approved_by
      )
      VALUES (?, ?, ?, ?, ?, 'Approved', 'Union Council')
      ON DUPLICATE KEY UPDATE
        semester_scope = VALUES(semester_scope),
        status = 'Approved',
        approved_by = VALUES(approved_by)
    `,
    [
      "Secretary for Community and Cultural Affairs",
      "Secretariat for Community and Cultural Affairs Budget",
      "2025/2026",
      "Term of Office",
      "Semester One and Semester Two",
    ]
  );

  const budgetId =
    budgetResult.insertId ||
    (
      await pool.execute(
        `
          SELECT id
          FROM budgets
          WHERE office_title = ?
            AND title = ?
            AND academic_year = ?
            AND term_label = ?
          LIMIT 1
        `,
        [
          "Secretary for Community and Cultural Affairs",
          "Secretariat for Community and Cultural Affairs Budget",
          "2025/2026",
          "Term of Office",
        ]
      )
    )[0][0].id;

  for (const item of cultureBudgetItems) {
    await pool.execute(
      `
        INSERT INTO budget_items (
          budget_id,
          section_name,
          item_name,
          quantity,
          unit_cost,
          total_amount,
          semester_label
        )
        VALUES (?, ?, ?, ?, ?, ?, 'Both semesters')
        ON DUPLICATE KEY UPDATE
          quantity = VALUES(quantity),
          unit_cost = VALUES(unit_cost),
          total_amount = VALUES(total_amount),
          semester_label = VALUES(semester_label),
          is_active = TRUE
      `,
      [
        budgetId,
        item.sectionName,
        item.itemName,
        item.quantity,
        item.unitCost,
        item.totalAmount,
      ]
    );
  }

  await ensureDefaultAdminUser();
}

async function ensureDefaultAdminUser() {
  const [defaultAdminRows] = await pool.execute(
    "SELECT id FROM users WHERE email = ? LIMIT 1",
    [defaultAdminEmail]
  );

  if (defaultAdminRows.length > 0) {
    return;
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

  if (existingAdmins.length > 0 && defaultAdminEmail !== "admin@umu.ac.ug") {
    return;
  }

  const adminRole = await getRoleByName("Admin");
  const mainCampus = await getCampusByName("Nkozi");
  const passwordHash = await bcrypt.hash(defaultAdminPassword, 12);

  await pool.execute(
    `
      INSERT INTO users (full_name, email, password_hash, role_id, campus_id, office_title, must_change_password)
      VALUES (?, ?, ?, ?, ?, ?, FALSE)
    `,
    [
      "System Administrator",
      defaultAdminEmail,
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
    mustChangePassword: Boolean(row.must_change_password),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
  };
}

function mapRequisition(row) {
  return {
    id: row.id,
    referenceNo: row.reference_no,
    requester: {
      id: row.requester_id,
      fullName: row.requester_name,
      email: row.requester_email,
    },
    campus: {
      id: row.campus_id,
      name: row.campus_name,
      isMain: Boolean(row.is_main),
    },
    category: row.category,
    subcategory: row.subcategory,
    title: row.title,
    purpose: row.purpose,
    amount: row.amount === null ? null : Number(row.amount),
    neededDate: row.needed_date,
    details: JSON.parse(row.details_json || "{}"),
    status: row.status,
    currentStep: row.current_step,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRequisitionEvent(row) {
  return {
    id: row.id,
    requisitionId: row.requisition_id,
    eventType: row.event_type,
    note: row.note,
    actor: {
      id: row.actor_id,
      fullName: row.actor_name,
    },
    createdAt: row.created_at,
  };
}

function mapRequisitionDocument(row) {
  return {
    id: row.id,
    requisitionId: row.requisition_id,
    uploadedBy: row.uploaded_by,
    documentType: row.document_type,
    originalName: row.original_name,
    storedName: row.stored_name,
    filePath: row.file_path,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    createdAt: row.created_at,
  };
}

function mapAssetItem(row) {
  return {
    id: row.id,
    name: row.name,
    assetType: row.asset_type,
    managerOffice: row.manager_office,
    totalQuantity: Number(row.total_quantity),
    availableQuantity: Number(row.available_quantity),
    status: row.status,
    createdAt: row.created_at,
  };
}

function mapBudgetItem(row) {
  return {
    id: row.id,
    budgetId: row.budget_id,
    budgetTitle: row.budget_title,
    officeTitle: row.office_title,
    academicYear: row.academic_year,
    termLabel: row.term_label,
    semesterScope: row.semester_scope,
    approvedBy: row.approved_by,
    sectionName: row.section_name,
    itemName: row.item_name,
    quantity: row.quantity === null ? null : Number(row.quantity),
    unitCost: row.unit_cost === null ? null : Number(row.unit_cost),
    totalAmount: Number(row.total_amount),
    semesterLabel: row.semester_label,
  };
}

async function getAssetItems() {
  const [rows] = await pool.query(`
    SELECT id, name, asset_type, manager_office, total_quantity, available_quantity, status, created_at
    FROM asset_items
    ORDER BY asset_type, name
  `);

  return rows.map(mapAssetItem);
}

async function getBudgetItemsForRequester(requesterId) {
  const user = await findUserById(requesterId);

  if (!user) {
    return [];
  }

  const [rows] = await pool.execute(
    `
      SELECT
        budget_items.id,
        budget_items.budget_id,
        budgets.title AS budget_title,
        budgets.office_title,
        budgets.academic_year,
        budgets.term_label,
        budgets.semester_scope,
        budgets.approved_by,
        budget_items.section_name,
        budget_items.item_name,
        budget_items.quantity,
        budget_items.unit_cost,
        budget_items.total_amount,
        budget_items.semester_label
      FROM budget_items
      INNER JOIN budgets ON budgets.id = budget_items.budget_id
      WHERE budget_items.is_active = TRUE
        AND budgets.status = 'Approved'
        AND (
          budgets.office_title = ?
          OR ? IN ('Requester', 'Student Requester', 'Staff Requester')
        )
      ORDER BY budgets.office_title, budget_items.section_name, budget_items.item_name
    `,
    [user.officeTitle, user.officeTitle]
  );

  return rows.map(mapBudgetItem);
}

async function getBudgetItemsForOfficer() {
  const [rows] = await pool.query(
    `
      SELECT
        budget_items.id,
        budget_items.budget_id,
        budgets.title AS budget_title,
        budgets.office_title,
        budgets.academic_year,
        budgets.term_label,
        budgets.semester_scope,
        budgets.approved_by,
        budget_items.section_name,
        budget_items.item_name,
        budget_items.quantity,
        budget_items.unit_cost,
        budget_items.total_amount,
        budget_items.semester_label
      FROM budget_items
      INNER JOIN budgets ON budgets.id = budget_items.budget_id
      WHERE budget_items.is_active = TRUE
      ORDER BY budgets.office_title, budget_items.section_name, budget_items.item_name
    `
  );

  return rows.map(mapBudgetItem);
}

async function createBudgetItem({
  officeTitle,
  budgetTitle,
  academicYear,
  termLabel,
  semesterScope,
  sectionName,
  itemName,
  quantity,
  unitCost,
  totalAmount,
  semesterLabel,
}) {
  const [budgetResult] = await pool.execute(
    `
      INSERT INTO budgets (
        office_title,
        title,
        academic_year,
        term_label,
        semester_scope,
        status,
        approved_by
      )
      VALUES (?, ?, ?, ?, ?, 'Approved', 'Union Council')
      ON DUPLICATE KEY UPDATE
        semester_scope = VALUES(semester_scope),
        status = 'Approved',
        approved_by = VALUES(approved_by)
    `,
    [officeTitle, budgetTitle, academicYear, termLabel, semesterScope]
  );

  const budgetId =
    budgetResult.insertId ||
    (
      await pool.execute(
        `
          SELECT id
          FROM budgets
          WHERE office_title = ?
            AND title = ?
            AND academic_year = ?
            AND term_label = ?
          LIMIT 1
        `,
        [officeTitle, budgetTitle, academicYear, termLabel]
      )
    )[0][0].id;

  const [itemResult] = await pool.execute(
    `
      INSERT INTO budget_items (
        budget_id,
        section_name,
        item_name,
        quantity,
        unit_cost,
        total_amount,
        semester_label
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        quantity = VALUES(quantity),
        unit_cost = VALUES(unit_cost),
        total_amount = VALUES(total_amount),
        semester_label = VALUES(semester_label),
        is_active = TRUE
    `,
    [
      budgetId,
      sectionName,
      itemName,
      quantity ?? null,
      unitCost ?? null,
      totalAmount,
      semesterLabel || "Both semesters",
    ]
  );

  const itemId =
    itemResult.insertId ||
    (
      await pool.execute(
        `
          SELECT id
          FROM budget_items
          WHERE budget_id = ?
            AND section_name = ?
            AND item_name = ?
          LIMIT 1
        `,
        [budgetId, sectionName, itemName]
      )
    )[0][0].id;

  const [rows] = await pool.execute(
    `
      SELECT
        budget_items.id,
        budget_items.budget_id,
        budgets.title AS budget_title,
        budgets.office_title,
        budgets.academic_year,
        budgets.term_label,
        budgets.semester_scope,
        budgets.approved_by,
        budget_items.section_name,
        budget_items.item_name,
        budget_items.quantity,
        budget_items.unit_cost,
        budget_items.total_amount,
        budget_items.semester_label
      FROM budget_items
      INNER JOIN budgets ON budgets.id = budget_items.budget_id
      WHERE budget_items.id = ?
      LIMIT 1
    `,
    [itemId]
  );

  return rows.length > 0 ? mapBudgetItem(rows[0]) : null;
}

async function createRequisitionEvent({ requisitionId, actorId, eventType, note }) {
  await pool.execute(
    `
      INSERT INTO requisition_events (requisition_id, actor_id, event_type, note)
      VALUES (?, ?, ?, ?)
    `,
    [requisitionId, actorId, eventType, note]
  );
}

async function generateRequisitionReference() {
  const year = new Date().getFullYear();
  const [rows] = await pool.execute(
    `
      SELECT COUNT(*) AS total
      FROM requisitions
      WHERE YEAR(created_at) = ?
    `,
    [year]
  );
  const nextNumber = Number(rows[0].total || 0) + 1;

  return `UMUSU-${year}-${String(nextNumber).padStart(4, "0")}`;
}

async function getRequisitionById(id) {
  const [rows] = await pool.execute(
    `
      SELECT
        requisitions.id,
        requisitions.reference_no,
        requisitions.requester_id,
        users.full_name AS requester_name,
        users.email AS requester_email,
        requisitions.campus_id,
        campuses.name AS campus_name,
        campuses.is_main,
        requisitions.category,
        requisitions.subcategory,
        requisitions.title,
        requisitions.purpose,
        requisitions.amount,
        requisitions.needed_date,
        requisitions.details_json,
        requisitions.status,
        requisitions.current_step,
        requisitions.submitted_at,
        requisitions.created_at,
        requisitions.updated_at
      FROM requisitions
      INNER JOIN users ON users.id = requisitions.requester_id
      INNER JOIN campuses ON campuses.id = requisitions.campus_id
      WHERE requisitions.id = ?
      LIMIT 1
    `,
    [id]
  );

  return rows.length > 0 ? mapRequisition(rows[0]) : null;
}

async function getRequesterRequisitions(requesterId) {
  const [rows] = await pool.execute(
    `
      SELECT
        requisitions.id,
        requisitions.reference_no,
        requisitions.requester_id,
        users.full_name AS requester_name,
        users.email AS requester_email,
        requisitions.campus_id,
        campuses.name AS campus_name,
        campuses.is_main,
        requisitions.category,
        requisitions.subcategory,
        requisitions.title,
        requisitions.purpose,
        requisitions.amount,
        requisitions.needed_date,
        requisitions.details_json,
        requisitions.status,
        requisitions.current_step,
        requisitions.submitted_at,
        requisitions.created_at,
        requisitions.updated_at
      FROM requisitions
      INNER JOIN users ON users.id = requisitions.requester_id
      INNER JOIN campuses ON campuses.id = requisitions.campus_id
      WHERE requisitions.requester_id = ?
      ORDER BY requisitions.updated_at DESC, requisitions.id DESC
    `,
    [requesterId]
  );

  return rows.map(mapRequisition);
}

async function getApproverRequisitions() {
  const [rows] = await pool.query(
    `
      SELECT
        requisitions.id,
        requisitions.reference_no,
        requisitions.requester_id,
        users.full_name AS requester_name,
        users.email AS requester_email,
        requisitions.campus_id,
        campuses.name AS campus_name,
        campuses.is_main,
        requisitions.category,
        requisitions.subcategory,
        requisitions.title,
        requisitions.purpose,
        requisitions.amount,
        requisitions.needed_date,
        requisitions.details_json,
        requisitions.status,
        requisitions.current_step,
        requisitions.submitted_at,
        requisitions.created_at,
        requisitions.updated_at
      FROM requisitions
      INNER JOIN users ON users.id = requisitions.requester_id
      INNER JOIN campuses ON campuses.id = requisitions.campus_id
      WHERE requisitions.status <> 'Draft'
      ORDER BY requisitions.submitted_at DESC, requisitions.updated_at DESC, requisitions.id DESC
    `
  );

  return rows.map(mapRequisition);
}

async function getRequisitionEvents(requisitionId) {
  const [rows] = await pool.execute(
    `
      SELECT
        requisition_events.id,
        requisition_events.requisition_id,
        requisition_events.actor_id,
        users.full_name AS actor_name,
        requisition_events.event_type,
        requisition_events.note,
        requisition_events.created_at
      FROM requisition_events
      INNER JOIN users ON users.id = requisition_events.actor_id
      WHERE requisition_events.requisition_id = ?
      ORDER BY requisition_events.created_at ASC, requisition_events.id ASC
    `,
    [requisitionId]
  );

  return rows.map(mapRequisitionEvent);
}

async function addRequisitionDocument({
  requisitionId,
  uploadedBy,
  documentType,
  originalName,
  storedName,
  filePath,
  mimeType,
  fileSize,
}) {
  const [result] = await pool.execute(
    `
      INSERT INTO requisition_documents (
        requisition_id,
        uploaded_by,
        document_type,
        original_name,
        stored_name,
        file_path,
        mime_type,
        file_size
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [requisitionId, uploadedBy, documentType, originalName, storedName, filePath, mimeType, fileSize]
  );

  await createRequisitionEvent({
    requisitionId,
    actorId: uploadedBy,
    eventType: "Document Uploaded",
    note: `${documentType}: ${originalName}`,
  });

  return getRequisitionDocumentById(result.insertId);
}

async function getRequisitionDocumentById(id) {
  const [rows] = await pool.execute(
    `
      SELECT id, requisition_id, uploaded_by, document_type, original_name, stored_name, file_path, mime_type, file_size, created_at
      FROM requisition_documents
      WHERE id = ?
      LIMIT 1
    `,
    [id]
  );

  return rows.length > 0 ? mapRequisitionDocument(rows[0]) : null;
}

async function getRequisitionDocuments(requisitionId) {
  const [rows] = await pool.execute(
    `
      SELECT id, requisition_id, uploaded_by, document_type, original_name, stored_name, file_path, mime_type, file_size, created_at
      FROM requisition_documents
      WHERE requisition_id = ?
      ORDER BY created_at DESC, id DESC
    `,
    [requisitionId]
  );

  return rows.map(mapRequisitionDocument);
}

async function createRequisition({
  requesterId,
  campusId,
  category,
  subcategory,
  title,
  purpose,
  amount,
  neededDate,
  details,
  submit,
}) {
  const referenceNo = await generateRequisitionReference();
  const status = submit ? "Submitted" : "Draft";
  const currentStep = submit ? "Awaiting First Review" : "Requester Draft";
  const submittedAtExpression = submit ? "CURRENT_TIMESTAMP" : "NULL";

  const [result] = await pool.execute(
    `
      INSERT INTO requisitions (
        reference_no,
        requester_id,
        campus_id,
        category,
        subcategory,
        title,
        purpose,
        amount,
        needed_date,
        details_json,
        status,
        current_step,
        submitted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${submittedAtExpression})
    `,
    [
      referenceNo,
      requesterId,
      campusId,
      category,
      subcategory || null,
      title,
      purpose,
      amount ?? null,
      neededDate || null,
      JSON.stringify(details || {}),
      status,
      currentStep,
    ]
  );

  await createRequisitionEvent({
    requisitionId: result.insertId,
    actorId: requesterId,
    eventType: submit ? "Submitted" : "Draft Created",
    note: submit ? "Requester submitted the requisition." : "Requester saved the requisition as a draft.",
  });

  return getRequisitionById(result.insertId);
}

async function updateRequesterRequisition(
  id,
  requesterId,
  { category, subcategory, title, purpose, amount, neededDate, details }
) {
  const requisition = await getRequisitionById(id);

  if (!requisition || requisition.requester.id !== requesterId) {
    return null;
  }

  if (!["Draft", "Returned"].includes(requisition.status)) {
    const error = new Error("Only draft or returned requisitions can be edited");
    error.code = "REQUISITION_LOCKED";
    throw error;
  }

  await pool.execute(
    `
      UPDATE requisitions
      SET
        category = ?,
        subcategory = ?,
        title = ?,
        purpose = ?,
        amount = ?,
        needed_date = ?,
        details_json = ?
      WHERE id = ? AND requester_id = ?
    `,
    [
      category,
      subcategory || null,
      title,
      purpose,
      amount ?? null,
      neededDate || null,
      JSON.stringify(details || {}),
      id,
      requesterId,
    ]
  );

  await createRequisitionEvent({
    requisitionId: id,
    actorId: requesterId,
    eventType: "Draft Updated",
    note: "Requester updated the requisition details.",
  });

  return getRequisitionById(id);
}

async function submitRequesterRequisition(id, requesterId) {
  const requisition = await getRequisitionById(id);

  if (!requisition || requisition.requester.id !== requesterId) {
    return null;
  }

  if (!["Draft", "Returned"].includes(requisition.status)) {
    const error = new Error("Requisition has already been submitted");
    error.code = "REQUISITION_ALREADY_SUBMITTED";
    throw error;
  }

  await pool.execute(
    `
      UPDATE requisitions
      SET status = 'Submitted',
        current_step = 'Awaiting First Review',
        submitted_at = CURRENT_TIMESTAMP
      WHERE id = ? AND requester_id = ?
    `,
    [id, requesterId]
  );

  await createRequisitionEvent({
    requisitionId: id,
    actorId: requesterId,
    eventType: "Submitted",
    note: "Requester submitted the requisition for review.",
  });

  return getRequisitionById(id);
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
        users.must_change_password,
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
        users.must_change_password,
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
      users.must_change_password,
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

async function changeUserPassword(id, password, mustChangePassword = false) {
  const passwordHash = await bcrypt.hash(password, 12);

  await pool.execute(
    `
      UPDATE users
      SET password_hash = ?,
        must_change_password = ?
      WHERE id = ?
    `,
    [passwordHash, mustChangePassword, id]
  );

  return findUserById(id);
}

async function resetUserPassword(id, password) {
  return changeUserPassword(id, password, true);
}

async function saveLoginAudit({ email, wasSuccessful, reason }) {
  await pool.execute(
    `
      INSERT INTO login_audits (email, was_successful, reason)
      VALUES (?, ?, ?)
    `,
    [email, wasSuccessful, reason]
  );
}

async function getLoginAudits() {
  const [rows] = await pool.query(`
    SELECT id, email, was_successful, reason, created_at
    FROM login_audits
    ORDER BY created_at DESC, id DESC
    LIMIT 100
  `);

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    wasSuccessful: Boolean(row.was_successful),
    reason: row.reason,
    createdAt: row.created_at,
  }));
}

async function resetDefaultAdmin() {
  const adminRole = await getRoleByName("Admin");
  const mainCampus = await getCampusByName("Nkozi");
  const passwordHash = await bcrypt.hash(defaultAdminPassword, 12);

  await pool.execute(
    `
      INSERT INTO users (full_name, email, password_hash, role_id, campus_id, office_title, must_change_password, is_active)
      VALUES (?, ?, ?, ?, ?, ?, FALSE, TRUE)
      ON DUPLICATE KEY UPDATE
        full_name = VALUES(full_name),
        password_hash = VALUES(password_hash),
        role_id = VALUES(role_id),
        campus_id = VALUES(campus_id),
        office_title = VALUES(office_title),
        must_change_password = FALSE,
        is_active = TRUE
    `,
    [
      "System Administrator",
      defaultAdminEmail,
      passwordHash,
      adminRole.id,
      mainCampus.id,
      "System Administrator",
    ]
  );

  return findUserByEmail(defaultAdminEmail);
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
  databaseConfig,
  addRequisitionDocument,
  createRole,
  createRoleOfficeTitle,
  createRequisition,
  createBudgetItem,
  createUser,
  changeUserPassword,
  deleteCampus,
  deleteRole,
  deleteRoleOfficeTitle,
  deleteUser,
  findUserByEmail,
  findUserById,
  getCampuses,
  getAssetItems,
  getBudgetItemsForRequester,
  getBudgetItemsForOfficer,
  getNlpAnalyses,
  getLoginAudits,
  getApproverRequisitions,
  getRequesterRequisitions,
  getRequisitionById,
  getRequisitionDocuments,
  getRequisitionEvents,
  getRoleOfficeTitles,
  getRoles,
  getUsers,
  initializeDatabase,
  formatDatabaseConnectionError,
  pool,
  resetDefaultAdmin,
  resetUserPassword,
  saveNlpAnalysis,
  saveLoginAudit,
  testConnection,
  updateCampus,
  updateRequesterRequisition,
  updateRole,
  updateRoleOfficeTitle,
  submitRequesterRequisition,
  updateUser,
};
