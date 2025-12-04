// server.js
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 4000;

// middlewares
app.use(cors());
app.use(express.json());

// route de test
app.get("/", (req, res) => {
  res.json({ message: "API SAMA COURANT - SAMA TICKET fonctionne ✅" });
});

// on écoute sur le port donné par Render
app.listen(PORT, () => {
  console.log(`Serveur SAMA COURANT lancé sur le port ${PORT}`);
});
