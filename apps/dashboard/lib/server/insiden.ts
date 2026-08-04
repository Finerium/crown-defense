import type { DetectionSignal } from '@crown/contracts';
import { get, list, put } from '@vercel/blob';
import type { CatatanInsiden, RingkasanInsiden } from './types';

/**
 * THE INCIDENT LOG. Attacks that survive the session.
 *
 * Before this existed the answer to "we ran five attacks, where are the records" was: there are none.
 * setChain() overwrote the previous run's chain, the shared copy aged out in fifteen minutes, the
 * browser's copy died on reload, and no route could fetch a past run at all. For a product whose pitch
 * is an immutable, attributable, exportable audit trail, that was the gap that mattered most, and a
 * dashboard with no past is the single clearest tell that something is a mockup rather than a system.
 *
 * Storage is Vercel Blob, private, same region as the functions. One JSON per incident, and the pathname
 * starts with the UTC timestamp:
 *
 *     insiden/2026-08-04T10-22-00-000Z_run-xxxx.json
 *
 * The timestamp in the name is the REQUEST time, recovered from the runId, not the execution's own start
 * (see waktuPermintaan). There is still NO index blob to keep in sync and therefore NO read-modify-write
 * race when two runs finish close together. Ordering is NOT taken from list(), which returns ascending
 * and truncates from the wrong end; it is decided in daftarNama() from the request time.
 *
 * TIMESTAMPS. The frozen contracts require UTC ISO-8601 with milliseconds everywhere, and that is what is
 * stored, without exception. Waktu Indonesia Barat is a RENDERING concern and is applied at display time
 * only. Storing local time would corrupt the record for anyone reading it from another timezone, and
 * would break the ordering the pathname scheme depends on.
 *
 * DEGRADATION. If Blob is unreachable or unconfigured, every function here fails soft and the demo keeps
 * working exactly as it did before: the live run still streams, the chain is still sealed and verifiable
 * in memory. Losing the history must never take the product down with it, which is the same fail-safe
 * rule the containment path follows.
 */

const PREFIX = 'insiden/';
/** How many incidents the history shows. The dashboard shows a recent history, not an archive. */
const MAX_TAMPIL = 30;
/** Pages of list() to walk before giving up. 5 x 1000 is far past anything a demo store will hold. */
const MAX_HALAMAN = 5;

function aktif(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * The request time, recovered from the runId.
 *
 * runIds are minted as `run-<base36 ms>-<hex>` once, when the request is ENQUEUED. That matters twice
 * over. It gives every record a scheme-independent sort key that does not depend on parsing a pathname,
 * and it is stable across a request that gets executed more than once, which is a thing that provably
 * happens: takePending() is a read-modify-write across instances, and an audit measured one request
 * popped by two streams, executed twice, and written as TWO history rows for one runId with two
 * different chain head hashes. Naming the blob from the REQUEST rather than from each execution's own
 * start makes both writes land on the same pathname, so the second collapses onto the first.
 */
function waktuPermintaan(runId: string, cadangan: string): number {
  const ms = Number.parseInt(runId.split('-')[1] ?? '', 36);
  if (Number.isFinite(ms) && ms > 0) return ms;
  const t = new Date(cadangan).getTime();
  return Number.isFinite(t) ? t : 0;
}

function namaBerkas(startedAtUtc: string, runId: string): string {
  const iso = new Date(waktuPermintaan(runId, startedAtUtc)).toISOString();
  return `${PREFIX}${iso.replace(/[:.]/g, '-')}_${runId}.json`;
}

/** runId out of `insiden/<ts>_<runId>.json`, or null if the name does not fit the scheme. */
function runIdDari(pathname: string): string | null {
  const m = /_([^/]+)\.json$/.exec(pathname);
  return m?.[1] ?? null;
}

/**
 * Every incident pathname, newest first, one entry per runId.
 *
 * list() returns lexicographic ASCENDING and `limit` truncates from the front, so the previous version
 * asked for 50 and got the 50 OLDEST. An audit proved it: past the 51st incident the newest records fell
 * off the history entirely and their detail views 404ed. That is the worst possible shape of failure,
 * because what goes missing is the run that was just performed on stage, and it fails silently.
 *
 * So the whole prefix is walked by cursor and the ordering is decided here, on the request time carried
 * inside the runId, which is scheme-independent and survives a rename of the pathname format.
 */
async function daftarNama(): Promise<{ pathname: string; ms: number }[]> {
  const semua: { pathname: string; ms: number }[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < MAX_HALAMAN; i++) {
    const r = await list({ prefix: PREFIX, limit: 1000, cursor });
    for (const b of r.blobs) {
      const runId = runIdDari(b.pathname);
      if (runId) semua.push({ pathname: b.pathname, ms: waktuPermintaan(runId, '') });
    }
    if (!r.hasMore || !r.cursor) break;
    cursor = r.cursor;
  }
  // One row per runId even if a legacy duplicate pair predates the naming fix: keep the newest write.
  const perRun = new Map<string, { pathname: string; ms: number }>();
  for (const e of semua) {
    const runId = runIdDari(e.pathname);
    if (!runId) continue;
    const ada = perRun.get(runId);
    if (!ada || e.pathname > ada.pathname) perRun.set(runId, e);
  }
  return [...perRun.values()].sort((a, b) => b.ms - a.ms);
}

/** Persist one finished incident. Fails soft: a storage outage must never break a running demo. */
export type { CatatanInsiden, RingkasanInsiden };

export async function simpanInsiden(c: CatatanInsiden): Promise<string | null> {
  if (!aktif()) return null;
  try {
    const r = await put(namaBerkas(c.startedAtUtc, c.runId), JSON.stringify(c, null, 2), {
      // The store is PRIVATE, so blobs are private too. Reads go through get() with the server-side
      // token, never through a public URL. Judges reach this data via our own API route, which is what
      // we want anyway: the history is readable by anyone, the storage credentials are not.
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return r.pathname;
  } catch {
    return null; // history is a nice-to-have; detection, containment and audit are not
  }
}

/**
 * The history, newest first. Built from list() alone: the summary fields are packed into the blob's own
 * pathname at write time, so listing costs one request and reading N incidents is not N requests.
 */
export async function daftarInsiden(): Promise<RingkasanInsiden[]> {
  if (!aktif()) return [];
  try {
    const blobs = (await daftarNama()).slice(0, MAX_TAMPIL);
    const rows = await Promise.all(
      blobs.map(async (b) => {
        try {
          const g = await get(b.pathname, { access: 'private', useCache: false });
          if (!g) return null;
          const c = JSON.parse(await new Response(g.stream).text()) as CatatanInsiden;
          return {
            runId: c.runId,
            scenarioLabel: c.scenarioLabel,
            group: c.group,
            host: c.host,
            startedAtUtc: c.startedAtUtc,
            dialAtStart: c.dialAtStart,
            finalVerdict: c.finalVerdict,
            containmentExecuted: c.containmentExecuted,
            chainLength: c.chain.length,
            pathname: b.pathname,
          } satisfies RingkasanInsiden;
        } catch {
          return null;
        }
      })
    );
    // Order was already decided by daftarNama() on the request time; do not re-sort on the execution
    // start, which is what let two executions of one request interleave in the list.
    return rows.filter((r): r is RingkasanInsiden => r !== null);
  } catch {
    return [];
  }
}

/** One incident in full, for the detail view and for export. */
export async function ambilInsiden(runId: string): Promise<CatatanInsiden | null> {
  if (!aktif()) return null;
  try {
    // Walks the whole prefix, so a detail view still resolves past the 51st incident. find() on a
    // truncated ascending page is what made recent runs 404 while their row was still on screen.
    const match = (await daftarNama()).find((b) => b.pathname.endsWith(`_${runId}.json`));
    if (!match) return null;
    const g = await get(match.pathname, { access: 'private', useCache: false });
    if (!g) return null;
    return JSON.parse(await new Response(g.stream).text()) as CatatanInsiden;
  } catch {
    return null;
  }
}

/** Signals that actually fired, by name. Kept here so the runner and the record agree on one shape. */
export function sinyalMenyala(signals: DetectionSignal[]): string[] {
  return signals.filter((s) => s.fired).map((s) => s.signal_type);
}
