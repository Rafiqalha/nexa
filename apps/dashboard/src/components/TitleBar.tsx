// Bilah judul kustom untuk aplikasi desktop (menggantikan bilah judul bawaan Windows).
// Hanya tampil bila Window Controls Overlay aktif; tombol jendela tetap milik sistem
// (digambar Electron di kanan), area ini bisa diseret untuk memindahkan jendela.
import { useEffect, useState } from 'react';
import { formatClockWib } from '../lib/format';
import { useAppState } from '../lib/store';
import { useWindowControlsOverlay } from '../lib/windowControls';
import { LiveDot } from './LiveDot';
import { LogoMark } from './LogoMark';

const CONNECTION_LABEL = {
  open: 'Sensor aktif',
  connecting: 'Menghubungkan',
  closed: 'Sensor terputus',
} as const;

export function TitleBar({ section, showStatus }: { section: string; showStatus: boolean }) {
  const visible = useWindowControlsOverlay();
  const { connection } = useAppState();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  if (!visible) return null;
  return (
    <header
      className="app-drag fixed z-50 flex items-center gap-3 border-b border-line bg-bg px-4 select-none"
      style={{
        left: 'env(titlebar-area-x, 0px)',
        top: 'env(titlebar-area-y, 0px)',
        width: 'env(titlebar-area-width, 100%)',
        height: 'env(titlebar-area-height, 40px)',
      }}
    >
      <LogoMark size={20} />
      <span className="text-[12px] font-semibold tracking-[0.18em] text-fg">NEXA</span>
      <span aria-hidden="true" className="text-line-strong">
        /
      </span>
      <span key={section} className="nx-tick truncate text-[13px] text-fg-2">
        {section}
      </span>
      {showStatus ? (
        <span className="meta ml-auto flex shrink-0 items-center gap-2 pr-2">
          <LiveDot state={connection} />
          <span>{CONNECTION_LABEL[connection]}</span>
          <span className="text-line-strong">·</span>
          <span>{formatClockWib(now)}</span>
        </span>
      ) : null}
    </header>
  );
}
