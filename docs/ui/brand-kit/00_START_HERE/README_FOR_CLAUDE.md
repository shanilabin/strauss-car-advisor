# Strauss Drive — Claude Handoff Kit

This folder is the **main handoff package** for implementing the Strauss Drive UI.
It is organized so a developer (for example Claude) can quickly understand what is approved, what is supporting material, and what to build.

## Read first — recommended order
1. `00_START_HERE/README_FOR_CLAUDE.md`
2. `00_START_HERE/CLAUDE_IMPLEMENTATION_PROMPT.md`
3. `02_DESIGN_SYSTEM/DETAILED_DESIGN_SYSTEM.md`
4. `02_DESIGN_SYSTEM/SCREEN_GUIDE.md`
5. `03_MOCKUPS/approved/`
6. `01_BRAND/`
7. `04_ASSETS/`
8. `05_REFERENCE_DOCS/` and `06_PROTOTYPES/`

## Approval status at a glance
- **Approved primary references:**
  - `01_BRAND/logo_primary/strauss-drive-logo-selected-primary.png`
  - `01_BRAND/reference/approved-mascot-reference.png`
  - the 4 main branded desktop mockups in `03_MOCKUPS/approved/`
- **Supporting assets:** backgrounds, SVG decorations, mascot variations.
- **Legacy references:** older mockups before the Strauss-branded refresh.
- **Open product decision:** authenticated employee eligibility / car-group validation remains unresolved.

## Goal for Claude
Use this package to implement a clean, production-grade UI for **Strauss Drive** that:
- follows the approved brand direction **Color in Motion**
- uses the approved Strauss Drive logo and mascot
- matches the provided desktop mockups closely
- does **not** look generic or “AI default”
- keeps the already-approved UX structure and screen hierarchy

## Important cautions
- Decorative brand graphics must not interfere with charts, forms, or core numeric information.
- Treat mascot variations as optional supporting assets, not all as final approved production assets.
- Prefer the approved mockups over earlier legacy material whenever there is a conflict.
- The selected primary logo is included as a **reference asset**. If a cleaner vector/redraw version is needed in implementation, keep it visually consistent with the chosen reference.