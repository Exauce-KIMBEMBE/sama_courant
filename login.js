const API_BASE_URL = "https://samacourant.onrender.com"; // ton backend

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const errorEl = document.getElementById("loginError");

  if (!form) {
    console.error("❌ Formulaire introuvable. Vérifie que ton <form> a bien id='loginForm'");
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    hideError();

    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");

    if (!emailInput || !passwordInput) {
      showError("Champs email/mot de passe introuvables dans la page.");
      return;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value;

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

      // ✅ éviter crash si la réponse n'est pas du JSON
      let data = {};
      try {
        data = await response.json();
      } catch (_) {
        data = {};
      }

      if (!response.ok) {
        showError(data.error || `Connexion impossible (HTTP ${response.status}).`);
        return;
      }

      // ✅ stockage
      localStorage.setItem("sama_token", data.token);
      localStorage.setItem("sama_user", JSON.stringify(data.user));

      alert("Connexion réussie ✅");

      // ✅ redirection (choisis celle qui marche chez toi)
      window.location.href = "/"; 
      // window.location.href = "/index.html";

    } catch (err) {
      console.error(err);
      showError("Erreur réseau. Réessaie plus tard.");
    }
  });

  function hideError() {
    if (!errorEl) return;
    errorEl.style.display = "none";
    errorEl.textContent = "";
  }

  function showError(message) {
    if (!errorEl) {
      alert(message);
      return;
    }
    errorEl.textContent = message;
    errorEl.style.display = "block";
  }
});
