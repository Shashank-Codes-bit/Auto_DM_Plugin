// Reel page: tap the reel to play or pause it (starts muted, a second tap turns sound on).
(() => {
  const box = document.querySelector('[data-video]');
  const video = box?.querySelector('video');
  if (!video) return;
  box.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    if (video.paused) {
      video.play().catch(() => {});
      box.classList.add('playing');
    } else if (video.muted) {
      video.muted = false;
    } else {
      video.pause();
      box.classList.remove('playing');
    }
  });
})();
