import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The incident history, tested at the boundary that actually broke.
 *
 * An adversarial audit wrote 60 backdated blobs to the real store and measured the result: the history
 * returned 50 rows and NOT ONE of them was a real record, while the detail view of a genuine attack run
 * answered 404. The cause is that `list()` returns lexicographic ASCENDING and `limit` truncates from the
 * front, so asking for the most recent 50 returned the OLDEST 50. It is the worst shape a bug can take
 * for this product: it appears only past the 51st incident, it is silent, and what disappears is the run
 * that was just performed in front of the room.
 *
 * A second measured defect: `takePending()` is a read-modify-write across instances, and one request was
 * popped by two streams and executed twice, producing two records for one runId with two different audit
 * chain heads. "You say the chain is immutable and attributable, so why does this incident have two
 * heads" is not a question worth taking on stage.
 *
 * These tests mock the blob SDK because the point is the ordering, paging and dedup logic, not the
 * network. They fail against the previous implementation.
 */

const daftarBlob = vi.hoisted(() => ({ current: [] as { pathname: string }[] }));
const isiBlob = vi.hoisted(() => ({ current: new Map<string, unknown>() }));

vi.mock('@vercel/blob', () => ({
  list: vi.fn(async ({ cursor }: { cursor?: string }) => {
    // Page in 1000s the way the SDK does, and hand back ASCENDING order, which is the real behaviour
    // that the old code mistook for "already newest first".
    const all = [...daftarBlob.current].sort((a, b) => a.pathname.localeCompare(b.pathname));
    const start = cursor ? Number(cursor) : 0;
    const page = all.slice(start, start + 1000);
    const next = start + 1000;
    return { blobs: page, hasMore: next < all.length, cursor: next < all.length ? String(next) : undefined };
  }),
  get: vi.fn(async (pathname: string) => {
    const isi = isiBlob.current.get(pathname);
    if (isi === undefined) return null;
    return { stream: new Response(JSON.stringify(isi)).body };
  }),
  put: vi.fn(async (pathname: string) => ({ pathname })),
}));

/** A record shaped like the real one, with only the fields the summary reads. */
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
    chain: [{ action_id: 'act-1' }],
  };
}

/** runId in the production shape: `run-<base36 request ms>-<hex>`. */
function runId(ms: number, tag: string): string {
  return `run-${ms.toString(36)}-${tag}`;
}

function tulis(pathname: string, isi: unknown): void {
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
  process.env.BLOB_READ_WRITE_TOKEN = 'uji';
});

describe('incident history ordering past the page limit', () => {
  it('returns the NEWEST incidents when there are far more than one page shows', async () => {
    const dasar = Date.UTC(2026, 7, 4, 0, 0, 0);
    // 80 incidents, one per minute. The last one is the run that just happened on stage.
    for (let i = 0; i < 80; i++) {
      const ms = dasar + i * 60_000;
      const id = runId(ms, `x${i}`);
      const iso = new Date(ms).toISOString();
      tulis(`insiden/${iso.replace(/[:.]/g, '-')}_${id}.json`, catatan(id, iso, `Run ${i}`));
    }
    const { daftarInsiden } = await modul();
    const { status, rows } = await daftarInsiden();

    expect(status).toBe('hidup');
    expect(rows.length).toBeGreaterThan(0);
    // The single assertion the old implementation could not pass: the most recent run is present.
    expect(rows[0]?.scenarioLabel).toBe('Run 79');
    expect(rows.map((r) => r.scenarioLabel)).not.toContain('Run 0');
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]?.startedAtUtc >= (rows[i]?.startedAtUtc ?? '')).toBe(true);
    }
  });

  it('resolves the detail of a recent incident even when it sits past the first page', async () => {
    const dasar = Date.UTC(2026, 7, 4, 0, 0, 0);
    let terbaru = '';
    for (let i = 0; i < 1200; i++) {
      const ms = dasar + i * 60_000;
      const id = runId(ms, `y${i}`);
      const iso = new Date(ms).toISOString();
      terbaru = id;
      tulis(`insiden/${iso.replace(/[:.]/g, '-')}_${id}.json`, catatan(id, iso, `Run ${i}`));
    }
    const { ambilInsiden } = await modul();
    // Past 1000 blobs this needs a second list() page; the old find() on one truncated page 404ed here.
    const detail = await ambilInsiden(terbaru);
    expect(detail?.runId).toBe(terbaru);
    expect(detail?.scenarioLabel).toBe('Run 1199');
  });
});

describe('one request that was executed twice is still one incident', () => {
  it('collapses two executions of the same runId into a single history row', async () => {
    const permintaanMs = Date.UTC(2026, 7, 4, 12, 17, 54);
    const id = runId(permintaanMs, 'dup');
    // The measured production case: two executions 9 ms apart, each writing its own record.
    const a = catatan(id, new Date(permintaanMs + 793).toISOString(), 'Enkripsi arsip sah');
    const b = catatan(id, new Date(permintaanMs + 802).toISOString(), 'Enkripsi arsip sah');

    const { simpanInsiden, daftarInsiden } = await modul();
    const p1 = await simpanInsiden(a as never);
    const p2 = await simpanInsiden(b as never);

    // Naming from the REQUEST time is what makes the second write land on the first one's pathname.
    expect(p1).toBe(p2);

    tulis(p1 as string, b);
    const { rows } = await daftarInsiden();
    expect(rows.filter((r) => r.runId === id)).toHaveLength(1);
  });

  it('still shows one row per runId for a duplicate pair written before the naming fix', async () => {
    const permintaanMs = Date.UTC(2026, 7, 4, 12, 17, 54);
    const id = runId(permintaanMs, 'lama');
    // Legacy shape: each execution named itself, so two distinct pathnames exist in the store already.
    const t1 = new Date(permintaanMs + 793).toISOString();
    const t2 = new Date(permintaanMs + 802).toISOString();
    tulis(`insiden/${t1.replace(/[:.]/g, '-')}_${id}.json`, catatan(id, t1, 'Enkripsi arsip sah'));
    tulis(`insiden/${t2.replace(/[:.]/g, '-')}_${id}.json`, catatan(id, t2, 'Enkripsi arsip sah'));

    const { daftarInsiden } = await modul();
    const { rows } = await daftarInsiden();
    expect(rows.filter((r) => r.runId === id)).toHaveLength(1);
  });
});

describe('a store that refuses us is not an empty history', () => {
  /**
   * The demo-morning outage. The blob store was SUSPENDED for exceeding its operation allowance, so
   * every read threw. The old code caught that and returned [], and /api/bukti reported storage as
   * active because the env var still existed. The dashboard therefore showed an empty history beside a
   * green "storage active" and no error anywhere. Two different facts must never render identically.
   */
  it('reports gagal, not an empty list, when the store throws', async () => {
    const { list } = (await import('@vercel/blob')) as unknown as { list: ReturnType<typeof vi.fn> };
    list.mockImplementationOnce(() => {
      throw new Error('Vercel Blob: Access denied, please provide a valid token for this resource.');
    });
    const { daftarInsiden } = await modul();
    const hasil = await daftarInsiden();
    expect(hasil.status).toBe('gagal');
    expect(hasil.rows).toEqual([]);
  });

  it('does not memoise a failure, so the history returns as soon as the store does', async () => {
    const ms = Date.UTC(2026, 7, 5, 1, 0, 0);
    const id = runId(ms, 'pulih');
    const iso = new Date(ms).toISOString();
    tulis(`insiden/${iso.replace(/[:.]/g, '-')}_${id}.json`, catatan(id, iso, 'Setelah pulih'));

    const { list } = (await import('@vercel/blob')) as unknown as { list: ReturnType<typeof vi.fn> };
    list.mockImplementationOnce(() => {
      throw new Error('suspended');
    });
    const { daftarInsiden } = await modul();
    expect((await daftarInsiden()).status).toBe('gagal');
    // Immediately afterwards, inside what would be the memo window, the store answers again.
    const pulih = await daftarInsiden();
    expect(pulih.status).toBe('hidup');
    expect(pulih.rows).toHaveLength(1);
  });

  it('counts without reading a single incident blob, which is what suspended the store', async () => {
    for (let i = 0; i < 12; i++) {
      const ms = Date.UTC(2026, 7, 5, 2, i, 0);
      const id = runId(ms, `c${i}`);
      const iso = new Date(ms).toISOString();
      tulis(`insiden/${iso.replace(/[:.]/g, '-')}_${id}.json`, catatan(id, iso, `Run ${i}`));
    }
    const { get } = (await import('@vercel/blob')) as unknown as { get: ReturnType<typeof vi.fn> };
    get.mockClear();
    const { hitungInsiden } = await modul();
    const hasil = await hitungInsiden();
    expect(hasil).toEqual({ status: 'hidup', jumlah: 12 });
    expect(get).not.toHaveBeenCalled(); // the whole point: a count costs list(), never a read per record
  });
});

describe('storage that is not configured must not take the demo down with it', () => {
  it('returns an empty history rather than throwing when the token is absent', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = '';
    const { daftarInsiden, ambilInsiden, simpanInsiden } = await modul();
    expect(await daftarInsiden()).toEqual({ status: 'mati', rows: [] });
    expect(await ambilInsiden('run-apa-pun')).toBeNull();
    expect(await simpanInsiden(catatan('run-x-1', new Date().toISOString(), 'x') as never)).toBeNull();
  });
});
