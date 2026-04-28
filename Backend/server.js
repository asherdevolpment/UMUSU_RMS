require("dotenv").config();

const bcrypt = require("bcryptjs");
const cors = require("cors");
const express = require("express");
const fs = require("fs");
const { createProxyMiddleware } = require("http-proxy-middleware");
const multer = require("multer");
const path = require("path");
const {
  addRequisitionDocument,
  createCampus,
  createRequisition,
  createBudgetItem,
  createRole,
  createRoleOfficeTitle,
  createUser,
  changeUserPassword,
  deleteCampus,
  deleteRole,
  deleteRoleOfficeTitle,
  deleteUser,
  findUserByEmail,
  findUserById,
  getAssetItems,
  getApproverRequisitions,
  getBudgetItemsForRequester,
  getBudgetItemsForOfficer,
  getCampuses,
  formatDatabaseConnectionError,
  getLoginAudits,
  getNlpAnalyses,
  getRequesterRequisitions,
  getRequisitionById,
  getRequisitionDocuments,
  getRequisitionEvents,
  getRoleOfficeTitles,
  getRoles,
  getUsers,
  initializeDatabase,
  resetDefaultAdmin,
  resetUserPassword,
  saveNlpAnalysis,
  saveLoginAudit,
  submitRequesterRequisition,
  testConnection,
  updateCampus,
  updateRequesterRequisition,
  updateRole,
  updateRoleOfficeTitle,
  updateUser,
} = require("./db");
const { createToken, requireAuth, requireRole } = require("./auth");

const app = express();
const port = Number(process.env.PORT || 5050);
const nlpServiceUrl = process.env.NLP_SERVICE_URL || "http://127.0.0.1:8000";
const uploadDirectory = path.join(__dirname, "uploads", "requisitions");
const allowedEmailDomains = (process.env.ALLOWED_EMAIL_DOMAINS || "umu.ac.ug")
  .split(",")
  .map((domain) => domain.trim().toLowerCase())
  .filter(Boolean);

app.use(cors());
app.use(express.json());
fs.mkdirSync(uploadDirectory, { recursive: true });

const allowedDocumentTypes = new Set([
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDirectory),
    filename: (req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeName}`);
    },
  }),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 6,
  },
  fileFilter: (req, file, cb) => {
    if (allowedDocumentTypes.has(file.mimetype)) {
      cb(null, true);
      return;
    }

    cb(new Error("Only PDF, XLS, XLSX, and CSV files are allowed"));
  },
});

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isAllowedUmuEmail(email) {
  const [, domain = ""] = email.toLowerCase().split("@");

  return allowedEmailDomains.some(
    (allowedDomain) => domain === allowedDomain || domain.endsWith(`.${allowedDomain}`)
  );
}

function isStrongPassword(password) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(password);
}

function generateTemporaryPassword() {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `Temp@${suffix}9A`;
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateBudgetItemPayload(body) {
  const officeTitle = cleanString(body.officeTitle);
  const budgetTitle = cleanString(body.budgetTitle);
  const academicYear = cleanString(body.academicYear);
  const termLabel = cleanString(body.termLabel);
  const semesterScope = cleanString(body.semesterScope);
  const sectionName = cleanString(body.sectionName);
  const itemName = cleanString(body.itemName);
  const totalAmount = toNumberOrNull(body.totalAmount);

  if (!officeTitle || !budgetTitle || !academicYear || !termLabel || !semesterScope || !sectionName || !itemName) {
    return { valid: false, message: "Budget, office, section, and item details are required" };
  }

  if (totalAmount === null || totalAmount < 0) {
    return { valid: false, message: "Total amount must be a valid number" };
  }

  return {
    valid: true,
    payload: {
      officeTitle,
      budgetTitle,
      academicYear,
      termLabel,
      semesterScope,
      sectionName,
      itemName,
      quantity: toNumberOrNull(body.quantity),
      unitCost: toNumberOrNull(body.unitCost),
      totalAmount,
      semesterLabel: cleanString(body.semesterLabel) || "Both semesters",
    },
  };
}

function validateRequisitionPayload(body) {
  const category = cleanString(body.category);
  const title = cleanString(body.title);
  const purpose = cleanString(body.purpose);

  if (!category || !title || !purpose) {
    return {
      valid: false,
      message: "Category, title, and purpose are required",
    };
  }

  return {
    valid: true,
    payload: {
      category,
      subcategory: cleanString(body.subcategory),
      title,
      purpose,
      amount: toNumberOrNull(body.amount),
      neededDate: cleanString(body.neededDate) || null,
      details: typeof body.details === "object" && body.details !== null ? body.details : {},
    },
  };
}

app.get("/", (req, res) => {
  res.send("UMUSU RMS Backend is running");
});

app.get("/api/status", (req, res) => {
  res.json({
    status: "ok",
    service: "UMUSU RMS API",
    port,
    allowedEmailDomains,
  });
});

app.get("/health/db", async (req, res) => {
  try {
    await testConnection();
    res.json({ status: "ok", database: process.env.DB_NAME || "umusu_rms" });
  } catch (error) {
    console.error("Database connection failed:", error.message);
    res.status(500).json({ status: "error", message: "Database connection failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = cleanString(req.body.email).toLowerCase();
    const password = typeof req.body.password === "string" ? req.body.password : "";

    if (!email || !password) {
      await saveLoginAudit({ email: email || "unknown", wasSuccessful: false, reason: "Missing credentials" });
      return res.status(400).json({ message: "Email and password are required" });
    }

    if (!isAllowedUmuEmail(email)) {
      await saveLoginAudit({ email, wasSuccessful: false, reason: "Invalid email domain" });
      return res.status(403).json({
        message: "Only Uganda Martyrs University email addresses can access UMUSU RMS",
      });
    }

    const userRecord = await findUserByEmail(email);

    if (!userRecord) {
      await saveLoginAudit({ email, wasSuccessful: false, reason: "User not found" });
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!userRecord.is_active) {
      await saveLoginAudit({ email, wasSuccessful: false, reason: "Inactive account" });
      return res.status(403).json({ message: "This account has been deactivated" });
    }

    const passwordMatches = await bcrypt.compare(password, userRecord.password_hash);

    if (!passwordMatches) {
      await saveLoginAudit({ email, wasSuccessful: false, reason: "Wrong password" });
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = await findUserById(userRecord.id);
    await saveLoginAudit({ email, wasSuccessful: true, reason: "Login successful" });
    res.json({ token: createToken(user), user });
  } catch (error) {
    console.error("Login failed:", error.message);
    res.status(500).json({ message: "Login failed" });
  }
});

app.post("/api/auth/change-password", requireAuth, async (req, res) => {
  try {
    const currentPassword = typeof req.body.currentPassword === "string" ? req.body.currentPassword : "";
    const newPassword = typeof req.body.newPassword === "string" ? req.body.newPassword : "";
    const currentUser = await findUserById(req.auth.sub);

    if (!currentUser || !currentUser.isActive) {
      return res.status(401).json({ message: "User not found or inactive" });
    }

    const userRecord = await findUserByEmail(currentUser.email);

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new password are required" });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        message: "Password must be at least 8 characters and include uppercase, lowercase, number, and symbol",
      });
    }

    const passwordMatches = await bcrypt.compare(currentPassword, userRecord.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    const user = await changeUserPassword(req.auth.sub, newPassword, false);
    res.json({ token: createToken(user), user });
  } catch (error) {
    console.error("Change password failed:", error.message);
    res.status(500).json({ message: "Change password failed" });
  }
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  const user = await findUserById(req.auth.sub);

  if (!user || !user.isActive) {
    return res.status(401).json({ message: "User not found or inactive" });
  }

  res.json(user);
});

app.post("/api/auth/reset-default-admin", async (req, res) => {
  try {
    const admin = await resetDefaultAdmin();
    res.json({ message: "Default admin reset", adminEmail: admin.email });
  } catch (error) {
    console.error("Default admin reset failed:", error.message);
    res.status(500).json({ message: "Default admin reset failed" });
  }
});

app.get("/api/admin/users", requireAuth, requireRole("Admin"), async (req, res) => {
  res.json(await getUsers());
});

app.post("/api/admin/users", requireAuth, requireRole("Admin"), async (req, res) => {
  try {
    const fullName = cleanString(req.body.fullName);
    const email = cleanString(req.body.email).toLowerCase();
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const roleId = Number(req.body.roleId);
    const campusId = Number(req.body.campusId);
    const officeTitle = cleanString(req.body.officeTitle) || "General User";

    if (!fullName || !email || !roleId || !campusId) {
      return res.status(400).json({ message: "Valid user details are required" });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message: "Temporary password must be at least 8 characters and include uppercase, lowercase, number, and symbol",
      });
    }

    if (!isAllowedUmuEmail(email)) {
      return res.status(400).json({
        message: "Use a valid Uganda Martyrs University email address",
      });
    }

    const user = await createUser({ fullName, email, password, roleId, campusId, officeTitle });
    res.status(201).json(user);
  } catch (error) {
    console.error("Create user failed:", error.message);
    res.status(500).json({ message: "Create user failed" });
  }
});

app.post("/api/admin/users/:id/reset-password", requireAuth, requireRole("Admin"), async (req, res) => {
  try {
    const temporaryPassword =
      typeof req.body.password === "string" && req.body.password
        ? req.body.password
        : generateTemporaryPassword();

    if (!isStrongPassword(temporaryPassword)) {
      return res.status(400).json({
        message: "Temporary password must be at least 8 characters and include uppercase, lowercase, number, and symbol",
      });
    }

    const user = await resetUserPassword(Number(req.params.id), temporaryPassword);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ user, temporaryPassword });
  } catch (error) {
    console.error("Reset password failed:", error.message);
    res.status(500).json({ message: "Reset password failed" });
  }
});

app.get("/api/admin/login-audits", requireAuth, requireRole("Admin"), async (req, res) => {
  res.json(await getLoginAudits());
});

app.patch("/api/admin/users/:id/status", requireAuth, requireRole("Admin"), async (req, res) => {
  const user = await findUserById(Number(req.params.id));

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const updatedUser = await updateUser(user.id, {
    fullName: user.fullName,
    roleId: user.role.id,
    campusId: user.campus.id,
    isActive: Boolean(req.body.isActive),
  });

  res.json(updatedUser);
});

app.delete("/api/admin/users/:id", requireAuth, requireRole("Admin"), async (req, res) => {
  const deleted = await deleteUser(Number(req.params.id));

  if (!deleted) {
    return res.status(404).json({ message: "User not found" });
  }

  res.status(204).send();
});

app.get("/api/admin/roles", requireAuth, requireRole("Admin"), async (req, res) => {
  res.json(await getRoles());
});

app.post("/api/admin/roles", requireAuth, requireRole("Admin"), async (req, res) => {
  const name = cleanString(req.body.name);
  const description = cleanString(req.body.description);

  if (!name || !description) {
    return res.status(400).json({ message: "Role name and description are required" });
  }

  res.status(201).json(await createRole({ name, description }));
});

app.patch("/api/admin/roles/:id", requireAuth, requireRole("Admin"), async (req, res) => {
  const name = cleanString(req.body.name);
  const description = cleanString(req.body.description);

  if (!name || !description) {
    return res.status(400).json({ message: "Role name and description are required" });
  }

  res.json(await updateRole(Number(req.params.id), { name, description }));
});

app.delete("/api/admin/roles/:id", requireAuth, requireRole("Admin"), async (req, res) => {
  try {
    const deleted = await deleteRole(Number(req.params.id));

    if (!deleted) {
      return res.status(404).json({ message: "Role not found" });
    }

    res.status(204).send();
  } catch (error) {
    res.status(error.code === "ROLE_IN_USE" ? 409 : 500).json({ message: error.message });
  }
});

app.get("/api/admin/campuses", requireAuth, requireRole("Admin"), async (req, res) => {
  res.json(await getCampuses());
});

app.post("/api/admin/campuses", requireAuth, requireRole("Admin"), async (req, res) => {
  const name = cleanString(req.body.name);

  if (!name) {
    return res.status(400).json({ message: "Campus name is required" });
  }

  res.status(201).json(await createCampus({ name, isMain: Boolean(req.body.isMain) }));
});

app.patch("/api/admin/campuses/:id", requireAuth, requireRole("Admin"), async (req, res) => {
  const name = cleanString(req.body.name);

  if (!name) {
    return res.status(400).json({ message: "Campus name is required" });
  }

  res.json(await updateCampus(Number(req.params.id), { name, isMain: Boolean(req.body.isMain) }));
});

app.delete("/api/admin/campuses/:id", requireAuth, requireRole("Admin"), async (req, res) => {
  try {
    const deleted = await deleteCampus(Number(req.params.id));

    if (!deleted) {
      return res.status(404).json({ message: "Campus not found" });
    }

    res.status(204).send();
  } catch (error) {
    res.status(error.code === "CAMPUS_IN_USE" ? 409 : 500).json({ message: error.message });
  }
});

app.get("/api/admin/role-office-titles", requireAuth, requireRole("Admin"), async (req, res) => {
  res.json(await getRoleOfficeTitles());
});

app.post("/api/admin/role-office-titles", requireAuth, requireRole("Admin"), async (req, res) => {
  const roleId = Number(req.body.roleId);
  const title = cleanString(req.body.title);

  if (!roleId || !title) {
    return res.status(400).json({ message: "Role and title are required" });
  }

  res.status(201).json(await createRoleOfficeTitle({ roleId, title }));
});

app.patch("/api/admin/role-office-titles/:id", requireAuth, requireRole("Admin"), async (req, res) => {
  const roleId = Number(req.body.roleId);
  const title = cleanString(req.body.title);

  if (!roleId || !title) {
    return res.status(400).json({ message: "Role and title are required" });
  }

  res.json(await updateRoleOfficeTitle(Number(req.params.id), { roleId, title }));
});

app.delete("/api/admin/role-office-titles/:id", requireAuth, requireRole("Admin"), async (req, res) => {
  const deleted = await deleteRoleOfficeTitle(Number(req.params.id));

  if (!deleted) {
    return res.status(404).json({ message: "Role category not found" });
  }

  res.status(204).send();
});

app.get("/api/requester/requisitions", requireAuth, requireRole("Requester"), async (req, res) => {
  res.json(await getRequesterRequisitions(req.auth.sub));
});

app.get("/api/requester/budget-items", requireAuth, requireRole("Requester"), async (req, res) => {
  res.json(await getBudgetItemsForRequester(req.auth.sub));
});

app.get("/api/budget/items", requireAuth, requireRole("Admin", "Budget Officer", "Finance Officer"), async (req, res) => {
  res.json(await getBudgetItemsForOfficer());
});

app.post("/api/budget/items", requireAuth, requireRole("Admin", "Budget Officer"), async (req, res) => {
  try {
    const validation = validateBudgetItemPayload(req.body);

    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    res.status(201).json(await createBudgetItem(validation.payload));
  } catch (error) {
    console.error("Create budget item failed:", error.message);
    res.status(500).json({ message: "Create budget item failed" });
  }
});

app.post("/api/requester/requisitions", requireAuth, requireRole("Requester"), async (req, res) => {
  try {
    const validation = validateRequisitionPayload(req.body);

    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    const user = await findUserById(req.auth.sub);
    const requisition = await createRequisition({
      requesterId: user.id,
      campusId: user.campus.id,
      ...validation.payload,
      submit: Boolean(req.body.submit),
    });

    res.status(201).json(requisition);
  } catch (error) {
    console.error("Create requisition failed:", error);
    res.status(500).json({
      message: "Create requisition failed",
      detail: process.env.NODE_ENV === "production" ? undefined : error.message,
      code: error.code,
    });
  }
});

app.patch("/api/requester/requisitions/:id", requireAuth, requireRole("Requester"), async (req, res) => {
  try {
    const validation = validateRequisitionPayload(req.body);

    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    const requisition = await updateRequesterRequisition(
      Number(req.params.id),
      req.auth.sub,
      validation.payload
    );

    if (!requisition) {
      return res.status(404).json({ message: "Requisition not found" });
    }

    res.json(requisition);
  } catch (error) {
    const status = error.code === "REQUISITION_LOCKED" ? 409 : 500;
    res.status(status).json({
      message: error.message,
      detail: process.env.NODE_ENV === "production" ? undefined : error.message,
      code: error.code,
    });
  }
});

app.post("/api/requester/requisitions/:id/submit", requireAuth, requireRole("Requester"), async (req, res) => {
  try {
    const requisitionId = Number(req.params.id);
    const existingRequisition = await getRequisitionById(requisitionId);

    if (!existingRequisition || existingRequisition.requester.id !== req.auth.sub) {
      return res.status(404).json({ message: "Requisition not found" });
    }

    const documents = await getRequisitionDocuments(requisitionId);
    const hasBudget = documents.some((document) => document.documentType === "Budget Spreadsheet");
    const hasPdf = documents.some((document) => document.documentType === "Supporting PDF");

    if (["activity", "petty-cash"].includes(existingRequisition.category) && !hasBudget) {
      return res.status(400).json({ message: "Upload a budget spreadsheet before submitting this requisition" });
    }

    if (existingRequisition.category === "petty-cash" && !hasPdf) {
      return res.status(400).json({ message: "Upload at least one supporting PDF before submitting petty cash" });
    }

    const requisition = await submitRequesterRequisition(requisitionId, req.auth.sub);

    if (!requisition) {
      return res.status(404).json({ message: "Requisition not found" });
    }

    res.json(requisition);
  } catch (error) {
    const status = error.code === "REQUISITION_ALREADY_SUBMITTED" ? 409 : 500;
    res.status(status).json({
      message: error.message,
      detail: process.env.NODE_ENV === "production" ? undefined : error.message,
      code: error.code,
    });
  }
});

app.get("/api/requester/requisitions/:id/documents", requireAuth, requireRole("Requester"), async (req, res) => {
  const requisition = await getRequisitionById(Number(req.params.id));

  if (!requisition || requisition.requester.id !== req.auth.sub) {
    return res.status(404).json({ message: "Requisition not found" });
  }

  res.json(await getRequisitionDocuments(requisition.id));
});

app.post(
  "/api/requester/requisitions/:id/documents",
  requireAuth,
  requireRole("Requester"),
  upload.fields([
    { name: "budget", maxCount: 1 },
    { name: "supporting", maxCount: 5 },
  ]),
  async (req, res) => {
    try {
      const requisition = await getRequisitionById(Number(req.params.id));

      if (!requisition || requisition.requester.id !== req.auth.sub) {
        return res.status(404).json({ message: "Requisition not found" });
      }

      if (!["Draft", "Returned"].includes(requisition.status)) {
        return res.status(409).json({ message: "Documents can only be added to draft or returned requisitions" });
      }

      const files = [
        ...(req.files?.budget || []).map((file) => ({ file, documentType: "Budget Spreadsheet" })),
        ...(req.files?.supporting || []).map((file) => ({ file, documentType: "Supporting PDF" })),
      ];

      if (files.length === 0) {
        return res.status(400).json({ message: "Select at least one document to upload" });
      }

      const documents = [];

      for (const item of files) {
        documents.push(
          await addRequisitionDocument({
            requisitionId: requisition.id,
            uploadedBy: req.auth.sub,
            documentType: item.documentType,
            originalName: item.file.originalname,
            storedName: item.file.filename,
            filePath: item.file.path,
            mimeType: item.file.mimetype,
            fileSize: item.file.size,
          })
        );
      }

      res.status(201).json(documents);
    } catch (error) {
      console.error("Upload documents failed:", error.message);
      res.status(500).json({ message: error.message || "Upload documents failed" });
    }
  }
);

app.get("/api/requester/requisitions/:id/events", requireAuth, requireRole("Requester"), async (req, res) => {
  const requisition = await getRequisitionById(Number(req.params.id));

  if (!requisition || requisition.requester.id !== req.auth.sub) {
    return res.status(404).json({ message: "Requisition not found" });
  }

  res.json(await getRequisitionEvents(requisition.id));
});

app.get("/api/assets/items", requireAuth, async (req, res) => {
  res.json(await getAssetItems());
});

app.get("/api/approver/requisitions", requireAuth, async (req, res) => {
  res.json(await getApproverRequisitions());
});

app.get("/api/nlp/analyses", requireAuth, async (req, res) => {
  res.json(await getNlpAnalyses());
});

app.post("/api/nlp/analyze", requireAuth, async (req, res) => {
  try {
    const text = cleanString(req.body?.text);

    if (!text) {
      return res.status(400).json({ message: "Text is required" });
    }

    const nlpResponse = await fetch(`${nlpServiceUrl}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!nlpResponse.ok) {
      return res.status(502).json({ message: "NLP service failed" });
    }

    const analysis = await nlpResponse.json();
    const savedAnalysis = await saveNlpAnalysis({
      text,
      summary: String(analysis.summary || ""),
      keywords: Array.isArray(analysis.keywords) ? analysis.keywords : [],
      category: String(analysis.category || "Uncategorized"),
    });

    res.status(201).json(savedAnalysis);
  } catch (error) {
    console.error("NLP analysis failed:", error.message);
    res.status(500).json({ message: "NLP analysis failed" });
  }
});

app.use(
  "/api/nlp",
  createProxyMiddleware({
    target: nlpServiceUrl,
    changeOrigin: true,
    pathRewrite: { "^/api/nlp": "" },
  })
);

app.use(express.static(path.join(__dirname, "../dist")));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "../dist/index.html"));
});

initializeDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`UMUSU RMS API running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database:");
    console.error(formatDatabaseConnectionError(error));
    if (process.env.NODE_ENV !== "production") {
      console.error(`Original error code: ${error.code || "UNKNOWN"}`);
    }
    process.exit(1);
  });
