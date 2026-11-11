// Kode QR flat untuk menautkan aplikasi authenticator (2FA). Dihasilkan di browser dari URI
// otpauth (tidak ada layanan pihak ketiga); modul gelap di atas latar terang agar terbaca
// semua pemindai. Warna dari token desain.
import { useMemo } from 'react';
import { encode } from 'uqr';

export function QrCode({
  value,
  size = 184,
  label,
}: {
  value: string;
  size?: number;
  label: string;
}) {
  const { n, path } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 2 });
    let d = '';
    qr.data.forEach((row, y) => {
      row.forEach((on, x) => {
        if (on) d += `M${x} ${y}h1v1h-1z`;
      });
    });
    return { n: qr.size, path: d };
  }, [value]);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${n} ${n}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="shrink-0"
    >
      <rect width={n} height={n} fill="var(--text)" />
      <path d={path} fill="var(--bg)" />
    </svg>
  );
}
