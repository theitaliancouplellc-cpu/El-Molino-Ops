# El Molino Ops — Restaurant Brand System

This design system is derived from the Johns Island restaurant interior reference photos supplied for the mobile-app redesign. The goal is to translate the restaurant's visual identity into a clean operational UI without copying wall murals literally onto every screen.

## Visual character

- Bright, playful Mexican taqueria identity.
- Dominant turquoise/Caribbean blue surfaces and trim.
- Warm mango/orange and bright red used as energetic accents.
- Palm/cactus green for positive/approved states and secondary brand accents.
- Cream/off-white as the primary reading surface.
- Pink can be used sparingly for playful highlights and selected category accents.
- Dark navy/charcoal provides text contrast and anchors the bright palette.
- Hand-painted/distressed signage is a branding accent only; operational copy remains highly legible.

## Core palette

| Token | Hex | Intended use |
| --- | --- | --- |
| molino-blue | #079DB6 | Primary brand/nav/button color |
| molino-blue-deep | #08758A | Pressed/active states, dark accents |
| molino-cream | #FFF8E8 | Primary app background |
| molino-surface | #FFFFFF | Cards/forms/data surfaces |
| molino-orange | #F39A1F | Secondary CTA, warnings, highlights |
| molino-red | #D83B35 | Urgent/destructive accents |
| molino-green | #2E8B57 | Success/approved/available states |
| molino-pink | #E84B7A | Limited playful/category accent |
| molino-yellow | #F6C541 | Decorative highlight and badges |
| molino-ink | #172A32 | Primary text/nav dark |
| molino-muted | #65747A | Secondary text |
| molino-line | #D9E2DF | Borders/dividers |

## UI rules

1. Operational readability wins over decoration. Cream/white surfaces carry schedules, forms, time clock, tips and manager data.
2. Turquoise is the unmistakable primary brand color.
3. Orange, red, green, pink and yellow are semantic accents, not simultaneous background noise.
4. Decorative striping, mural-like blocks or distressed texture should be restricted to onboarding, splash, section headers, store graphics and empty-state illustrations.
5. Touch targets stay at least 44px where applicable.
6. Maintain WCAG contrast for all functional text and controls.
7. English and Spanish use the same layout, hierarchy, colors and functions. Locale changes copy only.
8. User-written content is preserved exactly as authored; system UI is localized.

## Bilingual product rule

The application has two first-class interface locales: English (`en`) and Spanish (`es`). Locale choice persists on the device and can be changed from a visible language control. No operational record, identifier, date, schedule, employee assignment or financial value is mutated when language changes.
