require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { initializeDatabase, saveNlpAnalysis, testConnection } = require("./db");
const { createProxyMiddleware } = require("http-proxy-middleware");
const path = require("path");

const app = express();
const port = Number(process.env.PORT || 5000);
const nlpServiceUrl = process.env.NLP_SERVICE_URL || "http://127.0.0.1:8000";

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("UMUSU RMS Backend is running");
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
app.use("/api/nlp", createProxyMiddleware({
  target: "http://localhost:8000", // Flask server
  changeOrigin: true,
  pathRewrite: { "^/api/nlp": "" }
}));;

// Serve Angular static files (after build)
app.use(express.static(path.join(__dirname, '../dist')));

// Fallback: serve Angular index.html for any other route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Gateway running on port ${PORT}`);
});
