'use client';
/**
 * Crown Defense public landing page (route "/"). Its whole job is to carry the thesis and route a visitor
 * to the two surfaces: the public /dashboard and the credential-gated /konsol.
 *
 * Rules this file is held to:
 *  - Every printed figure traces to a file, and the file is printed next to it. Nothing is invented; where a
 *    number does not exist yet the copy says so ("belum diukur" / "not yet measured").
 *  - No hardcoded user-facing string. Everything routes through lib/i18n (ID default, EN toggle).
 *  - The display name is PRODUCT_NAME, re-exported through lib/data. "talos" is an internal codename and is
 *    never user-facing.
 *  - Status is never colour alone: every coloured element carries a Glyph and a text label.
 *  - Motion is opt-in. app/landing.css keeps every animated and pre-hidden state inside
 *    `prefers-reduced-motion: no-preference`, so with reduced motion (or with JS off) this page renders
 *    complete and finished, just still.
 */
import { useEffect, useState } from 'react';
import { Glyph } from '../components/ui';
import { PRODUCT_NAME } from '../lib/data';
import { type Lang, t, tf } from '../lib/i18n';
import './landing.css';

const REPO_URL = 'https://github.com/Finerium/crown-defense';

/* --------------------------------------------------------------------------
   The speed-gap axis. Four durations on one logarithmic axis. The millisecond
   values are unit conversions of the printed labels, nothing more:
     5 days                -> 432_000_000 ms   (Mandiant M-Trends, 2024)
     5 min 50 s            ->     350_000 ms   (Splunk SURGe, 2022)
     detection p95         ->         333 ms   (reports/detection/coverage.json)
     containment p95       ->       0.066 ms   (reports/containment/latency.json)
   -------------------------------------------------------------------------- */
const AXIS_MIN_MS = 0.066;
const AXIS_MAX_MS = 432_000_000;
const AXIS_FLOOR = Math.log10(AXIS_MIN_MS);
const AXIS_SPAN = Math.log10(AXIS_MAX_MS) - AXIS_FLOOR;

/** Log-scale bar length. Floored at 2% so the shortest bar stays visible rather than vanishing. */
function axisPct(ms: number): number {
  return Math.max(2, ((Math.log10(ms) - AXIS_FLOOR) / AXIS_SPAN) * 100);
}

type GapRow = {
  side: 'att' | 'def';
  name: 'ld_s3_r1_l' | 'ld_s3_r2_l' | 'ld_s3_r3_l' | 'ld_s3_r4_l';
  value: 'ld_s3_r1_v' | 'ld_s3_r2_v' | 'ld_s3_r3_v' | 'ld_s3_r4_v';
  source: 'ld_s3_r1_s' | 'ld_s3_r2_s' | 'ld_s3_r3_s' | 'ld_s3_r4_s';
  ms: number;
};

const GAP_ROWS: GapRow[] = [
  { side: 'att', name: 'ld_s3_r1_l', value: 'ld_s3_r1_v', source: 'ld_s3_r1_s', ms: 432_000_000 },
  { side: 'att', name: 'ld_s3_r2_l', value: 'ld_s3_r2_v', source: 'ld_s3_r2_s', ms: 350_000 },
  { side: 'def', name: 'ld_s3_r3_l', value: 'ld_s3_r3_v', source: 'ld_s3_r3_s', ms: 333 },
  { side: 'def', name: 'ld_s3_r4_l', value: 'ld_s3_r4_v', source: 'ld_s3_r4_s', ms: 0.066 },
];

// Contract ids are read off docs/contracts.md, not guessed: C1 TelemetryEvent, C2 DetectionVerdict,
// C3 IncidentContext, C4 ActionRecord, C5 AutonomyDial + policy, C6 AgentCommand, C7 LLM artifacts,
// C9 HealthStatus, C10 shared data model. Each node is tagged with what it produces or renders.
const LOOP_NODES = [
  { contract: 'C1', title: 'ld_s4_c1_t', desc: 'ld_s4_c1_d' },
  { contract: 'C2', title: 'ld_s4_c2_t', desc: 'ld_s4_c2_d' },
  { contract: 'C4 / C5 / C6', title: 'ld_s4_c3_t', desc: 'ld_s4_c3_d' },
  { contract: 'C3 / C7', title: 'ld_s4_c4_t', desc: 'ld_s4_c4_d' },
  { contract: 'C9 / C10', title: 'ld_s4_c5_t', desc: 'ld_s4_c5_d' },
] as const;

const EVIDENCE = [
  { value: 'ld_s5_e1_v', label: 'ld_s5_e1_l', source: 'ld_s5_e1_s' },
  { value: 'ld_s5_e2_v', label: 'ld_s5_e2_l', source: 'ld_s5_e2_s' },
  { value: 'ld_s5_e3_v', label: 'ld_s5_e3_l', source: 'ld_s5_e3_s' },
] as const;

const SAFE_PROPS = [
  { title: 'ld_s6_p1', desc: 'ld_s6_p1d' },
  { title: 'ld_s6_p2', desc: 'ld_s6_p2d' },
  { title: 'ld_s6_p3', desc: 'ld_s6_p3d' },
  { title: 'ld_s6_p4', desc: 'ld_s6_p4d' },
  { title: 'ld_s6_p5', desc: 'ld_s6_p5d' },
  { title: 'ld_s6_p6', desc: 'ld_s6_p6d' },
] as const;

/** Stagger delay as a custom property. Read by `--ld-d` in landing.css. */
function delay(ms: number): React.CSSProperties {
  return { '--ld-d': `${ms}ms` } as React.CSSProperties;
}

/**
 * Reveal on scroll. Elements start visible in CSS and are only pre-hidden under
 * `prefers-reduced-motion: no-preference`, so this observer is pure enhancement: if it never runs, or the
 * browser lacks IntersectionObserver, or JS is off, the page is already correct.
 */
function useReveal(): void {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('.ld-rise'));
    if (typeof IntersectionObserver === 'undefined') {
      for (const el of els) el.classList.add('ld-in');
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('ld-in');
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 }
    );
    for (const el of els) io.observe(el);
    return () => io.disconnect();
  }, []);
}

export default function Page() {
  const [lang, setLang] = useState<Lang>('id'); // Indonesian-first product
  useReveal();

  useEffect(() => {
    document.documentElement.lang = lang; // WCAG 3.1.1, keep the document language truthful
  }, [lang]);

  // The landing is a dark surface by design. Pinning it also keeps it off talos.css's light `--acc`
  // (#4d7c0f), which lands at 4.41:1 on `--bg0` and would miss AA for the small accent text here.
  // The dashboard keeps its own theme toggle; it sets data-theme from its own state on mount.
  useEffect(() => {
    document.documentElement.dataset.theme = 'dark';
  }, []);

  // `lang` also sits on the wrapper so the SERVER-RENDERED html is already labelled Indonesian, before the
  // effect above runs. The shared <html lang="en"> stays untouched, so /dashboard is unaffected.
  return (
    <div className="ld-root" lang={lang}>
      <a className="ld-skip" href="#ld-main">
        {t('ld_skip', lang)}
      </a>

      <header className="ld-bar">
        <div className="ld-lockup">
          <div className="ld-mark" aria-hidden="true">
            <i />
          </div>
          <div>
            <div className="ld-wordmark">{PRODUCT_NAME}</div>
            <div className="ld-tagline">{t('brand_sub', lang)}</div>
          </div>
        </div>
        <div className="ld-bar-right">
          <div className="ld-lang">
            <button
              type="button"
              aria-pressed={lang === 'id'}
              aria-label={t('ld_lang_id', lang)}
              onClick={() => setLang('id')}
            >
              ID
            </button>
            <button
              type="button"
              aria-pressed={lang === 'en'}
              aria-label={t('ld_lang_en', lang)}
              onClick={() => setLang('en')}
            >
              EN
            </button>
          </div>
        </div>
      </header>

      <main id="ld-main">
        {/* ---------------------------------------------------------------- 1. HERO */}
        <section className="ld-hero">
          <div className="ld-hero-bg" aria-hidden="true" />
          <div className="ld-hero-glow" aria-hidden="true" />
          <div className="ld-scan" aria-hidden="true" />
          <div className="ld-wrap">
            <p className="ld-eyebrow ld-rise">
              <Glyph k="diamond" size={8} color="var(--acc)" />
              {t('brand_sub', lang)}
            </p>
            <h1 className="ld-h1 ld-rise" style={delay(60)}>
              <span>
                {t('ld_hero_h1_a', lang)} <em>{t('ld_hero_h1_min', lang)}</em>.
              </span>
              <span className="ld-dim">
                {t('ld_hero_h1_b', lang)} {t('ld_hero_h1_day', lang)}.
              </span>
            </h1>
            <p className="ld-lead ld-rise" style={delay(140)}>
              {tf('ld_hero_lead', lang, { product: PRODUCT_NAME })}
            </p>

            <div className="ld-ctas ld-rise" style={delay(220)}>
              <a className="ld-cta ld-cta-primary" href="/dashboard">
                {t('ld_cta_dashboard', lang)}
                <span className="ld-cta-note">{t('ld_cta_public', lang)}</span>
              </a>
              <a className="ld-cta" href="/konsol">
                <Glyph k="ring" size={11} color="var(--med)" />
                {t('ld_cta_konsol', lang)}
                <span className="ld-cta-note">{t('ld_cta_gated', lang)}</span>
              </a>
            </div>

            <p className="ld-gate ld-rise" style={delay(280)}>
              <Glyph k="ring" size={10} color="var(--med)" />
              <span>{t('ld_gate_note', lang)}</span>
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------------- 2. PROBLEM */}
        <section className="ld-sec">
          <div className="ld-wrap">
            <p className="ld-kicker ld-rise">
              <Glyph k="square" size={8} />
              {t('ld_s2_kicker', lang)}
            </p>
            <h2 className="ld-h2 ld-rise" style={delay(60)}>
              {t('ld_s2_title', lang)}
            </h2>
            <p className="ld-body ld-rise" style={delay(100)}>
              {t('ld_s2_body', lang)}
            </p>

            <div className="ld-stats">
              <div className="ld-stat ld-rise">
                <div className="ld-stat-v">{t('ld_s2_svc_v', lang)}</div>
                <p className="ld-stat-l">{t('ld_s2_svc_l', lang)}</p>
              </div>
              <div className="ld-stat ld-rise" style={delay(80)}>
                <div className="ld-stat-v">{t('ld_s2_bak_v', lang)}</div>
                <p className="ld-stat-l">{t('ld_s2_bak_l', lang)}</p>
              </div>
              <div className="ld-stat ld-rise" style={delay(160)}>
                <div className="ld-stat-v">{t('ld_s2_ran_v', lang)}</div>
                <p className="ld-stat-l">{t('ld_s2_ran_l', lang)}</p>
              </div>
            </div>
            <span className="ld-src">{t('ld_s2_src_pdns', lang)}</span>

            <div className="ld-ncsi ld-rise">
              <div className="ld-ncsi-t">{t('ld_s2_ncsi_title', lang)}</div>
              <span className="ld-ncsi-n">{t('ld_s2_ncsi_from', lang)}</span>
              <span className="ld-ncsi-arrow">
                <Glyph k="tri" size={9} color="var(--crit)" />
                {t('ld_s2_ncsi_fall', lang)}
              </span>
              <span className="ld-ncsi-n ld-down">{t('ld_s2_ncsi_to', lang)}</span>
            </div>
            <span className="ld-src">{t('ld_s2_src_ncsi', lang)}</span>
          </div>
        </section>

        {/* ----------------------------------------------------------- 3. SPEED GAP */}
        <section className="ld-sec">
          <div className="ld-wrap">
            <p className="ld-kicker ld-rise">
              <Glyph k="arc" size={9} />
              {t('ld_s3_kicker', lang)}
            </p>
            <h2 className="ld-h2 ld-rise" style={delay(60)}>
              {t('ld_s3_title', lang)}
            </h2>
            <p className="ld-body ld-rise" style={delay(100)}>
              {t('ld_s3_body', lang)}
            </p>

            <div className="ld-gap">
              <div className="ld-gap-head">
                <Glyph k="ring" size={9} color="var(--t3)" />
                {t('ld_s3_axis', lang)}
              </div>
              {GAP_ROWS.map((row, i) => {
                const attacker = row.side === 'att';
                return (
                  <div className="ld-row ld-rise" key={row.name} style={delay(i * 110)}>
                    <span className={`ld-side ${attacker ? 'ld-side-att' : 'ld-side-def'}`}>
                      <Glyph k={attacker ? 'tri' : 'check'} size={8} />
                      {t(attacker ? 'ld_s3_side_att' : 'ld_s3_side_def', lang)}
                    </span>
                    <div>
                      <div className="ld-row-l">
                        <span className="ld-row-name">{tf(row.name, lang, { product: PRODUCT_NAME })}</span>
                        <span className="ld-row-v">{t(row.value, lang)}</span>
                      </div>
                      <div className="ld-track">
                        <span
                          className={`ld-fill ${attacker ? 'ld-fill-att' : 'ld-fill-def'}`}
                          style={{ width: `${axisPct(row.ms).toFixed(2)}%`, ...delay(i * 110 + 120) }}
                        />
                      </div>
                      <div className="ld-row-s">{t(row.source, lang)}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="ld-note">
              <Glyph k="diamond" size={9} color="var(--med)" />
              <span>{tf('ld_s3_caveat', lang, { product: PRODUCT_NAME })}</span>
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------- 4. CLOSED LOOP */}
        <section className="ld-sec">
          <div className="ld-wrap">
            <p className="ld-kicker ld-rise">
              <Glyph k="circle" size={8} />
              {t('ld_s4_kicker', lang)}
            </p>
            <h2 className="ld-h2 ld-rise" style={delay(60)}>
              {t('ld_s4_title', lang)}
            </h2>

            <div className="ld-loop">
              {LOOP_NODES.map((n, i) => (
                <div className="ld-node ld-rise" key={n.contract} style={delay(i * 80)}>
                  <span className="ld-node-rail" aria-hidden="true">
                    <i style={delay(i * 340)} />
                  </span>
                  <div className="ld-node-n">{String(i + 1).padStart(2, '0')}</div>
                  <div className="ld-node-t">{t(n.title, lang)}</div>
                  <span className="ld-node-c">{n.contract}</span>
                  <p className="ld-node-d">{t(n.desc, lang)}</p>
                </div>
              ))}
            </div>

            <div className="ld-gov">
              <div className="ld-govcard ld-rise">
                <div className="ld-govcard-t">
                  <Glyph k="diamond" size={11} color="var(--acc)" />
                  {t('ld_s4_g1_t', lang)}
                </div>
                <p className="ld-govcard-d">{t('ld_s4_g1_d', lang)}</p>
              </div>
              <div className="ld-govcard ld-rise" style={delay(90)}>
                <div className="ld-govcard-t">
                  <Glyph k="check" size={11} color="var(--acc)" />
                  {t('ld_s4_g2_t', lang)}
                </div>
                <p className="ld-govcard-d">{t('ld_s4_g2_d', lang)}</p>
                <code className="ld-code">{t('ld_s4_g2_code', lang)}</code>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ 5. EVIDENCE */}
        <section className="ld-sec">
          <div className="ld-wrap">
            <p className="ld-kicker ld-rise">
              <Glyph k="check" size={9} />
              {t('ld_s5_kicker', lang)}
            </p>
            <h2 className="ld-h2 ld-rise" style={delay(60)}>
              {t('ld_s5_title', lang)}
            </h2>

            <div className="ld-ev">
              {EVIDENCE.map((e, i) => (
                <div className="ld-evcard ld-rise" key={e.source} style={delay(i * 90)}>
                  <div className="ld-ev-v">
                    <Glyph k="check" size={14} color="var(--acc)" />
                    {t(e.value, lang)}
                  </div>
                  <p className="ld-ev-l">{t(e.label, lang)}</p>
                  <div className="ld-ev-s">{t(e.source, lang)}</div>
                </div>
              ))}
            </div>

            <p className="ld-note">
              <Glyph k="diamond" size={9} color="var(--med)" />
              <span>
                {t('ld_s5_caveat', lang)} <b>{t('ld_s5_caveat_src', lang)}</b>
              </span>
            </p>
          </div>
        </section>

        {/* ----------------------------------------------------- 6. SAFETY BOUNDARY */}
        <section className="ld-sec">
          <div className="ld-wrap">
            <p className="ld-kicker ld-rise">
              <Glyph k="x" size={9} />
              {t('ld_s6_kicker', lang)}
            </p>
            <h2 className="ld-h2 ld-rise" style={delay(60)}>
              {t('ld_s6_title', lang)}
            </h2>
            <p className="ld-body ld-rise" style={delay(100)}>
              {t('ld_s6_body', lang)}
            </p>

            <div className="ld-props">
              {SAFE_PROPS.map((p, i) => (
                <div className="ld-prop ld-rise" key={p.title} style={delay(i * 60)}>
                  <Glyph k="check" size={13} color="var(--ok)" />
                  <div>
                    <div className="ld-prop-t">{t(p.title, lang)}</div>
                    <div className="ld-prop-d">{t(p.desc, lang)}</div>
                  </div>
                </div>
              ))}
            </div>

            <p className="ld-note">
              <Glyph k="ring" size={9} color="var(--t3)" />
              <span>{t('ld_s6_runbook', lang)}</span>
            </p>
          </div>
        </section>
      </main>

      {/* --------------------------------------------------------------- 7. FOOTER */}
      <footer className="ld-foot">
        <div className="ld-wrap">
          <div className="ld-foot-grid">
            <div>
              <div className="ld-foot-team">{t('ld_foot_team', lang)}</div>
              <div className="ld-foot-org">{t('ld_foot_org', lang)}</div>
            </div>
            <div className="ld-foot-links">
              <a href={REPO_URL} rel="noreferrer noopener" target="_blank">
                {t('ld_foot_repo', lang)}
              </a>
              <span>{t('ld_foot_license', lang)}</span>
              <span>{t('ld_foot_event', lang)}</span>
            </div>
          </div>
          <p className="ld-foot-fine">{t('ld_foot_synthetic', lang)}</p>
        </div>
      </footer>
    </div>
  );
}
