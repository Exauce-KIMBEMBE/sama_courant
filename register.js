const API_BASE_URL = "https://samacourant.onrender.com"; // backend Render

const form = document.getElementById("registerForm");

if (!form) {
  console.error("❌ Formulaire introuvable. Vérifie que ton <form> a bien id='registerForm'");
} else {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const firstname = document.getElementById("firstname")?.value.trim();
    const lastname = document.getElementById("lastname")?.value.trim();
    const email = document.getElementById("email")?.value.trim();
    const password = document.getElementById("password")?.value || "";
    const password_confirm = document.getElementById("password_confirm")?.value || "";

    // Vérifications simples
    if (!firstname || !lastname || !email || !password || !password_confirm) {
      alert("❌ Tous les champs sont obligatoires.");
      return;
    }

    if (password !== password_confirm) {
      alert("❌ Les mots de passe ne correspondent pas.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstname,
          lastname,
          email,
          password
        })
      });

      // Si le serveur renvoie autre chose que du JSON, on gère quand même
      let data = {};
      try {
        data = await response.json();
      } catch (_) {
        data = {};
      }

      if (!response.ok) {
        alert("Erreur : " + (data.error || `inscription impossible (HTTP ${response.status})`));
        return;
      }

      alert("✔️ " + (data.message || "Inscription envoyée ✅"));

      // ✅ Redirection correcte (ton fichier est login.html)
      window.location.href = "/login.html";
    } catch (error) {
      console.error("Erreur:", error);
      alert("Erreur réseau. Vérifie que le serveur Node.js sur Render fonctionne.");
    }
  });
}
