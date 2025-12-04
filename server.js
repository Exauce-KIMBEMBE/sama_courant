// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 4000;

// --- Middlewares globaux ---
app.use(cors());
app.use(express.json());

// --- Connexion PostgreSQL ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

// --- Helper: création token JWT ---
function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      email: user.email
    },
    process.env.JWT_SECRET,
    { expiresIn: "2h" }
  );
}

// --- Middleware: auth obligatoire ---
function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Token manquant" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, role, email }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token invalide" });
  }
}

// --- Middleware: admin obligatoire ---
function adminRequired(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Accès réservé à l'administrateur" });
  }
  next();
}

// --- Route de test ---
app.get("/", (req, res) => {
  res.json({ message: "API SAMA COURANT - SAMA TICKET fonctionne ✅" });
});

// ---------------------------------------------------------------------------
// 1) INSCRIPTION: demande en attente (status = 'pending')
// ---------------------------------------------------------------------------
app.post("/api/register", async (req, res) => {
  const { firstname, lastname, email, password } = req.body;

  if (!firstname || !lastname || !email || !password) {
    return res.status(400).json({ error: "Tous les champs sont obligatoires" });
  }

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Cet e-mail est déjà utilisé" });
    }

    const hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (firstname, lastname, email, password_hash, role, status)
       VALUES ($1, $2, $3, $4, 'user', 'pending')
       RETURNING id, firstname, lastname, email, role, status, created_at`,
      [firstname, lastname, email, hash]
    );

    res.status(201).json({
      message: "Demande d'inscription envoyée. En attente de validation par l'admin.",
      user: result.rows[0]
    });
  } catch (err) {
    console.error("Erreur /api/register :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ---------------------------------------------------------------------------
// 2) CONNEXION: seulement si status = 'approved'
// ---------------------------------------------------------------------------
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "E-mail et mot de passe requis" });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Identifiants invalides" });
    }

    const user = result.rows[0];

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(400).json({ error: "Identifiants invalides" });
    }

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
        status: user.status
      }
    });
  } catch (err) {
    console.error("Erreur /api/login :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ---------------------------------------------------------------------------
// 3) ADMIN: lister les utilisateurs (optionnel ?status=pending/approved...)
// ---------------------------------------------------------------------------
app.get("/api/admin/users", authRequired, adminRequired, async (req, res) => {
  const { status } = req.query;

  try {
    let query = "SELECT id, firstname, lastname, email, role, status, created_at FROM users";
    const params = [];

    if (status) {
      query += " WHERE status = $1";
      params.push(status);
    }

    query += " ORDER BY created_at DESC";

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("Erreur /api/admin/users :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ---------------------------------------------------------------------------
// 4) ADMIN: changer le statut d'un utilisateur
// ---------------------------------------------------------------------------
app.patch("/api/admin/users/:id/status", authRequired, adminRequired, async (req, res) => {
  const userId = req.params.id;
  const { status } = req.body;

  if (!["pending", "approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "Statut invalide" });
  }

  try {
    const result = await pool.query(
      "UPDATE users SET status = $1 WHERE id = $2 RETURNING id, firstname, lastname, email, role, status",
      [status, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    res.json({
      message: "Statut mis à jour",
      user: result.rows[0]
    });
  } catch (err) {
    console.error("Erreur /api/admin/users/:id/status :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ---------------------------------------------------------------------------
// Lancer le serveur
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Serveur SAMA COURANT lancé sur le port ${PORT}`);
});
