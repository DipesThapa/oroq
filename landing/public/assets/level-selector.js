/**
 * Wire up the Step 1 level cards.
 * Calls `onSelect(level)` whenever the user picks one.
 * Reveals the install and verify steps on first selection.
 */
export function setupLevelSelector(onSelect) {
  const cards = document.querySelectorAll('.level-card');
  const stepInstall = document.getElementById('step-install');
  const stepVerify = document.getElementById('step-verify');

  cards.forEach((card) => {
    card.addEventListener('click', () => {
      const level = card.dataset.level;
      cards.forEach((c) => c.setAttribute('aria-pressed', c === card ? 'true' : 'false'));
      stepInstall.hidden = false;
      stepVerify.hidden = false;
      onSelect(level);
    });
  });
}
