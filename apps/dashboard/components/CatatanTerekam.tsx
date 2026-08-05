'use client';
import { type Lang, t } from '../lib/i18n';
import { Glyph, Panel } from './ui';

/**
 * THE MOST IMPORTANT LABEL IN THIS APP.
 *
 * Fleet and Incident render a finished, fictional incident: INC-2026-0612-004, four hosts carrying
 * "ISOLATED 03:14:09", a blast radius with a compromised patient zero. None of it reacts to anything.
 *
 * Without this notice those two screens contradict the product's central claim. A judge runs an attack
 * with the dial at MONITOR_ONLY, reads "NO COMMAND ISSUED" on the Live tab, clicks Fleet, and sees four
 * hosts marked isolated. The two conclusions available to them are that the dial does not work, or that
 * the dashboard is theatre, and both are reasonable inferences from what is on the screen.
 *
 * It is made worse by a decision taken for good reasons: every one of the seven host names used by the
 * console also appears in the fixture, so that one hospital feels like one hospital. That means the host
 * a judge just attacked is literally the host shown as isolated. So the notice says that out loud rather
 * than hoping nobody joins the two.
 *
 * This is the same failure the storage outage had: two different facts rendering identically. The fix is
 * the same too, which is to name which one you are looking at.
 */
export function CatatanTerekam({ lang }: { lang: Lang }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <Panel title={t('tr_judul', lang)} sub={t('tr_sub', lang)} style={{ gridColumn: '1 / -1' }}>
        <div style={{ borderLeft: '2px solid var(--med)', paddingLeft: 12 }}>
          <p style={{ margin: '0 0 8px', fontSize: 12.5, lineHeight: 1.6, color: 'var(--t2)' }}>
            <Glyph k="diamond" size={9} /> {t('tr_p1', lang)}
          </p>
          <p style={{ margin: '0 0 8px', fontSize: 12.5, lineHeight: 1.6, color: 'var(--t1)' }}>
            {t('tr_p2', lang)}
          </p>
          <p style={{ margin: '0 0 8px', fontSize: 12, lineHeight: 1.6, color: 'var(--t2)' }}>
            {t('tr_p3', lang)}
          </p>
          <p className="mono" style={{ margin: 0, fontSize: 10.5, lineHeight: 1.6, color: 'var(--t3)' }}>
            {t('tr_p4', lang)}
          </p>
        </div>
      </Panel>
    </div>
  );
}
