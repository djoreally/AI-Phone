# Expanded source snapshots

This directory expands the two source archives that were previously committed at the repository root.

- `platform-v1/` comes from `android-ai-robot-platform.zip` and contains the original `(app)` acceptance, publisher, gateway, planner, signing, and receipt architecture.
- `platform-v2/` comes from `android-ai-robot-platform (2).zip` and contains the later dashboard/runtime/capabilities/provisioning architecture.

The snapshots are intentionally kept separate because they are divergent application trees and cannot be overlaid safely: both define overlapping Next.js routes and shared modules.

The root ZIP files are retained temporarily as provenance until the expanded trees are reviewed and a canonical source tree is selected.
