# Firestore rules to add to OpsCore

This repo deliberately ships **no `firestore.rules` file** and `firebase.json`
deploys **functions only**. Your OpsCore rules file is large and covers two
dozen collections; deploying a rules file from here would replace it wholesale
and drop the protection on every one of them.

Paste the block below into the OpsCore `firestore.rules`, inside the existing
`match /databases/{database}/documents { … }`, alongside the other collection
blocks. It defines no helpers and reuses none of yours, so it cannot collide
with `role()`, `tenantId()`, or anything else already in the file.

```
    // ─── Inn code registry (MHG-IC v1.0) ─────────────────────────────────
    // Server-only, on the same pattern as inspireIntegrations. Inn codes are
    // assigned by MHG corporate through the issueInnCode callable, which runs
    // on the Admin SDK and bypasses these rules. Nothing tenant-facing reads
    // or writes these collections — the corporate screen calls listInnCodes.
    //
    // The uniqueness guarantee is a transactional create on a document id, so
    // a client that could write innCodes could break it. Hence: never.

    match /innCodes/{code} {
      allow read, write: if false;
    }

    match /marketCodes/{marketCode} {
      allow read, write: if false;
    }

    match /submarketIndex/{key} {
      allow read, write: if false;
    }
```

## What is NOT changing

**`properties`** keeps the rules it already has. Issuance merges an `innCode`
field onto the existing property document through the Admin SDK, which bypasses
rules, so the tenant-facing rules on that collection stay exactly as they are.
Clients keep reading `properties` the way they always have — they just find an
`innCode` object on the documents that have been assigned one.

**PROP code.** For a franchised flag the property's `code` field is untouched;
it names the management company (HEI) and is on its own axis. For an
MHG-flagged property the two axes meet and issuance mirrors the inn code into
`code`, which means the PIF counter for that property becomes
`pifCounter_{tenantId}_{INNCODE}`. Properties already issuing PIFs under an
older PROP code keep their existing counter document — nothing renumbers.

## Deploying the rules

Once pasted, deploy from the OpsCore repo the way you normally do, not from
here:

```bash
cd <opscore repo>
firebase deploy --only firestore:rules
```
