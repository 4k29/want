## Code Review Rules

### Preserve the single source of truth
`data/wishlist.json` is the shared canonical state. Changes must not introduce another competing source of truth or restore the old multi-pending or merge-based synchronization behavior.

### Preserve concurrency protection
Saving must continue to use `revision`, `baseRevision`, and `requestId` so that stale clients cannot silently overwrite newer data. Conflicts must fail safely instead of losing data.

### Do not expose credentials or private data
The browser must not require or receive a GitHub access token for normal saving. Keep server-side writes limited to GitHub Actions credentials, and do not introduce storage of secrets or sensitive personal data into the public repository.
