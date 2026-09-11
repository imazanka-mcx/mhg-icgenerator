# Superseded files — safe to delete

Left here rather than deleted because the sandbox that wrote them cannot
delete files on your Mac. Nothing in the build references any of it.

- `firestore.rules`, `firestore.indexes.json` — an early draft that would have
  REPLACED the OpsCore rules file and dropped the rules protecting every other
  collection. This repo now deploys functions only; the block to merge into
  OpsCore's own rules file lives in ../RULES-SNIPPET.md.
- `mcx-inn-code-1.0.0.tgz`, `functions-package-lock.json` — from the earlier
  "pack the library into functions/" approach. npm served the functions folder
  a stale copy of the library from this tarball, so the functions now bundle
  the library at build time instead.

Delete this whole folder whenever you like.
