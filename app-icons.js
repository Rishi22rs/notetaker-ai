// Shared, local SVG icons. No remote font or icon dependency.
(function () {
  const paths = {"home": ["M3 10 12 3l9 7", "M5 9v11h5v-6h4v6h5V9"], "notes": ["M6 3h12v18H6z", "M9 7h6M9 11h6M9 15h4"], "context": ["M4 5h6l2 2h8v13H4z", "M8 12h8M8 16h5"], "history": ["M3 11a9 9 0 1 1 2.6 7.4", "M3 4v7h7", "M12 7v5l3 2"], "wallet": ["M4 6h14V4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16V8H5a2 2 0 0 1-2-2", "M16 12h5v4h-5z"], "user": ["M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0", "M4 21v-2a8 8 0 0 1 16 0v2"], "settings": ["M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z", "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0"], "plus": ["M12 5v14M5 12h14"], "arrow-right": ["M4 12h16M14 6l6 6-6 6"], "arrow-left": ["M20 12H4M10 6l-6 6 6 6"], "arrow-up-right": ["M6 18 18 6M7 6h11v11"], "chevron-up": ["m6 15 6-6 6 6"], "chevron-down": ["m6 9 6 6 6-6"], "chevron-left": ["m15 6-6 6 6 6"], "chevron-right": ["m9 6 6 6-6 6"], "upload": ["M12 16V3M7 8l5-5 5 5", "M4 15v6h16v-6"], "download": ["M12 3v13M7 11l5 5 5-5", "M4 17v4h16v-4"], "audio": ["M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4"], "microphone": ["M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0z", "M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M9 22h6"], "monitor": ["M3 4h18v13H3z", "M12 17v4M8 21h8"], "sparkles": ["m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"], "close": ["M6 6l12 12M18 6 6 18"], "check": ["m5 12 4 4L19 6"], "info": ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0", "M12 11v6M12 7h.01"], "pause": ["M8 5v14M16 5v14"], "play": ["m8 4 12 8-12 8z"], "stop": ["M6 6h12v12H6z"], "refresh": ["M20 7a8 8 0 0 0-14-2L3 8M3 3v5h5", "M4 17a8 8 0 0 0 14 2l3-3M21 21v-5h-5"], "logout": ["M9 3H4v18h5", "M9 12h12m-5-5 5 5-5 5"], "save": ["M4 3h13l3 3v15H4z", "M8 3v6h8V3M8 21v-8h8v8"], "grip": ["M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01"]};
  function createAppIcon(name) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    const attributes = { class: 'app-icon', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false', 'data-icon-name': name };
    for (const [key, value] of Object.entries(attributes)) svg.setAttribute(key, value);
    for (const d of paths[name] || paths.info) { const path = document.createElementNS(ns, 'path'); path.setAttribute('d', d); svg.append(path); }
    return svg;
  }
  const decorated = new WeakSet();
  function decorate(button) {
    if (decorated.has(button)) return;
    decorated.add(button);
    const sync = () => {
      const name = button.dataset.buttonIcon;
      const existing = button.querySelector(':scope > .app-icon');
      if (existing?.dataset.iconName === name) return;
      existing?.remove();
      button.prepend(createAppIcon(name));
    };
    sync();
    new MutationObserver(sync).observe(button, { childList: true, attributes: true, attributeFilter: ['data-button-icon'] });
  }
  function scan(root) {
    if (root.matches?.('[data-button-icon]')) decorate(root);
    root.querySelectorAll?.('[data-button-icon]').forEach(decorate);
  }
  window.createAppIcon = createAppIcon;
  scan(document);
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) scan(node);
  }).observe(document.body, { childList: true, subtree: true });
})();
