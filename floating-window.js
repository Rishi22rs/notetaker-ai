const { clampFloatingBounds } = require('./floating-window-bounds');

function createFloatingWindowController(window, screen) {
  let dashboardBounds = null;
  let floatingBounds = null;
  return {
    setMode(mode, answerHeight = 520) {
      if (!['dashboard', 'floating', 'answer'].includes(mode)) throw new Error('Invalid window mode');
      if (mode === 'dashboard') {
        if (dashboardBounds) {
          floatingBounds = window.getBounds();
          const area = screen.getDisplayMatching(dashboardBounds).workArea;
          window.setMinimumSize(Math.min(620, area.width), Math.min(400, area.height));
          window.setBounds(clampFloatingBounds(dashboardBounds, area));
          dashboardBounds = null;
        }
        return window.getBounds();
      }
      const entering = !dashboardBounds;
      if (entering) dashboardBounds = window.getBounds();
      const area = screen.getDisplayMatching(entering ? dashboardBounds : window.getBounds()).workArea;
      window.setMinimumSize(Math.min(420, area.width), Math.min(mode === 'answer' ? 400 : 206, area.height));
      const previous = entering ? floatingBounds : window.getBounds();
      const width = previous?.width || Math.min(620, area.width);
      const requestedHeight = Number.isFinite(answerHeight) ? Math.max(240, Math.min(520, answerHeight)) : 520;
      const height = mode === 'answer' ? Math.min(requestedHeight, area.height) : 206;
      const bounds = clampFloatingBounds({
        x: previous?.x ?? area.x + Math.round((area.width - width) / 2),
        y: previous?.y ?? area.y + 24, width, height
      }, area);
      window.setBounds(bounds);
      window.setAlwaysOnTop(true, 'screen-saver');
      return bounds;
    }
  };
}
module.exports = { createFloatingWindowController };
