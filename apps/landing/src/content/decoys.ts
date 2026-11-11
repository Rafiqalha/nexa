// Path halaman umpan untuk demo labirin: PRNG dan kosakata FIKTIF yang sama dengan sensor
// (apps/sensor/src/labyrinth). Deterministik per (seed, indeks).
import { Rng } from '../../../sensor/src/labyrinth/prng';
import { DOC_STEMS, FILE_EXT, SEGMENTS } from '../../../sensor/src/labyrinth/vocab';

export function decoyPath(seed: string, index: number): string {
  const rng = new Rng(`${seed}:${index}`);
  const segment = rng.pick(SEGMENTS).toLowerCase();
  const stem = rng.pick(DOC_STEMS);
  const n = String(rng.int(1, 48)).padStart(2, '0');
  const ext = rng.pick(FILE_EXT);
  return `/arsip-internal/${segment}/${stem}-${n}.${ext}`;
}
