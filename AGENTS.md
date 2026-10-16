<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Git: work on main only

Commit straight to `main` and push it — Vercel deploys production from
`main`, and work left on other branches never goes live. Don't create
feature branches or worktrees unless the user asks for one. If a session
starts on another branch, say so before committing.

# Check module specs before building

Design specs and locked decisions live in `z_<module>/` folders (e.g.
`z_doorFace_module/DOOR_SYSTEM_SPEC.md`, `z_kick_join/KICK-JOIN-PLAN.md`).
Before starting a new feature or module, search `z_*/` for a spec that covers it
or touches it, read it, and follow its locked decisions. When a decision changes
or a phase is completed, update the spec's status and decisions in the same change.

## Cross-module rules

- **Display layers** — `z_display_layers/DISPLAY-LAYERS-SPEC.md`. Anything new
  that draws on the canvas (plan / elevation / 3D) — including the future
  decorative-items and appliance modules — must register its items in the layer
  registry and gate its rendering through the layer API. Don't add ad-hoc
  visibility booleans or new annotation flags.
