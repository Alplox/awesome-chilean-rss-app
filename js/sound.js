let cuelumePromise = null;
let soundBound = false;

function loadCuelume() {
  if (!cuelumePromise) cuelumePromise = import('cuelume');
  return cuelumePromise;
}

export async function bind() {
  if (soundBound) return;
  const module = await loadCuelume();
  module.bind();
  soundBound = true;
}

export async function setEnabled(enabled) {
  const module = await loadCuelume();
  module.setEnabled(enabled);
}

export async function play(sound) {
  const module = await loadCuelume();
  module.play(sound);
}

export function playSuccess() {
  return play('success');
}

export function warmSound() {
  const load = () => { bind().catch(() => {}); };
  if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 3000 });
  else setTimeout(load, 1500);
}
