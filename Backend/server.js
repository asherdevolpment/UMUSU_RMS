require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { createToken, requireAuth, requireRole } = require("./auth");
const {
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
  saveNlpAnalysis,
  testConnection,
  updateCampus,
  updateRole,
  updateRoleOfficeTitle,
  updateUser,
} = require("./db");
const { createProxyMiddleware } = require("http-proxy-middleware");
const path = require("path");

const app = express();
const port = Number(process.env.PORT || 5000);
const nlpServiceUrl = process.env.NLP_SERVICE_URL || "http://127.0.0.1:8000";
const clientBuildPath = path.join(__dirname, "../dist/URMS/browser");

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("UMUSU RMS Backend is running");
});

app.get("/api/status", (req, res) => {
  res.json({
    status: "ok",
    service: "UMUSU RMS Backend",
  });
});

app.get("/health/db", async (req, res) => {
  try {
    await testConnection();
    res.json({ status: "ok", database: process.env.DB_NAME || "umusu_rms" });
  } catch (error) {
    console.error("Database connection failed:", error.message);
    res.status(500).json({
      status: "error",
      message: "Database connection failed",
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const userRecord = await findUserByEmail(email);

    if (!userRecord || !userRecord.is_active) {
      return res.status(401).json({ message: "Invalid login details" });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      userRecord.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid login details" });
    }

    const user = await findUserById(userRecord.id);
    const token = createToken(user);

    res.json({ token, user });
  } catch (error) {
    console.error("Login failed:", error.message);
    res.status(500).json({ message: "Login failed" });
  }
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  try {
    const user = await findUserById(req.auth.sub);

    if (!user || !user.isActive) {
      return res.status(401).json({ message: "User account is not active" });
    }

    res.json(user);
  } catch (error) {
    console.error("Failed to load current user:", error.message);
    res.status(500).json({ message: "Failed to load current user" });
  }
});

app.get(
  "/api/admin/users",
  requireAuth,
  requireRole("Admin"),
  async (req, res) => {
    try {
      const users = await getUsers();
      res.json(users);
    } catch (error) {
      console.error("Failed to load users:", error.message);
      res.status(500).json({ message: "Failed to load users" });
    }
  }
);

app.post(
  "/api/admin/users",
  requireAuth,
  requireRole("Admin"),
  async (req, res) => {
    try {
      const fullName =
        typeof req.body?.fullName === "string" ? req.body.fullName.trim() : "";
      const email =
        typeof req.body?.email === "string"
          ? req.body.email.trim().toLowerCase()
          : "";
      const password =
        typeof req.body?.password === "string" ? req.body.password : "";
      const roleId = Number(req.body?.roleId);
      const campusId = Number(req.body?.campusId);
      const officeTitle =
        typeof req.body?.officeTitle === "string"
          ? req.body.officeTitle.trim()
          : "";

      if (!fullName || !email || !password || !roleId || !campusId || !officeTitle) {
        return res.status(400).json({ message: "All user fields are required" });
      }

      if (password.length < 8) {
        return res
          .status(400)
          .json({ message: "Password must be at least 8 characters" });
      }

      const user = await createUser({
        fullName,
        email,
        password,
        roleId,
        campusId,
        officeTitle,
      });

      res.status(201).json(user);
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: "Email is already registered" });
      }

      console.error("Failed to create user:", error.message);
      res.status(500).json({ message: "Failed to create user" });
    }
  }
);

app.patch(
  "/api/admin/users/:id",
  requireAuth,
  requireRole("Admin"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const fullName =
        typeof req.body?.fullName === "string" ? req.body.fullName.trim() : "";
      const roleId = Number(req.body?.roleId);
      const campusId = Number(req.body?.campusId);
      const isActive = Boolean(req.body?.isActive);

      if (!id || !fullName || !roleId || !campusId) {
        return res.status(400).json({ message: "Valid user fields are required" });
      }

      const user = await updateUser(id, {
        fullName,
        roleId,
        campusId,
        isActive,
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(user);
    } catch (error) {
      console.error("Failed to update user:", error.message);
      res.status(500).json({ message: "Failed to update user" });
    }
  }
);

app.patch(
  "/api/admin/users/:id/status",
  requireAuth,
  requireRole("Admin"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const isActive = Boolean(req.body?.isActive);
      const existingUser = await findUserById(id);

      if (id === Number(req.auth.sub) && !isActive) {
        return res.status(400).json({ message: "You cannot deactivate your own account" });
      }

      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const user = await updateUser(id, {
        fullName: existingUser.fullName,
        roleId: existingUser.role.id,
        campusId: existingUser.campus.id,
        isActive,
      });

      res.json(user);
    } catch (error) {
      console.error("Failed to update user status:", error.message);
      res.status(500).json({ message: "Failed to update user status" });
    }
  }
);

app.delete(
  "/api/admin/users/:id",
  requireAuth,
  requireRole("Admin"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (!id) {
        return res.status(400).json({ message: "Valid user id is required" });
      }

      if (id === Number(req.auth.sub)) {
        return res.status(400).json({ message: "You cannot delete your own account" });
      }

      const deleted = await deleteUser(id);

      if (!deleted) {
        return res.status(404).json({ message: "User not found" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Failed to delete user:", error.message);
      res.status(500).json({ message: "Failed to delete user" });
    }
  }
);

app.get(
  "/api/admin/roles",
  requireAuth,
  requireRole("Admin"),
  async (req, res) => {
    try {
      const roles = await getRoles();
      res.json(roles);
    } catch (error) {
      console.error("Failed to load roles:", error.message);
      res.status(500).json({ message: "Failed to load roles" });
    }
  }
);

app.post(
  "/api/admin/roles",
  requireAuth,
  requireRole("Admin"),
  async (req, res) => {
    try {
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      const description =
        typeof req.body?.description === "string" ? req.body.description.trim() : "";

      if (!name || !description) {
        return res.status(400).json({ message: "Role name and description are required" });
      }

      const role = await createRole({ name, description });
      res.status(201).json(role);
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: "Role already exists" });
      }

      console.error("Failed to create role:", error.message);
      res.status(500).json({ message: "Failed to create role" });
    }
  }
);

app.patch(
  "/api/admin/roles/:id",
  requireAuth,
  requireRole("Admin"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      const description =
        typeof req.body?.description === "string" ? req.body.description.trim() : "";

      if (!id || !name || !description) {
        return res.status(400).json({ message: "Valid role details are required" });
      }

      const role = await updateRole(id, { name, description });

      if (!role) {
        return res.status(404).json({ message: "Role not found" });
      }

      res.json(role);
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: "Role already exists" });
      }

      console.error("Failed to update role:", error.message);
      res.status(500).json({ message: "Failed to update role" });
    }
  }
);

app.delete(
  "/api/admin/roles/:id",
  requireAuth,
  requireRole("Admin"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (!id) {
        return res.status(400).json({ message: "Valid role id is required" });
      }

      const deleted = await deleteRole(id);

      if (!deleted) {
        return res.status(404).json({ message: "Role not found" });
      }

      res.status(204).send();
    } catch (error) {
      if (error.code === "ROLE_IN_USE" || error.code === "ER_ROW_IS_REFERENCED_2") {
        return res.status(409).json({ message: "Role is assigned to users and cannot be deleted" });
      }

      console.error("Failed to delete role:", error.message);
      res.status(500).json({ message: "Failed to delete role" });
    }
  }
);

app.get(
  "/api/admin/role-office-titles",
  requireAuth,
  requireRole("Admin"),
  async (req, res) => {
    try {
      const titles = await getRoleOfficeTitles();
      res.json(titles);
    } catch (error) {
      console.error("Failed to load role office titles:", error.message);
      res.status(500).json({ message: "Failed to load role office titles" });
    }
  }
);

app.post(
  "/api/admin/role-office-titles",
  requireAuth,
  requireRole("Admin"),
  async (req, res) => {
    try {
      const roleId = Number(req.body?.roleId);
      const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";

      if (!roleId || !title) {
        return res.status(400).json({ message: "Role and title are required" });
      }

      const officeTitle = await createRoleOfficeTitle({ roleId, title });
      res.status(201).json(officeTitle);
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: "Office title already exists for this role" });
      }

      console.error("Failed to create role office title:", error.message);
      res.status(500).json({ message: "Failed to create role office title" });
    }
  }
);

app.patch(
  "/api/admin/role-office-titles/:id",
  requireAuth,
  requireRole("Admin"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const roleId = Number(req.body?.roleId);
      const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";

      if (!id || !roleId || !title) {
        return res.status(400).json({ message: "Valid office title details are required" });
      }

      const officeTitle = await updateRoleOfficeTitle(id, { roleId, title });

      if (!officeTitle) {
        return res.status(404).json({ message: "Office title not found" });
      }

      res.json(officeTitle);
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: "Office title already exists for this role" });
      }

      console.error("Failed to update role office title:", error.message);
      res.status(500).json({ message: "Failed to update role office title" });
    }
  }
);

app.delete(
  "/api/admin/role-office-titles/:id",
  requireAuth,
  requireRole("Admin"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (!id) {
        return res.status(400).json({ message: "Valid office title id is required" });
      }

      const deleted = await deleteRoleOfficeTitle(id);

      if (!deleted) {
        return res.status(404).json({ message: "Office title not found" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Failed to delete role office title:", error.message);
      res.status(500).json({ message: "Failed to delete role office title" });
    }
  }
);

app.get(
  "/api/admin/campuses",
  requireAuth,
  requireRole("Admin"),
  async (req, res) => {
    try {
      const campuses = await getCampuses();
      res.json(campuses);
    } catch (error) {
      console.error("Failed to load campuses:", error.message);
      res.status(500).json({ message: "Failed to load campuses" });
    }
  }
);

app.post(
  "/api/admin/campuses",
  requireAuth,
  requireRole("Admin"),
  async (req, res) => {
    try {
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      const isMain = Boolean(req.body?.isMain);

      if (!name) {
        return res.status(400).json({ message: "Campus name is required" });
      }

      const campus = await createCampus({ name, isMain });
      res.status(201).json(campus);
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: "Campus already exists" });
      }

      console.error("Failed to create campus:", error.message);
      res.status(500).json({ message: "Failed to create campus" });
    }
  }
);

app.patch(
  "/api/admin/campuses/:id",
  requireAuth,
  requireRole("Admin"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      const isMain = Boolean(req.body?.isMain);

      if (!id || !name) {
        return res.status(400).json({ message: "Valid campus details are required" });
      }

      const campus = await updateCampus(id, { name, isMain });

      if (!campus) {
        return res.status(404).json({ message: "Campus not found" });
      }

      res.json(campus);
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: "Campus already exists" });
      }

      console.error("Failed to update campus:", error.message);
      res.status(500).json({ message: "Failed to update campus" });
    }
  }
);

app.delete(
  "/api/admin/campuses/:id",
  requireAuth,
  requireRole("Admin"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (!id) {
        return res.status(400).json({ message: "Valid campus id is required" });
      }

      const deleted = await deleteCampus(id);

      if (!deleted) {
        return res.status(404).json({ message: "Campus not found" });
      }

      res.status(204).send();
    } catch (error) {
      if (error.code === "CAMPUS_IN_USE" || error.code === "ER_ROW_IS_REFERENCED_2") {
        return res
          .status(409)
          .json({ message: "Campus is assigned to users and cannot be deleted" });
      }

      console.error("Failed to delete campus:", error.message);
      res.status(500).json({ message: "Failed to delete campus" });
    }
  }
);

app.get("/api/nlp/analyses", async (req, res) => {
  try {
    const analyses = await getNlpAnalyses();
    res.json(analyses);
  } catch (error) {
    console.error("Failed to load NLP analyses:", error.message);
    res.status(500).json({
      message: "Failed to load NLP analyses",
    });
  }
});

app.post("/api/nlp/analyze", async (req, res) => {
  try {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";

    if (!text) {
      return res.status(400).json({ message: "Text is required" });
    }

    const nlpResponse = await fetch(`${nlpServiceUrl}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!nlpResponse.ok) {
      return res.status(502).json({
        message: "NLP service failed",
      });
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
    res.status(500).json({
      message: "NLP analysis failed",
    });
  }
});

// Proxy NLP API requests to Flask
app.use(
  "/api/nlp",
  createProxyMiddleware({
    target: nlpServiceUrl,
    changeOrigin: true,
    pathRewrite: { "^/api/nlp": "" },
  })
);

// Serve Angular static files (after build)
app.use(express.static(clientBuildPath));

// Fallback: serve Angular index.html for any other route
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(clientBuildPath, "index.html"));
});

async function startServer() {
  try {
    await initializeDatabase();

    app.listen(port, () => {
      console.log(`UMUSU RMS Backend running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start backend:", error.message);
    process.exit(1);
  }
}

startServer();
