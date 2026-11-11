# Versi yang Dipakai (dipin)

Semua dependensi di `package.json` dipin ke versi persis (tanpa `^`/`~`). pnpm menolak
versi yang dirilis kurang dari 24 jam (`minimumReleaseAge`), sebagai mitigasi serangan rantai
pasok. Dicatat 11 November 2026.

## Runtime dan alat

| Komponen | Versi | Catatan |
|---|---|---|
| Node.js | 24.19.0 | minimal 20 (wajib untuk MCP SDK v2); image Docker `node:24-bookworm-slim` |
| pnpm | 12.18.0 | `packageManager` di root |
| TypeScript | 7.0.2 | strict, ESM |
| Biome | 2.6.6 | lint + format |
| Vitest | 5.1.0 | |
| tsx | 4.23.15 | menjalankan TypeScript di sensor, target lab, dan agen uji |
| Suricata | 8.0.6 | lab lokal: paket Debian `1:8.0.6-1` diekstrak tanpa root di WSL (kali-linux); Docker: `jasonish/suricata:8.0` |

## Sensor (`apps/sensor`)

| Paket | Versi |
|---|---|
| hono | 4.13.17 |
| @hono/node-server | 2.1.6 |
| drizzle-orm | 0.45.4 (drizzle-kit 0.31.11, dev) |
| better-sqlite3 | 13.0.3 |
| zod | 4.6.7 |
| openai (klien OpenAI-compatible, hanya di `intel/llm.ts`) | 7.54.0 |
| @modelcontextprotocol/server | 2.4.0 (client 2.4.0 untuk test) |

## Dashboard (`apps/dashboard`)

| Paket | Versi |
|---|---|
| react / react-dom | 19.3.1 |
| vite | 8.3.7 (+ @vitejs/plugin-react 6.3.0) |
| tailwindcss / @tailwindcss/vite | 4.3.5 |
| lucide-react | 1.70.0 |
| @fontsource-variable/geist, jetbrains-mono | 5.3.0 |
| class-variance-authority 0.7.1, clsx 2.1.1, tailwind-merge 3.7.0, @radix-ui/react-slot 1.5.0 | |

## Desktop (`apps/desktop`)

| Paket | Versi |
|---|---|
| electron | 45.2.3 |
| electron-vite | 6.0.0 |
| electron-builder | 26.18.0 (NSIS, x64) |

## Model (lab)

| Pemakaian | Model | Lewat |
|---|---|---|
| Intel pasca-sesi NEXA | `deepseek-flash` | API DeepSeek (`LLM_BASE_URL`), budget harian 200 ribu token |
| Agen penyerang uji | `deepseek-flash`, `deepseek-v4-pro` | API DeepSeek (`ATTACKER_LLM_*`) |

Harga dan kurs untuk estimasi Rupiah ada di `apps/sensor/config/pricing.json` (diambil
10 November 2026; kurs Rp16.500/USD adalah asumsi).

## Hasil `pnpm audit` (11 November 2026)

- **Dependensi produksi: tidak ada kerentanan diketahui** (`pnpm audit --prod`).
- Dependensi pengembangan: 2 temuan *moderate*, keduanya hanya alat build dan tidak ikut artefak
  yang dijalankan:
  - `esbuild` lama lewat `drizzle-kit > @esbuild-kit/*` (GHSA-67mh-4wv8-2f99, celah server dev
    esbuild). drizzle-kit hanya dipakai untuk membuat migrasi dan tidak menjalankan server esbuild.
  - `minimatch` < 11.0.1 lewat `electron-builder` (GHSA-g3hv-75wg-m249, DoS pola glob). Hanya
    dipakai saat membangun installer, dengan pola dari konfigurasi repo sendiri.
  - Diterima sebagai risiko sisa; override paksa ke versi mayor baru berisiko merusak alat build
    menjelang deadline.
