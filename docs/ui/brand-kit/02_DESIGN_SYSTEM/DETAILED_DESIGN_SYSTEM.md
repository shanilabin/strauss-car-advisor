# Detailed Design System — Strauss Drive

## 1. Product personality
Strauss Drive should feel **joyful, fresh, human, helpful and product-grade**.
It is **not** an “AI interface aesthetic”. It should look like a branded digital product from Strauss.

## 2. Creative direction: Color in Motion
The main inspiration is the *motion* of the Strauss pinwheel.
Use:
- asymmetry
- large curved background shapes
- flowing color bands
- half-circles and petal-like arcs
- clean white/light surfaces for UI content

Avoid:
- glow effects
- glassmorphism
- neon AI styling
- overly rounded bubble UI everywhere
- decorative clutter behind numbers

## 3. Core palette
These are working implementation values based on the approved direction.
- Brand red: `#EE3028`
- Brand orange: `#FF9326`
- Brand green: `#78A82A`
- Brand cyan: `#00B6D9`
- Brand blue: `#007DB5`
- Brand sky: `#9BDAEE`
- Deep navy text: `#173248`
- White surface: `#FFFFFF`
- Soft pale blue background: `#F3F8FD`
- Soft pale green: `#E8F6E9`
- Soft pale peach: `#FFF0E8`

Primary CTA can be red or blue depending on context; in the approved home screen, the primary CTA is red.
Use semantic colors for success, warning and error states — do not rely only on brand colors.

## 4. Typography
- Hero / major campaign headlines: **Secular One**
- All UI text and data: **Heebo**
- Numeric data should use tabular numerals where possible.
- Tone: large, confident, editorial headings + clean, compact UI text.

## 5. Shape language
- Main brand graphics: curved bands, petal arcs, sweeping ribbons.
- UI components themselves remain clean and restrained.
- Use generous whitespace.
- Desktop layouts may be asymmetric but should still feel structured.

## 6. Logo usage
Use `01_BRAND/logo_primary/strauss-drive-logo-selected-primary.png` as the **main product logo reference**.
If redrawing or vectorizing:
- keep the red “Strauss” script feel
- keep the blue “Drive” wordmark feel
- keep the pinwheel at the top-right of the lockup
- keep the overall energetic, optimistic balance

The corporate Strauss logo in `01_BRAND/reference/strauss-corporate-logo-reference.png` is for brand reference only.

## 7. Mascot usage
The approved mascot is friendly, colorful and should act as a companion.
Best places to use it:
- home hero
- chat-related moments
- waiting / guidance / empty states
- celebratory result moments

Avoid placing the mascot next to every small card or data cell.
Use it purposefully.

## 8. Background usage
Use the desktop background assets mainly for:
- hero / landing sections
- large empty state sections
- top banners or wide page frames
- light branded section separators

Do not place strong decorative backgrounds under dense forms or comparison tables.

## 9. Component style
- Cards: white or very light tinted surfaces, subtle outline if needed.
- Buttons: filled brand color for primary; outlined or pale tint for secondary.
- Inputs: light, clean, clearly readable.
- Chips / status pills: softly tinted backgrounds.
- Charts: simple, readable, data first.
- Navigation: top horizontal nav on desktop.

## 10. Motion
Motion should be restrained and believable.
- UI transitions: ~180–280ms
- number updates: 250–400ms
- mascot/chat ambient motions should be minimal
- respect reduced-motion preferences

## 11. Accessibility
- Maintain AA contrast.
- Do not communicate financial meaning by color alone.
- Ensure focus states, keyboard access and touch targets.
- Preserve RTL correctness.

## 12. Open decisions
- Eligibility / employee car-group validation flow remains unresolved.
- Final cleaned mascot animation pack is still pending.