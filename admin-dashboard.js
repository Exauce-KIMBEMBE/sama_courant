// admin-dashboard.js
const API_BASE_URL = "https://samacourant.onrender.com";

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("admin-users");

  // Vérifier que l'admin est connecté
  const token = localStorage.getItem("sama_admin_token");
  const adminUserRaw = localStorage.getItem("sama_admin_user");

  if (!token || !adminUserRaw) {
    alert("Tu dois te connecter en tant qu'admin.");
    window.location.href = "/admin-login";
    return;
  }

  const adminUser = JSON.parse(adminUserRaw || "{}");
  if (adminUser.role !== "admin") {
    alert("Accès refusé : ce compte n'est pas admin.");
    window.location.href = "/login";
    return;
  }

  if (!container) return;

  // Charger les utilisateurs en attente
  loadUsers("pending");

  async function loadUsers(status) {
    container.innerHTML = "Chargement des demandes...";

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/admin/users?status=${encodeURIComponent(status)}`,
        {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        }
      );

      const users = await response.json();

      if (!response.ok) {
        container.innerHTML = `<p style="color:#f97373;">Erreur : ${
          users.error || "impossible de charger les utilisateurs"
        }</p>`;
        return;
      }

      if (!users.length) {
        container.innerHTML = "<p>Aucune demande en attente pour le moment.</p>";
        return;
      }

      container.innerHTML = "";
      users.forEach(user => {
        const card = document.createElement("div");
        card.className = "admin-user-card";
        card.innerHTML = `
          <div class="admin-user-name">${user.firstname} ${user.lastname}</div>
          <div class="admin-user-email">${user.email}</div>
          <div class="admin-user-meta">
            Inscription le ${new Date(user.created_at).toLocaleString("fr-FR")}
          </div>
          <div class="status-badge status-${user.status}">
            ${labelStatus(user.status)}
          </div>
          <div class="admin-user-actions">
            <button class="btn btn-xs btn-ghost" data-action="approve">Valider</button>
            <button class="btn btn-xs btn-ghost" data-action="reject">Refuser</button>
          </div>
        `;

        const btnApprove = card.querySelector('[data-action="approve"]');
        const btnReject = card.querySelector('[data-action="reject"]');
        const statusEl = card.querySelector(".status-badge");

        btnApprove.addEventListener("click", () => updateStatus(user.id, "approved", statusEl));
        btnReject.addEventListener("click", () => updateStatus(user.id, "rejected", statusEl));

        container.appendChild(card);
      });
    } catch (err) {
      console.error(err);
      container.innerHTML = `<p style="color:#f97373;">Erreur réseau.</p>`;
    }
  }

  function labelStatus(status) {
    if (status === "approved") return "Validé";
    if (status === "rejected") return "Refusé";
    return "En attente";
  }

  async function updateStatus(userId, newStatus, statusElement) {
    if (!confirm(`Confirmer le passage de ce compte en "${labelStatus(newStatus)}" ?`)) {
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/admin/users/${userId}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ status: newStatus })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        alert("Erreur : " + (data.error || "mise à jour impossible"));
        return;
      }

      statusElement.textContent = labelStatus(data.user.status);
      statusElement.className = `status-badge status-${data.user.status}`;
    } catch (err) {
      console.error(err);
      alert("Erreur réseau.");
    }
  }
});
