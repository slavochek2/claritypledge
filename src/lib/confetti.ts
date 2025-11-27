
export const triggerConfetti = () => {
  const duration = 3000;
  const animationEnd = Date.now() + duration;
  const colors = ["#0044CC", "#002B5C", "#FFD700", "#FF6B6B", "#4ECDC4"];

  const randomInRange = (min: number, max: number) => {
    return Math.random() * (max - min) + min;
  };

  const createConfetti = () => {
    const confettiCount = 5;
    for (let i = 0; i < confettiCount; i++) {
      const confetti = document.createElement("div");
      confetti.style.position = "fixed";
      confetti.style.width = "10px";
      confetti.style.height = "10px";
      confetti.style.backgroundColor =
        colors[Math.floor(Math.random() * colors.length)];
      confetti.style.left = randomInRange(0, window.innerWidth) + "px";
      confetti.style.top = "-10px";
      confetti.style.opacity = "1";
      confetti.style.transform = `rotate(${randomInRange(0, 360)}deg)`;
      confetti.style.pointerEvents = "none";
      confetti.style.zIndex = "9999";
      confetti.style.borderRadius = "2px";

      document.body.appendChild(confetti);

      const angle = randomInRange(-30, 30);
      const velocity = randomInRange(2, 4);
      const rotationSpeed = randomInRange(-5, 5);
      let posY = -10;
      let posX = parseFloat(confetti.style.left);
      let rotation = 0;
      let opacity = 1;

      const animate = () => {
        posY += velocity;
        posX += Math.sin(angle) * 0.5;
        rotation += rotationSpeed;
        opacity -= 0.005;

        confetti.style.top = posY + "px";
        confetti.style.left = posX + "px";
        confetti.style.transform = `rotate(${rotation}deg)`;
        confetti.style.opacity = opacity.toString();

        if (posY < window.innerHeight && opacity > 0) {
          requestAnimationFrame(animate);
        } else {
          confetti.remove();
        }
      };

      animate();
    }
  };

  const interval = setInterval(() => {
    if (Date.now() > animationEnd) {
      clearInterval(interval);
      return;
    }
    createConfetti();
  }, 50);
};

