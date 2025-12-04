// Animation des chiffres dans la carte d'aperçu
document.addEventListener("DOMContentLoaded", () => {
  const numbers = document.querySelectorAll(".metric-number");
  const heroCard = document.querySelector(".hero-card");

  if (!numbers.length || !heroCard) return;

  function animateNumbers() {
    numbers.forEach(el => {
      const target = parseFloat(el.dataset.target);
      const isTime = el.dataset.format === "time";
      const decimals = el.dataset.decimals ? parseInt(el.dataset.decimals, 10) : 0;
      const duration = 1500; // ms
      const start = performance.now();

      function update(now) {
        const progress = Math.min((now - start) / duration, 1);
        const current = target * progress;

        if (isTime) {
          // format "7 h 32 min" à partir de 7.5 => 7h30 environ
          const totalMinutes = Math.round(current * 60);
          const hours = Math.floor(totalMinutes / 60);
          const minutes = totalMinutes % 60;
          el.textContent = `${hours} h ${minutes.toString().padStart(2, "0")} min`;
        } else if (decimals > 0) {
          el.textContent = current.toFixed(decimals);
        } else {
          el.textContent = Math.round(current).toLocaleString("fr-FR");
        }

        if (progress < 1) {
          requestAnimationFrame(update);
        }
      }

      requestAnimationFrame(update);
    });
  }

  // Lance l'animation quand la carte est visible
  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateNumbers();
        }
      });
    },
    { threshold: 0.4 }
  );

  observer.observe(heroCard);
});
