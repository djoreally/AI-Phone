# Deployment

AI Phone production deployments use the repository's Git integration.

## Production rule

1. Create changes on a branch.
2. Open a pull request.
3. Merge the approved pull request into `main`.
4. Let Vercel create the production deployment from the Git push.

Do not trigger production deployments through connector/integration deployment actions. Preview deployments remain disabled unless intentionally changed at the project level.
