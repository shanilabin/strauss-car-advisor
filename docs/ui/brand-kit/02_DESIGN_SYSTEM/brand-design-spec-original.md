# STRAUSS DRIVE — COLOR IN MOTION
## Final brand-extension proposal / UI visual language
**Status:** User-approved direction; ready for implementation as a proposed brand extension. **Official trademark use requires brand approval.**

### 1. Baseline and change scope
The earlier UX architecture and workflows remain fixed: adaptive layout, top navigation, employee chat, vehicle options, financial comparison, representative wait state, representative interface and form fallback. The new identity **replaces the earlier Cobalt & Lime visual palette**, not the product's logic or component hierarchy.

### 2. Creative direction
**Color in Motion:** energetic, joyful, asymmetrical, warm, precise and approachable. The visual metaphor is the Strauss pinwheel's *motion* rather than duplication of the official logo: petal arcs, half circles, sweeping wings, wind streaks and asymmetric overlaps. The approved smiling car with pinwheel is the principal mascot asset.

### 3. What makes it look authored, not generic AI
- Deliberate illustration system from a common family, not unrelated stock 3D images.
- Repeated geometric vocabulary (petals, open semicircles, wind lines) with controlled color mapping.
- Strong editorial typography: **Secular One** for high-impact headings; **Heebo** for UI and numerical data.
- No shiny glass cards, glow, neon, generic mesh gradients, robot icons or purposeless floating orbs.
- No shadows; default squared-off interactive components remain consistent with approved interface. The brand artwork may contain curves and organic forms.
- UI stays legible; decoration stays outside primary numeric fields, forms, tables and graphs.

### 4. Palette
Values below are sampled/selected visually from the supplied logo/mascot family; **not an authoritative corporate brand guide**.

| Role | Token | HEX |
|---|---|---|
| Primary action (light) | `--ui-primary` | `#007DB5` |
| Brand energy / CTA | `--brand-red` | `#EE3028` |
| Secondary accents | `--brand-orange`, `--brand-green`, `--brand-cyan` | `#FF9326`, `#78A82A`, `#00B6D9` |
| Supporting light wing | `--brand-sky` | `#9BDAEE` |
| Text | `--ui-text` | `#173248` (light) |
| Light surface | `--ui-surface` | `#FFFFFF` |
| Dark surface | `--ui-surface` | `#193642` |

Semantic gain/loss/eligibility/wait states must use dedicated theme-aware semantic tokens, not brand red/green alone. Each value has a readable label and sign, and must not depend only on color.

### 5. Composition system
- **Home hero:** asymmetric 45/55 composition with copy and CTA on the right, mascot on the left, oversize cropped petal arcs partly off canvas. Reflow vertically on mobile.
- **Employee conversation:** clean full-width reading rhythm during collection; decorative wind mark near header only; no large forms behind text.
- **Option gallery:** focal featured cards plus compact inventory below; background motifs appear only in large whitespace, never beneath numerical labels.
- **Comparison:** one dominant monthly-net delta, two secondary net values, a small waterfall preview and expandable explanation. Financial figures are from the engine, not mascot art or copy.
- **Representative view:** operational precision, same palette with far fewer decorative accents and a dense list-detail layout.
- **Waiting for representative:** warm peach waiting strip and restrained one-time motion on incoming results; no pulsing vehicles continuously.

### 6. Mascot usage
- Source: `assets/png/approved-car-mascot.png`, approved conversation concept; preserve recognizable body colors and windmill silhouette.
- Hero: large subject in reserved illustration area.
- Chat avatar: **not** the full detailed asset at 24px; use a separately approved simplified crop or monochrome mark before launch.
- Empty state / onboarding: can use original asset only when it adds meaning; not next to every card.
- Do not create unapproved facial expressions or falsely present a generated pinwheel as pixel-exact corporate artwork.
- The mascot image provided has an opaque white background; do not assume it is transparent. For colored backgrounds obtain an approved transparent cut-out.

### 7. Motion rules
Functional first: selection and layout transitions 180–280ms; number update 250–400ms; hero stagger one-time; ambient animation optional but avoid perpetual rotations. Preserve `prefers-reduced-motion`. No fake progress indicator while awaiting a human reply.

### 8. Fonts and UI
`Secular One` for campaign headline and hero, `Heebo` for all UI text. Numeric values use `font-variant-numeric: tabular-nums`. Keep RTL robust with `<bdi>` for vehicle names and mixed Hebrew/Latin content. UI radius 0; illustration curves are allowed.

### 9. Light & Dark
Use theme semantic tokens in `styles/tokens.css`. Preserve equivalent hierarchy and contrast. Red may be reserved for brand CTA while financial loss uses separate semantic red with explicit minus and label. For any shipping implementation verify WCAG AA contrast and touch target size.

### 10. Asset library mapping
| Asset | Use |
|---|---|
| `approved-car-mascot.png` | Home hero / limited onboarding |
| `abstract-burst-8.svg`, `abstract-burst-5.svg` | Original brand-inspired ornamental bursts, **not** Strauss's official pinwheel |
| `wing-*.svg` | Cropped brand shapes / section transitions |
| `half-circle-*.svg`, `semicircle-stack.svg` | Geometric backgrounds |
| `wind-streaks.svg`, `arc-trail.svg` | Motion-inspired connectors |
| `corner-petals-*.svg` | Decorative page corners / hero framing |
| `divider-petals.svg`, `comparison-arcs.svg` | Narrow section accents |
| `mini-motion-mark.svg` | Decorative secondary icon, not an official company mark |
| `car-silhouette.svg` | Generic vector car illustration |
| `styles/tokens.css`, `tokens.json` | CSS / design token source of truth |
| `ASSET_GALLERY.html` | Visual inventory and theme preview |

### 11. Accessibility and performance
Inline SVG for essential icons, CSS mask or `<img alt="">` for decorative art. Ensure no content hidden by big corner graphics. Prefer static SVG; use sparing CSS motion. Optimize raster to responsive WebP/AVIF as needed. Keep asset count small and cache immutable versioned files.

### 12. Implementation checklist
- [ ] Theme token switch implemented and verified in both modes.
- [ ] Approved mascot loaded only in hero/meaningful empty states.
- [ ] No official trademark substituted with an imitation vector.
- [ ] Decoration does not overlap interactive controls or numbers at 375px.
- [ ] Contrast, focus, touch targets and reduced motion tested.
- [ ] RTL mixed-direction vehicle names tested.
- [ ] Business entitlement/group authentication decision still pending; do not imply verified entitlement from manually selected occupation.
- [ ] Reuse approved UX structure and test core comparison journey end-to-end.

### 13. Governance / outstanding
**Open:** authenticated occupation and company car group determination. **External dependency:** approval of official Strauss logo use and access to official brand vectors. **Technical dependency:** if a transparent mascot is required, request or construct separately with visual QA before publication.
