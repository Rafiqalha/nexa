// Deteksi Window Controls Overlay (API web standar). Aktif bila dashboard dimuat di aplikasi
// desktop NEXA (Electron dengan titleBarOverlay). Di browser biasa tidak aktif, sehingga
// dashboard tidak butuh preload atau kode khusus Electron.
import { useEffect, useState } from 'react';

interface WindowControlsOverlay extends EventTarget {
  visible: boolean;
}

function overlay(): WindowControlsOverlay | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { windowControlsOverlay?: WindowControlsOverlay })
    .windowControlsOverlay;
}

/** Tinggi bilah judul kustom (harus sama dengan titleBarOverlay.height di apps/desktop). */
export const TITLEBAR_HEIGHT = 40;

export function useWindowControlsOverlay(): boolean {
  const [visible, setVisible] = useState(() => Boolean(overlay()?.visible));
  useEffect(() => {
    const wco = overlay();
    if (!wco) return;
    const update = () => setVisible(Boolean(wco.visible));
    update();
    wco.addEventListener('geometrychange', update);
    return () => wco.removeEventListener('geometrychange', update);
  }, []);
  return visible;
}
