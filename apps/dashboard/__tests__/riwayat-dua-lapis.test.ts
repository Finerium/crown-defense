import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE TWO-TIER HISTORY, tested at the failure it exists for.
 *
 * On the morning of the final the durable store was paused for thirty days: the account had exhausted
 * the free tier's 10,000 Vercel Blob operations, largely because the proof-of-life panel polled an
 * endpoint that read every incident blob every fifteen seconds. The History tab, whose entire argument is
 * that this system has a PAST, went blank. One store meant one failure was total.
 *
 * So incidents are now written to two places: the durable blob store, and a bounded session-scoped tier
 * in the Runtime Cache that sits beside the run queue. These tests pin the properties that make that
 * worth having rather than merely present:
 *
 *   - a run performed during an outage is still recorded and still visible
 *   - the detail view and its hash chain still open, because the fallback holds FULL records
 *   - the two tiers are merged by runId, so nothing double-counts and the durable copy wins
 *   - the weaker tier is REPORTED as weaker, never presented as if it were durable
 *
 * That last one is the point. Showing fallback data silently would be a worse failure than showing
 * nothing, because it would quietly overstate the evidence a judge is being asked to trust.
 */

const daftarBlob = vi.hoisted(() => ({ current: [] as { pathname: string }[] }));
const isiBlob = vi.hoisted(() => ({ current: new Map<string, unknown>() }));
const blobHidup = vi.hoisted(() => ({ current: true }));
const cache = vi.hoisted(() => ({ current: new Map<string, unknown>() }));

vi.mock('@vercel/blob', () => ({
  list: vi.fn(async ({ cursor }: { cursor?: string }) => {
    if (!blobHidup.current) throw new Error('Vercel Blob: store suspended');
    const all = [...daftarBlob.current].sort((a, b) => a.pathname.localeCompare(b.pathname));
    const start = cursor ? Number(cursor) : 0;
    return { blobs: all.slice(start, start + 1000), hasMore: false, cursor: undefined };
  }),
  get: vi.fn(async (pathname: string) => {
    if (!blobHidup.current) throw new Error('Vercel Blob: store suspended');
    const isi = isiBlob.current.get(pathname);
    if (isi === undefined) return null;
    return { stream: new Response(JSON.stringify(isi)).body };
  }),
  put: vi.fn(async (pathname: string) => {
    if (!blobHidup.current) throw new Error('Vercel Blob: store suspended');
    return { pathname };
  }),
}));

/** A stand-in for the platform cache, which is what the session tier is stored in. */
vi.mock('@vercel/functions', () => ({
  getCache: () => ({
    get: async (k: string) => cache.current.get(k),
    set: async (k: string, v: unknown) => {
      cache.current.set(k, v);
    },
  }),
}));

function catatan(runId: string, startedAtUtc: string, label: string) {
  return {
    runId,
    scenarioLabel: label,
    group: 'serangan',
    host: 'mrh-rad-ws-07',
    startedAtUtc,
    dialAtStart: 'MONITOR_ONLY',
    finalVerdict: 'MASS_ENCRYPTION',
    containmentExecuted: false,
    // A real chain, so the assertions below prove the detail view is genuinely usable from the fallback.
    chain: [
      {
        action_id: 'act-1',
        chain_seq: 0,
        action_type: 'ISOLATE_HOST',
        outcome: 'QUEUED',
        autonomy_mode: 'MONITOR_ONLY',
        prev_hash: '0'.repeat(64),
        record_hash: 'a'.repeat(64),
        detail: 'log only',
      },
    ],
  };
}

function runId(ms: number, tag: string): string {
  return `run-${ms.toString(36)}-${tag}`;
}

function tulisBlob(pathname: string, isi: unknown): void {
  daftarBlob.current.push({ pathname });
  isiBlob.current.set(pathname, isi);
}

async function modul() {
  return await import('../lib/server/insiden.js');
}

beforeEach(() => {
  vi.resetModules();
  daftarBlob.current = [];
  isiBlob.current = new Map();
  cache.current = new Map();
  blobHidup.current = true;
  process.env.BLOB_READ_WRITE_TOKEN = 'uji';
  process.env.VERCEL = '1'; // what store.ts uses to decide the platform cache is real
});

describe('a run performed while durable storage is down is still recorded', () => {
  it('writes to the session tier even when the blob write throws', async () => {
    blobHidup.current = false;
    const ms = Date.UTC(2026, 7, 5, 7, 0, 0);
    const id = runId(ms, 'padam');
    const c = catatan(id, new Date(ms).toISOString(), 'Serangan saat penyimpanan padam');

    const { simpanInsiden, daftarInsiden } = await modul();
    expect(await simpanInsiden(c as never)).toBeNull(); // durable write failed, and says so

    const hasil = await daftarInsiden();
    expect(hasil.status).toBe('sesi'); // named as the weaker tier, never as 'hidup'
    expect(hasil.rows).toHaveLength(1);
    expect(hasil.rows[0]?.runId).toBe(id);
  });

  it('still opens the detail view and its hash chain from the fallback', async () => {
    blobHidup.current = false;
    const ms = Date.UTC(2026, 7, 5, 7, 5, 0);
    const id = runId(ms, 'detail');
    const c = catatan(id, new Date(ms).toISOString(), 'Rantai harus tetap terbuka');

    const { simpanInsiden, ambilInsiden } = await modul();
    await simpanInsiden(c as never);

    const detail = await ambilInsiden(id);
    expect(detail?.runId).toBe(id);
    // A history you can list but not inspect proves nothing, so the fallback stores full records.
    expect(detail?.chain).toHaveLength(1);
    expect(detail?.chain[0]?.record_hash).toBe('a'.repeat(64));
  });

  it('counts from the fallback rather than publishing a zero', async () => {
    blobHidup.current = false;
    const { simpanInsiden, hitungInsiden } = await modul();
    for (let i = 0; i < 3; i++) {
      const ms = Date.UTC(2026, 7, 5, 8, i, 0);
      await simpanInsiden(catatan(runId(ms, `h${i}`), new Date(ms).toISOString(), `Run ${i}`) as never);
    }
    expect(await hitungInsiden()).toEqual({ status: 'sesi', jumlah: 3 });
  });
});

describe('the two tiers are merged, not stacked', () => {
  it('shows one row per run when a record is in both tiers, preferring the durable copy', async () => {
    const ms = Date.UTC(2026, 7, 5, 9, 0, 0);
    const id = runId(ms, 'dua');
    const iso = new Date(ms).toISOString();
    const c = catatan(id, iso, 'Ada di dua lapis');

    const { simpanInsiden, daftarInsiden } = await modul();
    const pathname = await simpanInsiden(c as never); // writes BOTH tiers
    expect(pathname).not.toBeNull();
    tulisBlob(pathname as string, c); // the durable store now genuinely holds it

    const hasil = await daftarInsiden();
    expect(hasil.status).toBe('hidup');
    expect(hasil.rows.filter((r) => r.runId === id)).toHaveLength(1);
    // The durable row wins, which is how the detail view keeps resolving to the permanent copy.
    expect(hasil.rows[0]?.pathname).toBe(pathname);
  });

  it('shows a run the durable memo has not caught up with yet', async () => {
    // The durable list is memoised for two minutes. Freshness is supposed to come from the shared tier,
    // and this is the assertion that makes that claim true: a run written after the memo was taken is
    // still on screen, which is what lets the memo be long enough to keep the operation count near zero.
    const lama = Date.UTC(2026, 7, 5, 10, 0, 0);
    const idLama = runId(lama, 'lama');
    const isoLama = new Date(lama).toISOString();
    tulisBlob(`insiden/${isoLama.replace(/[:.]/g, '-')}_${idLama}.json`, catatan(idLama, isoLama, 'Lama'));

    const { daftarInsiden, simpanInsiden } = await modul();
    expect((await daftarInsiden()).rows).toHaveLength(1); // memo now holds only the old run

    const baru = Date.UTC(2026, 7, 5, 10, 30, 0);
    const idBaru = runId(baru, 'baru');
    blobHidup.current = false; // the durable write fails, so ONLY the session tier has this run
    await simpanInsiden(catatan(idBaru, new Date(baru).toISOString(), 'Baru saja dijalankan') as never);
    blobHidup.current = true;

    const hasil = await daftarInsiden();
    expect(hasil.rows.map((r) => r.runId)).toContain(idBaru);
    expect(hasil.rows[0]?.runId).toBe(idBaru); // newest first
  });
});

describe('the weaker tier is never dressed up as the stronger one', () => {
  it('reports hidup only when durable storage actually answered', async () => {
    const ms = Date.UTC(2026, 7, 5, 11, 0, 0);
    const id = runId(ms, 'tahan');
    const iso = new Date(ms).toISOString();
    tulisBlob(`insiden/${iso.replace(/[:.]/g, '-')}_${id}.json`, catatan(id, iso, 'Permanen'));

    const { daftarInsiden } = await modul();
    expect((await daftarInsiden()).status).toBe('hidup');
  });

  it('reports gagal, not sesi, when both tiers are empty and storage is down', async () => {
    blobHidup.current = false;
    const { daftarInsiden, hitungInsiden } = await modul();
    const hasil = await daftarInsiden();
    expect(hasil.status).toBe('gagal');
    expect(hasil.rows).toEqual([]);
    expect((await hitungInsiden()).jumlah).toBe(0); // never publish a number we cannot stand behind
  });

  it('keeps the fallback bounded so it cannot grow without limit', async () => {
    blobHidup.current = false;
    const { simpanInsiden, daftarInsiden } = await modul();
    for (let i = 0; i < 55; i++) {
      const ms = Date.UTC(2026, 7, 5, 12, i, 0);
      await simpanInsiden(catatan(runId(ms, `b${i}`), new Date(ms).toISOString(), `Run ${i}`) as never);
    }
    const hasil = await daftarInsiden();
    expect(hasil.rows.length).toBeLessThanOrEqual(40); // MAX_RIWAYAT, an explicit ceiling
    expect(hasil.rows[0]?.scenarioLabel).toBe('Run 54'); // and it keeps the NEWEST, not the oldest
  });
});
