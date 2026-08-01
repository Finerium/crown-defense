'use client';
/**
 * ============================================================================
 * INVARIANT, MIRRORED FROM app/api/konsol/jalankan/route.ts:
 * THIS CONSOLE HAS NO CODE PATH TO AN ALERT.
 * ============================================================================
 * It calls exactly three endpoints, and all three are verdict-free by construction:
 *   GET  /api/konsol/katalog  -> ScenarioSummary[]  (labels, hosts, families, honesty notes)
 *   POST /api/konsol/jalankan -> JalankanResponse   ({ runId, accepted: true }, nothing else)
 *   GET  /api/konsol/status   -> KonsolStatus|null  (phase, events, files, elapsed ms, nothing else)
 * plus POST /api/konsol/keluar to end the session.
 *
 * The four types imported below are the only types this file touches, and none of them has a verdict,
 * severity, signal, recommended action or containment field. The verdict-bearing types in
 * lib/server/types.ts (TikEvent, PutusanEvent, KontainmenEvent, SelesaiEvent, DetectionVerdict, Verdict,
 * RecommendedAction, ContainmentDecision) are deliberately NOT imported here, and neither is any module
 * that could construct one. The detection engine runs inside the telemetry stream and decides on its own.
 * ============================================================================
 */
import { useCallback, useEffect, useState } from 'react';
import { PRODUCT_NAME } from '../../lib/data';
import { type Lang, t, tf } from '../../lib/i18n';
import type { JalankanResponse, KonsolStatus, PesanResponse, ScenarioSummary } from '../../lib/server/types';
import { Glyph } from '../ui';

/** Bounded by construction: 1s polls, capped, so a forgotten tab cannot poll the API forever. */
const POLL_MS = 1000;
const MAX_POLLS = 300;

const PHASE_KEY = {
  antre: 'kn_phase_antre',
  berjalan: 'kn_phase_berjalan',
  selesai: 'kn_phase_selesai',
} as const;

/** Either a message the server wrote (already Indonesian) or one of our own dictionary keys. */
type Galat = { pesan: string } | { kunci: 'kn_err_catalogue' | 'kn_err_run' | 'kn_err_net' } | null;

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <span>
      <span className="kn-meta-k">{k}</span>
      <span className="kn-meta-v">{v}</span>
    </span>
  );
}

function Kartu({
  s,
  lang,
  busy,
  onRun,
}: {
  s: ScenarioSummary;
  lang: Lang;
  busy: boolean;
  onRun: (id: string) => void;
}) {
  const attack = s.group === 'serangan';
  const label = lang === 'id' ? s.labelId : s.labelEn;
  // The catalogue authors the note and the non-isolation expectation in Indonesian only, so they are
  // rendered as the server wrote them rather than being translated here or dropped.
  const note = attack ? s.noteId : s.expectedNonIsolationReasonId;
  const noteTitle = attack ? t('kn_m_note', lang) : t('kn_m_expect', lang);
  const noteId = note ? `kn-note-${s.id}` : undefined;

  return (
    <li>
      <button
        type="button"
        className={`kn-scn ${attack ? 'kn-scn-attack' : 'kn-scn-benign'}`}
        onClick={() => onRun(s.id)}
        disabled={busy}
        aria-label={tf('kn_start_aria', lang, { label })}
        aria-describedby={noteId}
      >
        <span className="kn-scn-title">
          <Glyph k={attack ? 'tri' : 'check'} size={11} color={attack ? '#ff8177' : '#6fd79b'} />
          {label}
        </span>
        <span className="kn-scn-desc">{attack ? s.descId : t('kn_benign_line', lang)}</span>
        <span className="kn-meta">
          <Meta k={t('col_host', lang)} v={s.host} />
          <Meta k={t('col_segment', lang)} v={s.segment} />
          {s.family ? <Meta k={t('kn_m_family', lang)} v={s.family} /> : null}
          {s.mode ? <Meta k={t('kn_m_mode', lang)} v={s.mode} /> : null}
          {s.technique ? <Meta k={t('kn_m_technique', lang)} v={s.technique} /> : null}
          {s.workload ? <Meta k={t('kn_m_workload', lang)} v={s.workload} /> : null}
        </span>
        <span className="kn-scn-go">
          <Glyph k="diamond" size={8} color={attack ? '#ff8177' : '#6fd79b'} />
          {busy ? t('kn_starting', lang) : t('kn_start', lang)}
        </span>
      </button>
      {note ? (
        <p className="kn-note" id={noteId}>
          <Glyph k="ring" size={10} color="#aeb9c8" />
          <span>
            <b>{noteTitle}</b>
            {note}
          </span>
        </p>
      ) : null}
    </li>
  );
}

export function Konsol({ label }: { label: string }) {
  const [lang, setLang] = useState<Lang>('id');
  const [katalog, setKatalog] = useState<ScenarioSummary[]>([]);
  // An error is either a message the SERVER wrote (rate limit, queue full) or one of our own keys, so the
  // wording follows the language toggle and the catalogue is never refetched just because the toggle moved.
  const [galat, setGalat] = useState<Galat>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<KonsolStatus | null>(null);
  const [jumlah, setJumlah] = useState(0);

  const keMasuk = useCallback(() => window.location.assign('/konsol/masuk'), []);

  useEffect(() => {
    let alive = true;
    fetch('/api/konsol/katalog', { cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 401) return keMasuk();
        if (!r.ok) throw new Error('katalog');
        const d = (await r.json()) as ScenarioSummary[];
        if (alive) setKatalog(d);
      })
      .catch(() => {
        if (alive) setGalat({ kunci: 'kn_err_catalogue' });
      });
    return () => {
      alive = false;
    };
  }, [keMasuk]);

  useEffect(() => {
    if (!runId) return;
    let polls = 0;
    const id = setInterval(async () => {
      polls += 1;
      if (polls > MAX_POLLS) {
        clearInterval(id);
        return;
      }
      try {
        const r = await fetch('/api/konsol/status', { cache: 'no-store' });
        if (!r.ok) return;
        const d = (await r.json()) as KonsolStatus | null;
        if (!d || d.runId !== runId) return; // never render another operator's run as if it were ours
        setStatus(d);
        if (d.phase === 'selesai') clearInterval(id);
      } catch {
        /* a transient poll failure is not worth an error state; the next tick retries */
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [runId]);

  async function jalankan(id: string) {
    setSibuk(id);
    setGalat(null);
    try {
      const r = await fetch('/api/konsol/jalankan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scenarioId: id }),
      });
      if (r.status === 401) {
        keMasuk();
        return;
      }
      const d = (await r.json()) as JalankanResponse | PesanResponse;
      if (!r.ok || !('runId' in d)) {
        setGalat('pesan' in d ? { pesan: d.pesan } : { kunci: 'kn_err_run' });
        return;
      }
      setStatus(null); // no fabricated counters: the progress panel stays empty until the API answers
      setRunId(d.runId);
      setJumlah((n) => n + 1);
    } catch {
      setGalat({ kunci: 'kn_err_net' });
    } finally {
      setSibuk(null);
    }
  }

  async function keluar() {
    await fetch('/api/konsol/keluar', { method: 'POST' }).catch(() => undefined);
    keMasuk();
  }

  const serangan = katalog.filter((s) => s.group === 'serangan');
  const sah = katalog.filter((s) => s.group === 'sah');
  const pesanGalat = galat === null ? null : 'pesan' in galat ? galat.pesan : t(galat.kunci, lang);

  return (
    <div className="kn-root" lang={lang}>
      <p className="kn-banner" role="note">
        <Glyph k="tri" size={11} color="#ff8177" />
        <span>{t('kn_banner', lang)}</span>
      </p>

      <header className="kn-bar">
        <div className="kn-bar-brand">
          <span className="kn-bar-name">{PRODUCT_NAME.toUpperCase()}</span>
          {/* The page title is the console name, so it is the h1 the panel h2s sit under. */}
          <h1 className="kn-bar-sub">{t('kn_title', lang).toUpperCase()}</h1>
        </div>
        <div className="kn-bar-right">
          <span className="kn-tag">
            <Glyph k="circle" size={7} color="#6fd79b" />
            {t('kn_signed_in', lang)} <b>{label}</b>
          </span>
          <span className="kn-tag">{tf('kn_runs_session', lang, { n: jumlah })}</span>
          <button
            type="button"
            className="kn-btn"
            onClick={() => setLang(lang === 'id' ? 'en' : 'id')}
            aria-label={t('aria_toggle_language', lang)}
          >
            {lang.toUpperCase()}
          </button>
          <button type="button" className="kn-btn" onClick={keluar}>
            <Glyph k="x" size={9} color="#aeb9c8" />
            {t('kn_logout', lang)}
          </button>
        </div>
      </header>

      <main className="kn-main">
        <div className="kn-col">
          <div role="alert" aria-live="assertive">
            {pesanGalat ? (
              <p className="kn-alert">
                <Glyph k="tri" size={11} color="#ff8177" />
                <span>{pesanGalat}</span>
              </p>
            ) : null}
          </div>

          {katalog.length === 0 && !pesanGalat ? <p className="kn-empty">{t('kn_loading', lang)}</p> : null}

          {serangan.length > 0 ? (
            <section className="kn-panel kn-panel-danger" aria-labelledby="kn-h-serangan">
              <div className="kn-panel-h">
                <Glyph k="tri" size={11} color="#ff8177" />
                <h2 id="kn-h-serangan">{t('kn_group_attack', lang)}</h2>
              </div>
              <p className="kn-panel-sub">{t('kn_group_attack_sub', lang)}</p>
              <div className="kn-panel-b">
                <ul className="kn-list">
                  {serangan.map((s) => (
                    <Kartu key={s.id} s={s} lang={lang} busy={sibuk === s.id} onRun={jalankan} />
                  ))}
                </ul>
              </div>
            </section>
          ) : null}

          {sah.length > 0 ? (
            <section className="kn-panel kn-panel-safe" aria-labelledby="kn-h-sah">
              <div className="kn-panel-h">
                <Glyph k="check" size={11} color="#6fd79b" />
                <h2 id="kn-h-sah">{t('kn_group_benign', lang)}</h2>
              </div>
              <p className="kn-panel-sub">{t('kn_group_benign_sub', lang)}</p>
              <div className="kn-panel-b">
                <ul className="kn-list">
                  {sah.map((s) => (
                    <Kartu key={s.id} s={s} lang={lang} busy={sibuk === s.id} onRun={jalankan} />
                  ))}
                </ul>
              </div>
            </section>
          ) : null}
        </div>

        <div className="kn-col">
          <section className="kn-panel" aria-labelledby="kn-h-status">
            <div className="kn-panel-h">
              <Glyph
                k="arc"
                size={11}
                color="#aeb9c8"
                className={status?.phase === 'berjalan' ? 'kn-live' : ''}
              />
              <h2 id="kn-h-status">{t('kn_status_title', lang)}</h2>
            </div>
            <div className="kn-panel-b" aria-live="polite">
              {!runId ? <p className="kn-empty">{t('kn_no_run', lang)}</p> : null}
              {runId && !status ? (
                <dl className="kn-kv">
                  <dt>{t('kn_f_runid', lang)}</dt>
                  <dd>{runId}</dd>
                  <dt>{t('kn_f_phase', lang)}</dt>
                  <dd>{t('kn_awaiting', lang)}</dd>
                </dl>
              ) : null}
              {status ? (
                <>
                  <dl className="kn-kv">
                    <dt>{t('kn_f_runid', lang)}</dt>
                    <dd>{status.runId}</dd>
                    <dt>{t('kn_f_phase', lang)}</dt>
                    <dd>
                      <span className="kn-phase">
                        <Glyph
                          k={
                            status.phase === 'selesai'
                              ? 'check'
                              : status.phase === 'berjalan'
                                ? 'arc'
                                : 'ring'
                          }
                          size={9}
                          color={status.phase === 'selesai' ? '#6fd79b' : '#aeb9c8'}
                          className={status.phase === 'berjalan' ? 'kn-live' : ''}
                        />
                        {t(PHASE_KEY[status.phase], lang)}
                      </span>
                    </dd>
                    <dt>{t('kn_f_events', lang)}</dt>
                    <dd>{status.eventsEmitted}</dd>
                    <dt>{t('kn_f_files', lang)}</dt>
                    <dd>{status.filesTouched}</dd>
                    <dt>{t('kn_f_elapsed', lang)}</dt>
                    <dd>{status.elapsedMs} ms</dd>
                  </dl>
                  {status.phase === 'antre' ? (
                    <p className="kn-note">
                      <Glyph k="ring" size={10} color="#aeb9c8" />
                      <span>{t('kn_phase_antre_note', lang)}</span>
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          </section>

          <section className="kn-panel" aria-labelledby="kn-h-novrd">
            <div className="kn-panel-h">
              <Glyph k="x" size={11} color="#ff8177" />
              <h2 id="kn-h-novrd">{t('kn_novrd_title', lang)}</h2>
            </div>
            <div className="kn-panel-b">
              <p className="kn-body">{t('kn_novrd_body1', lang)}</p>
              <p className="kn-body">{tf('kn_novrd_body2', lang, { product: PRODUCT_NAME })}</p>
              <a className="kn-link" href="/dashboard" target="_blank" rel="noopener noreferrer">
                <Glyph k="diamond" size={9} color="#9ecbff" />
                {t('kn_open_dashboard', lang)}
              </a>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
