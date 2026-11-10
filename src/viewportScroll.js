export function scrollViewportIntoView(container) {
  if (!container || typeof container.scrollIntoView !== 'function') {
    return;
  }

  window.requestAnimationFrame(() => {
    container.scrollIntoView({
      behavior: 'auto',
      block: 'start',
      inline: 'nearest'
    });
  });
}
