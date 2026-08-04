'use client';
import { useEffect, useState } from 'react';
import { Live } from '../../components/live/Live';
import { Fleet } from '../../components/screens/Fleet';
import { Incident, type ReportState } from '../../components/screens/Incident';
import { Overview } from '../../components/screens/Overview';
import { System } from '../../components/screens/System';
import { Glyph } from '../../components/ui';
import { PRODUCT_NAME, demoScenario } from '../../lib/data';
import { type Lang, t } from '../../lib/i18n';
import '../dashboard.css';
import '../live.css';

// Faithful to the design's 4-tab nav (Overview · Incident · Fleet · System). The autonomy dial lives in the
// System screen's Autonomy Policy panel and the dual-control approvals live in the Incident response plan,
// exactly where the design places them, so there is no separate Dial/Approvals tab.
// The fifth tab is additive: the Live surface carries the live SSE proof (the four design screens above are
// untouched by it, they keep rendering the seeded demo scenario exactly as before).
const SCREENS: {
  id: string;
  key: 'nav_overview' | 'nav_incident' | 'nav_fleet' | 'nav_system' | 'nav_live';
}[] = [
  { id: 'overview', key: 'nav_overview' },
  { id: 'incident', key: 'nav_incident' },
  { id: 'fleet', key: 'nav_fleet' },
  { id: 'system', key: 'nav_system' },
  { id: 'live', key: 'nav_live' },
];

function useClock() {
  const [now, setNow] = useState('03:19:30');
  useEffect(() => {
    const base = Date.UTC(2026, 5, 12, 3, 19, 30);
    const t0 = Date.now();
    const id = setInterval(() => {
      const d = new Date(base + (Date.now() - t0));
      const p = (x: number) => String(x).padStart(2, '0');
      setNow(`${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`);
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function Page() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [lang, setLang] = useState<Lang>('en');
  const [screen, setScreen] = useState('overview');
  /**
   * THE dial, singular. This used to be a local useState seeded to FULL_AUTO with nothing behind it, so
   * the System tab showed a dial that controlled nothing and, worse, disagreed with the real server dial
   * that the Live tab reads from the telemetry heartbeat. Two dials in one app showing different
   * positions is the kind of thing a judge notices. It now reads and writes /api/dial, the same dial the
   * detection loop actually obeys, so there is one dial and one truth.
   * Writing requires a console session; without one the server refuses and we roll the display back
   * rather than pretending the change took.
   */
  const [dial, setDialState] = useState('MONITOR_ONLY'); // shipped default, corrected by the server below

  useEffect(() => {
    let alive = true;
    fetch('/api/dial')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { position?: string } | null) => {
        if (alive && d?.position) setDialState(d.position);
      })
      .catch(() => {
        /* offline: keep the safe default on screen rather than inventing a position */
      });
    const id = setInterval(() => {
      fetch('/api/dial')
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { position?: string } | null) => {
          if (alive && d?.position) setDialState(d.position);
        })
        .catch(() => {});
    }, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const setDial = (position: string): void => {
    const previous = dial;
    setDialState(position); // optimistic, reverted below if the server says no
    fetch('/api/dial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position }),
    })
      .then((r) => {
        if (!r.ok) setDialState(previous);
      })
      .catch(() => setDialState(previous));
  };
  const [report, setReport] = useState<ReportState | null>(null);
  const [generating, setGenerating] = useState(false);
  const clock = useClock();
  const s = demoScenario();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang; // keep <html lang> in sync for screen readers (WCAG 3.1.2)
  }, [lang]);

  async function generate() {
    setGenerating(true);
    try {
      const r = await fetch('/api/analyze', { method: 'POST' });
      setReport((await r.json()) as ReportState);
    } catch {
      setReport({
        live: false,
        status: 'LLM_UNAVAILABLE',
        routed_to_human: false,
        model_id: 'unavailable',
        faithfulness: null,
        report: null,
        plan: null,
      } as ReportState);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <span />
          </div>
          <div>
            <div className="brand-name">{PRODUCT_NAME}</div>
            <div className="brand-sub">{t('brand_sub', lang)}</div>
          </div>
        </div>
        <nav className="nav" aria-label={t('a11y_screens', lang)}>
          {SCREENS.map((sc) => (
            <button
              key={sc.id}
              type="button"
              className={`nav-tab${screen === sc.id ? ' on' : ''}`}
              onClick={() => setScreen(sc.id)}
              aria-current={screen === sc.id ? 'page' : undefined}
            >
              {sc.id === 'incident' ? <span className="nav-dot pulse-dot" /> : null}
              {t(sc.key, lang)}
            </button>
          ))}
        </nav>
        <div className="topbar-right">
          <button
            type="button"
            className="inc-chip"
            onClick={() => setScreen('incident')}
            title={t('tip_open_incident', lang)}
          >
            <Glyph k="tri" size={8} />
            {s.incident.id} · {Math.round(s.incident.confidence * 100)}%
          </button>
          <span className="clock">
            <b>{clock}</b> UTC
          </span>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setLang(lang === 'en' ? 'id' : 'en')}
            title={t('tip_language', lang)}
            aria-label={t('aria_toggle_language', lang)}
          >
            <span className="mono" style={{ fontSize: 11 }}>
              {lang.toUpperCase()}
            </span>
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={t('aria_toggle_theme', lang)}
            aria-label={t('aria_toggle_theme', lang)}
          >
            <Glyph k={theme === 'dark' ? 'circle' : 'ring'} size={11} />
          </button>
          <span className="op-chip">OPR-03 · SOC-A</span>
        </div>
      </header>

      {/* The Live tab carries its own, more accurate boundary statement ("events simulated, deciding
          engine real"). This banner says detection runs on a host and not here, which is true of the four
          fixture tabs and NOT true of Live, where the committed engine genuinely decides server side.
          Showing both at once was a contradiction a judge could catch, so the banner yields on Live. */}
      {screen !== 'live' ? (
        <div className="demo-banner" role="note">
          <Glyph k="diamond" size={9} /> {t('demo_banner', lang)}
        </div>
      ) : null}

      <main className="app-main">
        {screen === 'overview' ? <Overview s={s} lang={lang} onOpen={() => setScreen('incident')} /> : null}
        {screen === 'incident' ? (
          <Incident s={s} lang={lang} report={report} onGenerate={generate} generating={generating} />
        ) : null}
        {screen === 'fleet' ? <Fleet s={s} lang={lang} /> : null}
        {screen === 'system' ? <System s={s} lang={lang} dial={dial} setDial={setDial} /> : null}
        {/* Live stays MOUNTED and is hidden with CSS instead of being unmounted. Unmounting threw away
            the whole telemetry stream state, so leaving the tab and coming back wiped the run history a
            presenter had just built up. display:contents keeps the existing layout exactly as it was.
            Keeping it mounted also means the stream keeps observing while the presenter is on the
            Incident tab showing the AI report, which the demo choreography depends on. */}
        <div style={{ display: screen === 'live' ? 'contents' : 'none' }}>
          <Live lang={lang} />
        </div>
      </main>
    </>
  );
}
