import confetti from "canvas-confetti";

export const triggerConfetti = () => {
  const colors = ["#0044CC", "#002B5C", "#FFD700", "#FF6B6B", "#4ECDC4"];
  const isMobile = window.innerWidth < 768;

  // Single celebratory burst from top-center, falling down naturally
  confetti({
    particleCount: isMobile ? 80 : 150,
    spread: 70,
    origin: { x: 0.5, y: 0.3 },
    colors,
    gravity: 0.8,
    scalar: 1.2,
    drift: 0,
    ticks: 200,
    disableForReducedMotion: true,
  });
};
