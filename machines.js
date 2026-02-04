const API_BASE_URL = "https://samacourant.onrender.com";

const token = localStorage.getItem("sama_token");
if (!token) window.location.href = "login.html";

const machinesList = document.getElementById("machinesList");
document.getElementById("refreshBtn").addEventListener("click", loadMachines);
document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.clear();
  window.location.href = "login.html";
});

loadMachines();

async function loadMachines() {
  machinesList.innerHTML = "Chargement...";

  const res = await fetch(`${API_BASE_URL}/api/machines`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await res.json();
  if (!res.ok) {
    machinesList.innerHTML = "Erreur: " + (data.message || data.error || "impossible");
    return;
  }

  machinesList.innerHTML = "";
  data.forEach(m => {
    const busy = m.status === "busy";
    const div = document.createElement("div");
    div.className = "feature-card";
    div.innerHTML = `
      <div class="feature-title">${m.machineCode}</div>
      <div class="feature-text">Statut : <strong>${busy ? "Occupée" : "Libre"}</strong></div>
      <div style="margin-top:10px">
        <button class="btn ${busy ? "btn-outline" : "btn-primary"}" ${busy ? "disabled" : ""}>
          ${busy ? "Indisponible" : "Démarrer"}
        </button>
      </div>
    `;
    if (!busy) div.querySelector("button").addEventListener("click", () => startSession(m.machineCode));
    machinesList.appendChild(div);
  });
}

async function startSession(machineCode) {
  const res = await fetch(`${API_BASE_URL}/api/sessions/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ machineCode })
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.message || data.error || "Impossible de démarrer");
    return;
  }

  localStorage.setItem("active_session_id", data.sessionId);
  localStorage.setItem("active_machine_code", data.machineCode);

  alert(`Session démarrée sur ${machineCode} ✅`);
  loadMachines();
}
