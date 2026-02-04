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

// --- Middleware: auth obligatoire (JWT utilisateur) ---
function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) return res.status(401).json({ error: "Token manquant" });

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

// --- Middleware: auth device (ESP32) via X-DEVICE-KEY ---
function deviceAuth(req, res, next) {
  const key = req.headers["x-device-key"];
  if (!key) return res.status(401).json({ error: "DEVICE_KEY manquante" });

  // Version TEST (simple). Plus tard: table machines + clé en DB.
  if (!String(key).startsWith("SAMA-")) {
    return res.status(403).json({ error: "DEVICE_KEY invalide" });
  }
  next();
}

// --- Route de test ---
app.get("/", (req, res) => {
  res.json({ message: "API SAMA COURANT - SAMA TICKET fonctionne ✅" });
});

// ---------------------------------------------------------------------------
// Init DB minimal (crée la table sessions si elle n'existe pas)
// ---------------------------------------------------------------------------
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      session_id TEXT UNIQUE NOT NULL,
      user_id INT NOT NULL,
      machine_code TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active','ended')),
      started_at TIMESTAMP DEFAULT NOW(),
      ended_at TIMESTAMP,
      stop_reason TEXT,
      energy_wh REAL DEFAULT 0,
      last_power_w REAL DEFAULT 0,
      last_vrms REAL DEFAULT 0,
      last_arms REAL DEFAULT 0,
      last_seen_at TIMESTAMP
    );
  `);
}

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
// 5) WEB: liste des machines (statut libre/occupée)
// ---------------------------------------------------------------------------
app.get("/api/machines", authRequired, async (req, res) => {
  try {
    // Liste simple pour TEST (tu peux en ajouter)
    const machines = ["MACHINE-1", "MACHINE-2", "MACHINE-3"];

    const result = await pool.query(
      "SELECT machine_code FROM sessions WHERE status='active'"
    );

    const busySet = new Set(result.rows.map(r => r.machine_code));

    res.json(
      machines.map(code => ({
        machineCode: code,
        status: busySet.has(code) ? "busy" : "free"
      }))
    );
  } catch (err) {
    console.error("Erreur /api/machines:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ---------------------------------------------------------------------------
// 6) WEB: démarrer une session (bloque si machine occupée)
// ---------------------------------------------------------------------------
app.post("/api/sessions/start", authRequired, async (req, res) => {
  const { machineCode } = req.body;
  if (!machineCode) return res.status(400).json({ error: "machineCode requis" });

  try {
    const busy = await pool.query(
      "SELECT id FROM sessions WHERE machine_code=$1 AND status='active' LIMIT 1",
      [machineCode]
    );

    if (busy.rows.length > 0) {
      return res.status(409).json({ error: "MACHINE_BUSY", message: "Machine déjà utilisée" });
    }

    const sessionId = `S_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    const created = await pool.query(
      `INSERT INTO sessions (session_id, user_id, machine_code, status, started_at)
       VALUES ($1, $2, $3, 'active', NOW())
       RETURNING session_id, machine_code`,
      [sessionId, req.user.id, machineCode]
    );

    res.status(201).json({
      sessionId: created.rows[0].session_id,
      machineCode: created.rows[0].machine_code
    });
  } catch (err) {
    console.error("Erreur /api/sessions/start:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ---------------------------------------------------------------------------
// 7) ESP32: vérifier s'il y a une session active pour une machine
//    GET /api/sessions/active?machineCode=MACHINE-1
// ---------------------------------------------------------------------------
app.get("/api/sessions/active", deviceAuth, async (req, res) => {
  const { machineCode } = req.query;
  if (!machineCode) return res.status(400).json({ error: "machineCode requis" });

  try {
    const result = await pool.query(
      `SELECT session_id, user_id FROM sessions
       WHERE machine_code=$1 AND status='active'
       ORDER BY started_at DESC
       LIMIT 1`,
      [machineCode]
    );

    if (result.rows.length === 0) return res.json({ active: false });

    res.json({
      active: true,
      sessionId: result.rows[0].session_id,
      userId: result.rows[0].user_id
    });
  } catch (err) {
    console.error("Erreur /api/sessions/active:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ---------------------------------------------------------------------------
// 8) ESP32: envoyer la télémetrie (mise à jour énergie session)
// ---------------------------------------------------------------------------
app.post("/api/device/telemetry", deviceAuth, async (req, res) => {
  const { sessionId, machineCode, energyWh, powerW, voltageVrms, currentArms } = req.body;

  if (!sessionId || !machineCode) {
    return res.status(400).json({ error: "sessionId et machineCode requis" });
  }

  try {
    await pool.query(
      `UPDATE sessions
       SET energy_wh = $1,
           last_power_w = $2,
           last_vrms = $3,
           last_arms = $4,
           last_seen_at = NOW()
       WHERE session_id = $5 AND status='active'`,
      [energyWh ?? 0, powerW ?? 0, voltageVrms ?? 0, currentArms ?? 0, sessionId]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("Erreur /api/device/telemetry:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ---------------------------------------------------------------------------
// 9) ESP32: arrêter une session (inactivité)
// ---------------------------------------------------------------------------
app.post("/api/sessions/stop", deviceAuth, async (req, res) => {
  const { sessionId, reason, energyWh } = req.body;
  if (!sessionId) return res.status(400).json({ error: "sessionId requis" });

  try {
    const result = await pool.query(
      `UPDATE sessions
       SET status='ended',
           ended_at=NOW(),
           stop_reason=$1,
           energy_wh=COALESCE($2, energy_wh)
       WHERE session_id=$3 AND status='active'
       RETURNING session_id, machine_code`,
      [reason || "unknown", energyWh, sessionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Session introuvable ou déjà terminée" });
    }

    res.json({ ok: true, sessionId: result.rows[0].session_id });
  } catch (err) {
    console.error("Erreur /api/sessions/stop:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ---------------------------------------------------------------------------
// Lancer le serveur (avec init DB)
// ---------------------------------------------------------------------------
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Serveur SAMA COURANT lancé sur le port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Erreur init DB:", err);
    process.exit(1);
  });
