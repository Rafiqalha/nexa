// Sinyal per-request. Semua fungsi murni (tanpa I/O) dan deterministik.

export type HeaderBag = Readonly<Record<string, string | undefined>>;

const AUTOMATION_UA_PATTERNS: readonly RegExp[] = [
  // Library HTTP & CLI umum yang dipakai framework agen.
  /\b(python-requests|python-httpx|httpx|aiohttp|python-urllib|urllib|curl|wget|go-http-client|okhttp|java\/|libwww-perl|scrapy|axios|node-fetch|undici|httpie|postmanruntime|insomnia)\b/i,
  // Browser headless / otomasi.
  /\b(headlesschrome|phantomjs|puppeteer|playwright|selenium|webdriver)\b/i,
  // Crawler AI & bot yang mengaku.
  /\b(gptbot|chatgpt-user|oai-searchbot|claudebot|claude-user|claude-web|anthropic-ai|perplexitybot|perplexity-user|bytespider|ccbot|google-extended|amazonbot|youbot|ai-agent|agent|bot|crawler|spider)\b/i,
];

/** User-Agent kosong atau milik library/otomasi, bukan browser. */
export function isAutomationUserAgent(userAgent: string): boolean {
  const ua = userAgent.trim();
  if (ua === '') return true;
  // fetch bawaan Node mengirim "node" atau "undici".
  if (/^(node|undici)(\/[\w.]+)?$/i.test(ua)) return true;
  return AUTOMATION_UA_PATTERNS.some((re) => re.test(ua));
}

/**
 * Browser modern selalu mengirim Accept-Language bertag bahasa nyata dan Sec-Fetch-Site.
 * Library HTTP yang dipakai agen tidak mengirimnya, atau mengirim nilai generik
 * (fetch bawaan Node/undici: `accept-language: *`, `sec-fetch-mode: cors`, tanpa Sec-Fetch-Site).
 */
export function lacksBrowserHeaders(headers: HeaderBag): boolean {
  const lang = headers['accept-language']?.trim();
  const realLanguage = Boolean(lang) && lang !== '*';
  return !realLanguage || !headers['sec-fetch-site'];
}

const STATIC_EXT =
  /\.(css|js|mjs|map|png|jpe?g|gif|svg|ico|webp|avif|bmp|woff2?|ttf|otf|eot|mp4|webm|mp3|wav)$/i;
const NON_DOCUMENT_DEST = new Set([
  'image',
  'style',
  'script',
  'font',
  'audio',
  'video',
  'track',
  'manifest',
  'worker',
  'sharedworker',
  'serviceworker',
]);

/** Request "dokumen" (halaman/API), bukan aset statis yang diambil browser secara paralel. */
export function isDocumentRequest(path: string, headers: HeaderBag): boolean {
  const pathname = path.split('?')[0] ?? path;
  if (STATIC_EXT.test(pathname)) return false;
  const dest = headers['sec-fetch-dest'];
  return !(dest && NON_DOCUMENT_DEST.has(dest.toLowerCase()));
}

function trimSlash(p: string): string {
  return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
}

/** Cocok bila path sama dengan honeylink atau berada di bawahnya (batas segmen). */
export function isHoneylinkPath(path: string, honeylinkPaths: readonly string[]): boolean {
  const pathname = trimSlash((path.split('?')[0] ?? path).toLowerCase());
  return honeylinkPaths.some((raw) => {
    const hp = trimSlash(raw.toLowerCase());
    return pathname === hp || pathname.startsWith(`${hp}/`);
  });
}
