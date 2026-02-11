// server.js (MySQL Hostinger)
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// --- MySQL pool ---
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// --- JWT ---
function createToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "2h" }
  );
}

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Token manquant" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token invalide" });
  }
}

function adminRequired(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Accès réservé à l'administrateur" });
  }
  next();
}

// --- Test ---
app.get("/", (req, res) => {
  res.json({ message: "API SAMA COURANT - SAMA TICKET fonctionne ✅" });
});

// --- Health DB ---
app.get("/api/health", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({ ok: true, db: rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- Ensure table (MySQL syntax) ---
async function ensureUsersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      firstname VARCHAR(100) NOT NULL,
      lastname VARCHAR(100) NOT NULL,
      email VARCHAR(191) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('user','admin') NOT NULL DEFAULT 'user',
      status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// ---------------------------------------------------------------------------
// 🔐 SETUP ADMIN (temporaire)
// POST /api/setup-admin
// Headers: x-setup-key: <SETUP_KEY>
// Body: { firstname, lastname, email, password }
// ---------------------------------------------------------------------------
app.post("/api/setup-admin", async (req, res) => {
  const setupKey = req.headers["x-setup-key"];

  if (!process.env.SETUP_KEY) {
    return res.status(500).json({ error: "SETUP_KEY manquant côté serveur" });
  }
  if (!setupKey || setupKey !== process.env.SETUP_KEY) {
    return res.status(403).json({ error: "Clé setup invalide" });
  }

  const { firstname, lastname, email, password } = req.body;
  if (!firstname || !lastname || !email || !password) {
    return res.status(400).json({ error: "Tous les champs sont obligatoires" });
  }

  try {
    await ensureUsersTable();

    const [existing] = await pool.query("SELECT id FROM users WHERE email=?", [email]);
    if (existing.length > 0) {
      return res.status(400).json({ error: "Cet e-mail est déjà utilisé" });
    }

    const hash = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO users (firstname, lastname, email, password_hash, role, status)
       VALUES (?, ?, ?, ?, 'admin', 'approved')`,
      [firstname, lastname, email, hash]
    );

    const [rows] = await pool.query(
      "SELECT id, firstname, lastname, email, role, status, created_at FROM users WHERE id=?",
      [result.insertId]
    );

    res.status(201).json({
      message: "Admin créé et approuvé ✅ (supprime ensuite cette route)",
      admin: rows[0],
    });
  } catch (err) {
    console.error("Erreur /api/setup-admin :", err);
    res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
});

// ---------------------------------------------------------------------------
// 1) REGISTER (pending)
// ---------------------------------------------------------------------------
app.post("/api/register", async (req, res) => {
  const { firstname, lastname, email, password } = req.body;
  if (!firstname || !lastname || !email || !password) {
    return res.status(400).json({ error: "Tous les champs sont obligatoires" });
  }

  try {
    await ensureUsersTable();

    const [existing] = await pool.query("SELECT id FROM users WHERE email=?", [email]);
    if (existing.length > 0) {
      return res.status(400).json({ error: "Cet e-mail est déjà utilisé" });
    }

    const hash = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO users (firstname, lastname, email, password_hash, role, status)
       VALUES (?, ?, ?, ?, 'user', 'pending')`,
      [firstname, lastname, email, hash]
    );

    const [rows] = await pool.query(
      "SELECT id, firstname, lastname, email, role, status, created_at FROM users WHERE id=?",
      [result.insertId]
    );

    res.status(201).json({
      message: "Demande d'inscription envoyée. En attente de validation par l'admin.",
      user: rows[0],
    });
  } catch (err) {
    console.error("Erreur /api/register :", err);
    res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
});

// ---------------------------------------------------------------------------
// 2) LOGIN (approved only)
// ---------------------------------------------------------------------------
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "E-mail et mot de passe requis" });
  }

  try {
    await ensureUsersTable();

    const [rows] = await pool.query("SELECT * FROM users WHERE email=?", [email]);
    if (rows.length === 0) {
      return res.status(400).json({ error: "Identifiants invalides" });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(400).json({ error: "Identifiants invalides" });

    if (user.status === "pending") {
      return res.status(403).json({ error: "Compte en attente de validation par l'admin" });
    }
    if (user.status === "rejected") {
      return res.status(403).json({ error: "Compte refusé par l'admin" });
    }

    const token = createToken(user);
    res.json({
      message: "Connexion réussie",
      token,
      user: {
        id: user.id,
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    });
  } catch (err) {
    console.error("Erreur /api/login :", err);
    res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
});

// ---------------------------------------------------------------------------
// 3) ADMIN list users
// ---------------------------------------------------------------------------
app.get("/api/admin/users", authRequired, adminRequired, async (req, res) => {
  const { status } = req.query;

  try {
    await ensureUsersTable();

    let sql = "SELECT id, firstname, lastname, email, role, status, created_at FROM users";
    const params = [];

    if (status) {
      sql += " WHERE status = ?";
      params.push(status);
    }
    sql += " ORDER BY created_at DESC";

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("Erreur /api/admin/users :", err);
    res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
});

// ---------------------------------------------------------------------------
// 4) ADMIN change status
// ---------------------------------------------------------------------------
app.patch("/api/admin/users/:id/status", authRequired, adminRequired, async (req, res) => {
  const userId = req.params.id;
  const { status } = req.body;

  if (!["pending", "approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "Statut invalide" });
  }

  try {
    await ensureUsersTable();

    const [result] = await pool.query(
      "UPDATE users SET status=? WHERE id=?",
      [status, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    const [rows] = await pool.query(
      "SELECT id, firstname, lastname, email, role, status FROM users WHERE id=?",
      [userId]
    );

    res.json({ message: "Statut mis à jour", user: rows[0] });
  } catch (err) {
    console.error("Erreur /api/admin/users/:id/status :", err);
    res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
});

app.listen(PORT, () => console.log(`Serveur SAMA COURANT lancé sur le port ${PORT}`));
