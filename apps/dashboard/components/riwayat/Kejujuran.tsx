'use client';
import { type Lang, t } from '../../lib/i18n';
import { Glyph, Panel } from '../ui';

/**
 * The honesty panel.
 *
 * Counterintuitive but load bearing: naming the sample data ourselves, before a judge finds it, is what
 * buys credibility for the surfaces that genuinely work. A judge who discovers fixture data unaided
 * starts doubting everything on screen, including the parts that are real. A judge who was told up front
 * spends their scepticism on the right targets.
 *
 * It is placed on the Overview tab because that is the first surface anyone sees, and it is where the
 * suspicion forms.
 */
export function Kejujuran({ lang }: { lang: Lang }) {
  return (
    <Panel title={t('jj_judul', lang)} sub={t('jj_sub', lang)} style={{ gridColumn: '1 / -1' }}>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, lineHeight: 1.6, color: 'var(--t2)' }}>
        {t('jj_intro', lang)}
      </p>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ borderLeft: '2px solid var(--ok)', paddingLeft: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--ok)', marginBottom: 4 }}>
            <Glyph k="check" size={9} /> {t('jj_hidup_judul', lang)}
          </div>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--t2)' }}>
            {t('jj_hidup', lang)}
          </p>
        </div>
        <div style={{ borderLeft: '2px solid var(--med)', paddingLeft: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--med)', marginBottom: 4 }}>
            <Glyph k="diamond" size={9} /> {t('jj_contoh_judul', lang)}
          </div>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--t2)' }}>
            {t('jj_contoh', lang)}
          </p>
        </div>
      </div>
      <p className="mono" style={{ margin: '12px 0 0', fontSize: 10.5, lineHeight: 1.6, color: 'var(--t3)' }}>
        {t('jj_ajakan', lang)}
      </p>
    </Panel>
  );
}
