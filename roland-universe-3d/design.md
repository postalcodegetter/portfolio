# Design tokens — Roland Oosthuizen portfolio (universe edition)

Concept: a scroll-flight through a small universe. Each section is a planet you arrive at.
A "Quick read" toggle swaps to a plain, linear layout for anyone in a hurry.

## Type
Instrument Serif (display) · Hanken Grotesk (body, 16px+) · JetBrains Mono (labels). No Inter/Roboto/Arial.

## Colour
- UI: onyx ink scale, bone text, ONE accent (lime) for actions, active state, key numerals.
- Planets (illustration only): sun amber, ice teal, rust, moss, haze. Defined once in :root.
- Nebula tint shifts per sector via @property --tint.

## Spacing 4px base: 4 / 8 / 16 / 24 / 48 / 96 / 144. Radius 2px. Hard 1px borders, hard offset hover shadow.

## Motion (all scroll-driven or one-shot; nothing loops forever)
- Starfield: canvas, forward flight with streaks proportional to scroll velocity; mouse parallax. Loop only runs while moving.
- Planets: approach/leave scale + drift via --pt/--pa set per section on scroll.
- Reveals, count-ups, line-mask hero, SVG bar/line draw, beacon ping (2 pulses).
- prefers-reduced-motion: static stars, no parallax, everything visible.

## Accessibility / UX rules applied (ui-ux-pro-max)
44px touch targets, 16px+ body, 4.5:1 contrast, visible focus, skip link, aria-pressed/expanded states,
Esc closes map, z-index scale 0/10/20/30/40/50, no layout-shifting hover, form loading + error recovery,
tested at 375/768/1024/1440 without horizontal scroll.

## Personal layer
About story, photo tile (assets/roland.jpg), Currently list, fun-fact beamer, planets that say hello on click.

## v3: 3D solar system
- One fixed WebGL canvas (three.js, bundled to assets/universe3d.js; source in src/scene.js).
- Planets are procedural (canvas noise textures), lit by the Orka "sun". Colours are read from the CSS tokens.
- Between stops: `.flight` spacers (230vh) drive a sideways camera fly with FOV punch, tilt and star streaks.
- At a stop: the camera is parked, nothing moves; the page scrolls normally over a static scene.
- Rendering is on demand (idle = no frames). No WebGL, or Quick read on = plain page.
