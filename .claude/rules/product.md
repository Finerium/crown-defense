# RULE: Product naming, config, accessibility, i18n

- **PRODUCT_NAME is one constant.** Value "Crown Defense". Read it from one source (`@crown/contracts`
  `PRODUCT_NAME`). Never hardcode the display name in user-facing strings (OQ-5 — rename must be one line).
  `talos` is an internal codename only; never a user-facing string.
- **12-factor config.** All config env-driven; nothing hardcoded. The dial default (MONITOR_ONLY) and all
  detection thresholds are config, not literals. Keep `.env.example` complete and current.
- **Design reconciliation.** The blueprint owns functional/architectural truth; the design bundle
  (`crown-defense-design/`) owns visual/interaction truth. Use the design tokens (`talos.css`) as the styling
  source of truth; implement behavior from the blueprint; FLAG any designed field/state/endpoint the contracts
  do not define rather than inventing a contract or dropping a designed element.
- **Accessibility.** WCAG 2.x AA on key dashboard flows: contrast, keyboard nav, labels. Severity/status
  NEVER by color alone — always icon + label (+ thickness/length where applicable).
- **i18n.** No hardcoded user-facing strings; locale-ready (Indonesian + English), Indonesian-market product.
