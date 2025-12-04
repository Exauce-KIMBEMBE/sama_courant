const API_BASE_URL = "https://samacourant.onrender.com"; // ton backend

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const errorEl = document.getElementById("loginError");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (errorEl) {
      errorEl.style.display = "none";
      errorEl.textContent = "";
    }

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!email || !password) {
      showError("Merci de remplir tous les champs.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        showError(data.error || "Connexion impossible.");
        return;
      }

      // On stocke le token et les infos utilisateur pour la suite (dashboard, etc.)
      localStorage.setItem("sama_token", data.token);
      localStorage.setItem("sama_user", JSON.stringify(data.user));

      alert("Connexion réussie ✅");

      // Pour l'instant on renvoie vers l'accueil, plus tard ce sera /dashboard
      window.location.href = "/";

    } catch (err) {
      console.error(err);
      showError("Erreur réseau. Réessaie plus tard.");
    }
  });

  function showError(message) {
    if (!errorEl) {
      alert(message);
      return;
    }
    errorEl.textContent = message;
    errorEl.style.display = "block";
  }
});
