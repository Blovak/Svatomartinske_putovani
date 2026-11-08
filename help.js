const dialog = document.getElementById('help-dialog');
const openButton = document.getElementById('help-open');
const controlsDialog = document.getElementById('controls-help-dialog');
const controlsButton = document.getElementById('controls-help-open');
const storageKey = 'svatomartinske:help-seen:v1';

openButton.addEventListener('click', () => dialog.showModal());
controlsButton.addEventListener('click', () => controlsDialog.showModal());
controlsDialog.addEventListener('close', () => controlsButton.focus({ preventScroll: true }));
dialog.addEventListener('close', () => {
  try {
    localStorage.setItem(storageKey, '1');
  } catch {
    // Nápověda funguje i v prohlížeči se zakázaným úložištěm.
  }
  openButton.focus({ preventScroll: true });
});

let seen = false;
try {
  seen = localStorage.getItem(storageKey) === '1';
} catch {
  // Bez úložiště nabídneme nápovědu při každém otevření.
}
if (!seen) dialog.showModal();
