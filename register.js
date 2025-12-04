const API_BASE_URL = "https://samacourant.onrender.com"; // <-- ton backend

const form = document.getElementById("registerForm");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const firstname = document.getElementById("firstname").value.trim();
  const lastname = document.getElementById("lastname").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const password_confirm = document.getElementById("password_confirm").value;

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

    const data = await response.json();

    if (!response.ok) {
      alert("Erreur : " + (data.error || "inscription impossible"));
      return;
    }

    alert("✔️ " + data.message);
    // après inscription, on renvoie vers la page de connexion
    window.location.href = "/login";
  } catch (error) {
    console.error("Erreur:", error);
    alert("Erreur réseau. Vérifie que le serveur Node.js sur Render fonctionne.");
  }
});
