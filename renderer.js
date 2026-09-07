const status = document.getElementById('status');

window.overlay.onInteraction((enabled) => {
  document.body.classList.toggle('interactive', enabled);
});

window.overlay.onStatus((text) => {
  status.textContent = text;
  status.title = text;
});
