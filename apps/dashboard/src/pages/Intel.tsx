import { PageHeader } from '../components/PageHeader';

/** Intel (DESIGN.md §7.3). Diisi oleh intel pasca-sesi (Fase 5). */
export function Intel() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader title="Intel" />
      <p className="border-t border-line py-6 text-muted">
        Belum ada ringkasan intel. Ringkasan dibuat pasca-sesi lewat antrean berbudget.
      </p>
    </div>
  );
}
