// Narasi video demo lewat ElevenLabs. Kunci API dibaca dari .env (ELEVENLABS_API_KEY) dan tidak
// pernah dicetak atau ditulis ke berkas. Keluaran: data/video/audio/<segmen>.mp3 + .json (alignment).
//
//   node scripts/video/tts.mjs --account         tier dan sisa kuota karakter
//   node scripts/video/tts.mjs --voices          cari suara Indonesia berlogat Jawa (Voice Library)
//   node scripts/video/tts.mjs --models          model yang tersedia untuk akun ini
//   node scripts/video/tts.mjs --voice <id> [--model <id>] [--only s03] [--force] [--out <dir>]
//
// Model bawaan eleven_multilingual_v2: stabil untuk narasi panjang, menjaga logat suara asal, dan
// mendukung request stitching (previous_text/next_text) agar intonasi antarsegmen menyambung.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { flag, ROOT } from '../lib/lab-data.mjs';

const args = process.argv.slice(2);
const API = 'https://api.elevenlabs.io';

function envValue(name) {
  if (process.env[name]) return process.env[name].trim();
  const file = join(ROOT, '.env');
  if (!existsSync(file)) return '';
  const line = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith(`${name}=`));
  return (line?.slice(line.indexOf('=') + 1) ?? '').trim().replace(/^["']|["']$/g, '');
}

const key = envValue('ELEVENLABS_API_KEY');

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'xi-api-key': key, accept: 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 300);
  }
  if (!res.ok) {
    const detail = typeof body === 'object' ? JSON.stringify(body.detail ?? body) : body;
    throw new Error(
      `${init.method ?? 'GET'} ${path.split('?')[0]} -> HTTP ${res.status}: ${detail}`,
    );
  }
  return body;
}

async function account() {
  const s = await api('/v1/user/subscription');
  console.log(
    JSON.stringify({
      tier: s.tier,
      status: s.status,
      used: s.character_count,
      limit: s.character_limit,
      reset: s.next_character_count_reset_unix
        ? new Date(s.next_character_count_reset_unix * 1000).toISOString()
        : null,
    }),
  );
}

async function listVoices() {
  const seen = new Map();
  for (const q of ['javanese', 'jawa']) {
    const r = await api(`/v1/shared-voices?page_size=50&language=id&search=${q}`);
    for (const v of r.voices ?? []) seen.set(v.voice_id, v);
  }
  const r2 = await api('/v1/shared-voices?page_size=50&language=id&accent=javanese');
  for (const v of r2.voices ?? []) seen.set(v.voice_id, v);
  for (const v of seen.values()) {
    if (v.accent !== 'javanese') continue;
    console.log(
      JSON.stringify({
        name: v.name,
        voice_id: v.voice_id,
        gender: v.gender,
        age: v.age,
        use_case: v.use_case,
        descriptive: v.descriptive,
        free_users_allowed: v.free_users_allowed,
      }),
    );
  }
}

async function listModels() {
  for (const m of await api('/v1/models')) {
    if (!m.can_do_text_to_speech) continue;
    const id = (m.languages ?? []).some((l) => l.language_id === 'id');
    console.log(JSON.stringify({ model_id: m.model_id, name: m.name, indonesian: id }));
  }
}

// Suara milik akun sendiri (premade + hasil Voice Design). Hanya ini yang boleh dipakai lewat API
// oleh akun free; suara Voice Library butuh paket berbayar.
async function myVoices() {
  const r = await api('/v1/voices');
  for (const v of r.voices ?? []) {
    console.log(
      JSON.stringify({
        name: v.name,
        voice_id: v.voice_id,
        category: v.category,
        labels: v.labels,
      }),
    );
  }
}

// Voice Design: rancang suara baru dari deskripsi. Pratinjau membacakan segmen pembuka.
//   --design "<deskripsi>" [--model eleven_multilingual_ttv_v2] [--out <dir>]
async function design() {
  const description = flag(args, '--design', '');
  const model = flag(args, '--model', 'eleven_multilingual_ttv_v2');
  const out = flag(args, '--out', join(ROOT, 'data', 'video', 'samples', 'design'));
  const { segments } = JSON.parse(
    readFileSync(join(ROOT, 'scripts', 'video', 'segments.json'), 'utf8'),
  );
  const text = flag(args, '--text', segments[0].tts);
  mkdirSync(out, { recursive: true });
  const r = await api('/v1/text-to-voice/design?output_format=mp3_44100_128', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ voice_description: description, model_id: model, text }),
  });
  const previews = (r.previews ?? []).map((p, i) => {
    const file = join(out, `preview-${i + 1}.mp3`);
    writeFileSync(file, Buffer.from(p.audio_base_64, 'base64'));
    return { file, generated_voice_id: p.generated_voice_id, seconds: p.duration_secs };
  });
  writeFileSync(
    join(out, 'previews.json'),
    `${JSON.stringify({ description, model, text, previews }, null, 1)}\n`,
  );
  for (const p of previews) console.log(JSON.stringify(p));
}

// Simpan pratinjau Voice Design sebagai suara di akun (My Voices), lalu cetak voice_id-nya.
//   --save <generated_voice_id> --name "<nama>" --description "<deskripsi>"
async function saveDesigned() {
  const r = await api('/v1/text-to-voice', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      voice_name: flag(args, '--name', 'NEXA Narator'),
      voice_description: flag(args, '--description', 'Narator video demo NEXA'),
      generated_voice_id: flag(args, '--save', ''),
    }),
  });
  console.log(JSON.stringify({ voice_id: r.voice_id, name: r.name }));
}

async function generate() {
  const voice = flag(args, '--voice', envValue('ELEVENLABS_VOICE_ID'));
  if (!voice) throw new Error('Pilih suara: --voice <voice_id> (lihat --voices).');
  const model = flag(args, '--model', 'eleven_multilingual_v2');
  const only = flag(args, '--only', null);
  const force = args.includes('--force');
  const out = flag(args, '--out', join(ROOT, 'data', 'video', 'audio'));
  const stitch = !/^eleven_v[34]/.test(model);
  const { segments } = JSON.parse(
    readFileSync(join(ROOT, 'scripts', 'video', 'segments.json'), 'utf8'),
  );
  mkdirSync(out, { recursive: true });
  console.log(JSON.stringify({ voice, model, segments: only ?? segments.length }));

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (only && !only.split(',').includes(s.id)) continue;
    const mp3 = join(out, `${s.id}.mp3`);
    if (existsSync(mp3) && !force) {
      console.log(JSON.stringify({ id: s.id, skip: 'sudah ada' }));
      continue;
    }
    const body = {
      text: s.tts,
      model_id: model,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.8,
        style: 0.15,
        use_speaker_boost: true,
        speed: 0.97,
      },
      ...(stitch ? { previous_text: segments[i - 1]?.tts, next_text: segments[i + 1]?.tts } : {}),
    };
    const r = await api(
      `/v1/text-to-speech/${voice}/with-timestamps?output_format=${flag(args, '--format', 'mp3_44100_128')}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    writeFileSync(mp3, Buffer.from(r.audio_base64, 'base64'));
    writeFileSync(
      join(out, `${s.id}.json`),
      `${JSON.stringify({ text: s.tts, model, voice, alignment: r.alignment, normalized: r.normalized_alignment }, null, 1)}\n`,
    );
    const end = r.alignment?.character_end_times_seconds?.at(-1) ?? 0;
    console.log(JSON.stringify({ id: s.id, seconds: Number(end.toFixed(2)), chars: s.tts.length }));
  }
}

if (!key) {
  console.error(
    'ELEVENLABS_API_KEY belum ada di .env (atau env). Tambahkan barisnya, jangan kirim di chat.',
  );
  process.exitCode = 2;
} else {
  const modes = {
    '--account': account,
    '--voices': listVoices,
    '--models': listModels,
    '--my-voices': myVoices,
    '--design': design,
    '--save': saveDesigned,
  };
  const run = Object.entries(modes).find(([m]) => args.includes(m))?.[1] ?? generate;
  await run().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
