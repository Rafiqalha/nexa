/**
 * Respons sementara untuk sesi yang dibelokkan (Fase 1).
 * Fase 2 menggantinya dengan labirin prosedural (labyrinth/).
 */
export function stubDecoyResponse(): Response {
  const body = `# Arsip Internal

Indeks arsip sedang disusun ulang. Silakan coba beberapa saat lagi.
`;
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  });
}
