import { setupLevelSelector } from './level-selector.js';
import { setupInstallPanels, detectPlatform } from './install-panels.js';

let panels = null;

setupLevelSelector((level) => {
  if (!panels) {
    panels = setupInstallPanels({ platform: detectPlatform(), level });
  } else {
    panels.setLevel(level);
  }
  document.getElementById('step-install').scrollIntoView({ behavior: 'smooth' });
});
