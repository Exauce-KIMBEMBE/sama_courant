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
    const response = await fetch("http://localhost:4000/api/register", {
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
      alert("Erreur : " + data.error);
      return;
    }

    alert("✔️ " + data.message);
    window.location.href = "login.html";

  } catch (error) {
    console.error("Erreur:", error);
    alert("Erreur réseau. Assure-toi que le serveur Node.js fonctionne.");
  }
});
