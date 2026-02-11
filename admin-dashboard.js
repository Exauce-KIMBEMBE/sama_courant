// admin-dashboard.js
const API_BASE_URL = "https://samacourant.onrender.com";

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("sama_token");
    localStorage.removeItem("sama_user");
    window.location.href = "/login.html";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("admin-users");

  // ✅ On récupère les mêmes clés que login.js
  const token = localStorage.getItem("sama_token");
  const userRaw = localStorage.getItem("sama_user");

  if (!token || !userRaw) {
    alert("Tu dois te connecter en tant qu'admin.");
    window.location.href = "/login.html";
    return;
  }

  let user = {};
  try {
    user = JSON.parse(userRaw);
  } catch (_) {
    user = {};
  }

  if (user.role !== "admin") {
    alert("Accès refusé : ce compte n'est pas admin.");
    window.location.href = "/machines.html";
    return;
  }

  if (!container) {
    console.error("❌ Element #admin-users introuvable dans admin-dashboard.html");
    return;
  }

  // Charger les utilisateurs en attente
  loadUsers("pending");

  async function loadUsers(status) {
    container.innerHTML = "Chargement des demandes...";

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/admin/users?status=${encodeURIComponent(status)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      let users = [];
      try {
        users = await response.json();
      } catch (_) {
        users = [];
      }

      if (!response.ok) {
        container.innerHTML = `<p style="color:#f97373;">Erreur : ${
          users.error || `impossible de charger les utilisateurs (HTTP ${response.status})`
        }</p>`;
        return;
      }

      if (!users.length) {
        container.innerHTML = "<p>Aucune demande en attente pour le moment.</p>";
        return;
      }

      container.innerHTML = "";
      users.forEach((u) => {
        const card = document.createElement("div");
        card.className = "admin-user-card";

        const created = u.created_at
          ? new Date(u.created_at).toLocaleString("fr-FR")
          : "-";

        card.innerHTML = `
          <div class="admin-user-name">${u.firstname || ""} ${u.lastname || ""}</div>
          <div class="admin-user-email">${u.email || ""}</div>
          <div class="admin-user-meta">Inscription le ${created}</div>

          <div class="status-badge status-${u.status}">
            ${labelStatus(u.status)}
          </div>

          <div class="admin-user-actions">
            <button class="btn btn-xs btn-ghost" data-action="approve">Valider</button>
            <button class="btn btn-xs btn-ghost" data-action="reject">Refuser</button>
          </div>
        `;

        const btnApprove = card.querySelector('[data-action="approve"]');
        const btnReject = card.querySelector('[data-action="reject"]');
        const statusEl = card.querySelector(".status-badge");

        btnApprove.addEventListener("click", () => updateStatus(u.id, "approved", statusEl));
        btnReject.addEventListener("click", () => updateStatus(u.id, "rejected", statusEl));

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
      const response = await fetch(`${API_BASE_URL}/api/admin/users/${userId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      let data = {};
      try {
        data = await response.json();
      } catch (_) {
        data = {};
      }

      if (!response.ok) {
        alert("Erreur : " + (data.error || `mise à jour impossible (HTTP ${response.status})`));
        return;
      }

      // Mise à jour visuelle
      const s = data.user?.status || newStatus;
      statusElement.textContent = labelStatus(s);
      statusElement.className = `status-badge status-${s}`;
    } catch (err) {
      console.error(err);
      alert("Erreur réseau.");
    }
  }
});

