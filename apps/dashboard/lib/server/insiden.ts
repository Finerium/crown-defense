import { get, list, put } from '@vercel/blob';
import type { ActionRecord, AutonomyMode, DetectionSignal } from '@crown/contracts';

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
 * That detail is load bearing. Because the name sorts lexicographically in timestamp order, list() with
 * a prefix returns the history already in order, so there is NO index blob to keep in sync and therefore
 * NO read-modify-write race when two runs finish close together. Each run writes only its own file and
 * can never clobber another.
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
/** Bounded read. The dashboard shows a recent history, not an archive; nobody paginates on stage. */
const MAX_LIST = 50;

/** One recorded incident. Everything a judge could want to check about a run that already happened. */
export interface CatatanInsiden {
  runId: string;
  scenarioId: string;
  scenarioLabel: string;
  group: 'serangan' | 'sah';
  host: string;
  segment: string;
  family: string | null;
  mode: string | null;
  /** UTC ISO-8601 with milliseconds. Rendered as WIB by the UI, never stored as local time. */
  startedAtUtc: string;
  finishedAtUtc: string;
  dialAtStart: AutonomyMode;
  finalVerdict: string;
  destructiveVerdictReached: boolean;
  corroboratingCount: number | null;
  fastPath: boolean | null;
  signalsFired: string[];
  suppressedByAllowlist: boolean;
  suppressionReason: string | null;
  disposition: string | null;
  containmentExecuted: boolean;
  commandIssued: boolean;
  filesTouched: number;
  eventsIngested: number;
  detectionWallMs: number | null;
  containmentWallMs: number | null;
  chain: ActionRecord[];
  chainHeadHash: string | null;
  scratchRemoved: boolean;
}

/** Summary row for the history list. Deliberately small: the list must load in one request. */
export interface RingkasanInsiden {
  runId: string;
  scenarioLabel: string;
  group: 'serangan' | 'sah';
  host: string;
  startedAtUtc: string;
  dialAtStart: AutonomyMode;
  finalVerdict: string;
  containmentExecuted: boolean;
  chainLength: number;
  pathname: string;
}

function aktif(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** Pathname sorts in timestamp order, which is what removes the need for an index. */
function namaBerkas(startedAtUtc: string, runId: string): string {
  return `${PREFIX}${startedAtUtc.replace(/[:.]/g, '-')}_${runId}.json`;
}

/** Persist one finished incident. Fails soft: a storage outage must never break a running demo. */
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
    const { blobs } = await list({ prefix: PREFIX, limit: MAX_LIST });
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
    return rows
      .filter((r): r is RingkasanInsiden => r !== null)
      .sort((a, b) => b.startedAtUtc.localeCompare(a.startedAtUtc));
  } catch {
    return [];
  }
}

/** One incident in full, for the detail view and for export. */
export async function ambilInsiden(runId: string): Promise<CatatanInsiden | null> {
  if (!aktif()) return null;
  try {
    const { blobs } = await list({ prefix: PREFIX, limit: MAX_LIST });
    const match = blobs.find((b) => b.pathname.endsWith(`_${runId}.json`));
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
