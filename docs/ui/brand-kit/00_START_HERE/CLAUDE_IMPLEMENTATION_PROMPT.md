# Claude implementation prompt

Copy-paste the prompt below into Claude:

---
You are helping implement the **Strauss Drive** product UI from a provided handoff kit.

Your job is to use the assets and mockups in the package to create or refine the front-end implementation so it matches the approved visual direction.

## First: read the package in this order
1. `00_START_HERE/README_FOR_CLAUDE.md`
2. `00_START_HERE/ASSET_STATUS.md`
3. `02_DESIGN_SYSTEM/DETAILED_DESIGN_SYSTEM.md`
4. `02_DESIGN_SYSTEM/SCREEN_GUIDE.md`
5. all files inside `03_MOCKUPS/approved/`
6. `01_BRAND/`
7. `04_ASSETS/`
8. `05_REFERENCE_DOCS/` and `06_PROTOTYPES/` only as supporting context

## Main goal
Implement a high-quality, believable, production-style UI for **Strauss Drive** that:
- matches the approved mockups closely
- uses the approved Strauss Drive logo and mascot
- feels like a branded Strauss product, not a generic AI product
- preserves the approved UX structure
- is clean, RTL-correct, and developer-friendly

## Files you should treat as primary visual truth
- `01_BRAND/logo_primary/strauss-drive-logo-selected-primary.png`
- `01_BRAND/reference/approved-mascot-reference.png`
- `03_MOCKUPS/approved/01-home-desktop-landing.png`
- `03_MOCKUPS/approved/02-employee-chat-data-collection.png`
- `03_MOCKUPS/approved/03-comparison-results-screen.png`
- `03_MOCKUPS/approved/04-representative-dashboard.png`

## Brand and visual direction
Follow the **Color in Motion** direction:
- colorful but controlled
- asymmetrical compositions
- large curved bands / petal-like forms inspired by the Strauss pinwheel
- white / light UI surfaces for the actual product areas
- Secular One for hero-level headlines
- Heebo for the UI
- no AI glow, no neon, no glassmorphism, no generic robot look

## Asset usage guidance
- Use the files in `04_ASSETS/backgrounds/` for wide hero/section backgrounds.
- Use the files in `04_ASSETS/svg_graphics/` as supporting decorative graphics.
- Use the mascot primarily in hero, guidance, waiting, and friendly UI moments.
- Do not overuse decorative art behind data-heavy areas.
- Treat the mascot variations as supporting material, not all as final canonical states.

## Implementation expectations
- keep the layout RTL and desktop-first
- keep components readable and realistic
- make the UI look authored and intentional
- preserve accessibility and color contrast
- keep motion restrained
- if you need to redraw assets into code/SVG/CSS, stay faithful to the approved references

## Important constraint
There is still an unresolved product decision around authenticated employee eligibility / car-group validation. Do not invent a final business rule for it in the UI beyond placeholder handling.

## Deliverables
Depending on the task I ask next, help me with one or more of:
- building the screens in code
- refining the design system
- translating the mockups into reusable components
- creating a consistent front-end implementation

Before coding, summarize how you understand the kit structure and which files you will use as your primary references.
---