# Deploying the MHG Inn Code tool

A standalone internal tool: its own Firebase project, its own database, its own
sign-in. It shares nothing with OpsCore and never calls it.

Everything below runs in Terminal on your Mac, from this folder:

```bash
cd ~/Desktop/mcx_ecosystem/mhg_ecosystem/mhg-icgenerator
```

---

## 0. Node version

The deployed runtime is Node 22, and `.nvmrc` pins it:

```bash
nvm install 22   # once
nvm use
node -v          # expect v22.x
```

**Never let a Linux environment run `npm install` in this folder.** `esbuild`
and `vitest` install platform-specific binaries; a Linux install leaves your Mac
with binaries it cannot execute (`cannot execute binary file`, exit 126). The
recovery is in troubleshooting at the bottom.

---

## 1. Create the Firebase project

In the [Firebase console](https://console.firebase.google.com):

1. **Add project** — name it something like `mhg-inncodes`. Note the project ID
   it generates; that's what you'll use below, not the display name.
2. **Upgrade to Blaze.** Cloud Functions v2 requires it. This workload is a
   handful of reads and four writes per code issued — comfortably inside the
   free allowance, but the plan has to be Blaze.
3. **Build → Firestore Database → Create database.** Production mode, and pick
   `us-central` (or `nam5`) so it sits with the functions.
4. **Build → Authentication → Get started → Google.** Enable it, set the support
   email, save.
5. **Project settings → General → Your apps → Web (`</>`).** Register an app —
   call it "Inn Codes". Copy the `firebaseConfig` object it shows you.

Paste those values into `public/firebase-config.js`. They aren't secrets: a
Firebase web config identifies a project and grants nothing. Access is decided
by sign-in plus the `mhgAdmin` claim, and this project's Firestore is closed to
clients entirely.

---

## 2. Sign in and point the folder at the project

```bash
npm install -g firebase-tools    # skip if `firebase --version` works
firebase login
firebase use --add <your-project-id>
```

It asks for an alias; type `default`. That writes `.firebaserc`, replacing the
placeholder.

---

## 3. Deploy

```bash
npm run deploy
```

That's `firebase deploy --only functions,firestore,hosting` — the six callables,
the Firestore rules, and the web app. Two to four minutes the first time.

The rules close the database to every client:

```
match /{document=**} { allow read, write: if false; }
```

That's intentional, not a placeholder. Nothing reads Firestore directly; the
callables run on the Admin SDK, which bypasses rules, and check the `mhgAdmin`
claim themselves. The uniqueness guarantee is a transactional create on a
document id (G8), and a client able to write `innCodes` could break it.

When it finishes, the CLI prints your hosting URL — `https://<project-id>.web.app`.
**That URL is the product.**

---

## 4. Give yourself access

Open the URL and sign in with Google. You'll get "No access" — expected, the
claim doesn't exist yet. That first sign-in creates your user account, which the
next step needs.

1. Firebase console → **Project settings → Service accounts → Generate new
   private key**. Save it as `serviceAccount.json` in this folder. It's
   gitignored; never commit it.
2. Grant the claim:

```bash
node functions/scripts/set-admin.mjs imazanka@mazcoenterprises.com
```

3. Sign out and back in. Claims only appear in a freshly issued token.

Repeat step 2 for anyone else at MHG corporate who should issue codes.

---

## 5. Issue the first code

In the web app: type the property, pick the flag, watch the derivation appear as
you type. Preview is read-only and reserves nothing — only **Issue code**
claims it, and a claimed code is permanent (G3).

**MHG-branded hotels only.** A property MHG manages under someone else's flag
does not get a code here. The two flags are `BC` (BYX Collection) and `LX`
(BYX Luxury).

```
Name          BYX Collection Evansville East
City          Evansville          State  IN
Flag          BC — BYX Collection
Submarket     East
Prior code    EVVIN               (only if it converted from a flag)
```

That produces `EVVBC` with the trace `M2 · B1 · G3`.

The PROP code is the inn code — nothing to enter. Every property here is
MHG-branded, so the brand and the management company are the same entity.

There's also a CLI for bulk seeding, which bypasses the browser and the claim
check because it runs as the service account:

```bash
node functions/scripts/issue.mjs --city Evansville --state IN --flag BC --dry
```

---

## If something goes wrong

**A callable returns `INTERNAL`, and the logs show
`auth/insufficient-permission` or a Firestore permission error** — the
functions' runtime service account
(`<project-number>-compute@developer.gserviceaccount.com`) is missing the roles
they need. New projects no longer grant it broad permissions by default.
Setting a custom claim needs the Identity Toolkit; issuing a code needs
Firestore:

```bash
gcloud projects add-iam-policy-binding mhg-icgenerator \
  --member=serviceAccount:1025576393021-compute@developer.gserviceaccount.com \
  --role=roles/firebaseauth.admin

gcloud projects add-iam-policy-binding mhg-icgenerator \
  --member=serviceAccount:1025576393021-compute@developer.gserviceaccount.com \
  --role=roles/datastore.user
```

Both members sit inside this project, so domain-restricted sharing permits
them. No redeploy — IAM applies on the next invocation.

To read the logs behind an `INTERNAL`:

```bash
firebase functions:log --only <functionName> --project mhg-icgenerator
```

Look past the audit entries for a line beginning `Unhandled error`. A
`"verifications":{"auth":"VALID"}` line above it means the request reached your
code and the problem is inside the function, not in Cloud Run's permissions.

**`Failed to set the IAM Policy on the Service` / `Failed to set invoker` /
`One or more users named in the policy do not belong to a permitted customer`**
— the MCX org enforces domain-restricted sharing
(`constraints/iam.allowedPolicyMemberDomains`), which forbids granting
`allUsers` anything. Firebase needs that grant to make a callable reachable, so
the deploy leaves the function deployed but uninvokable. A green deploy does
not prove a callable is reachable: check with

```bash
gcloud run services get-iam-policy <service-name-lowercased> \
  --region=us-central1 --project=mhg-icgenerator
```

An empty policy (just `etag:`) means no invoker.

The fix is per service, and needs no org policy change as long as
`constraints/run.managed.requireInvokerIam` stays unenforced — it is not
enforced by default, and enforcing it is what would close this door:

```bash
for s in bootstrapinncodeadmin checkinncode grantinncodeadmin issueinncode \
         listinncodes previewinncode rebrandinncode retireinncode revokeinncodeadmin; do
  gcloud run services update "$s" --region=us-central1 \
    --no-invoker-iam-check --project=mhg-icgenerator --quiet
done
```

Cloud Run then stops consulting IAM about who may invoke, and the function's
own `requireCorporate` check is the gate — which it always was, since the
Firebase callable protocol hands the ID token to the function, not to IAM.

**This is per service, so any function added in a future deploy needs it too.**
Add the new service name to that loop and rerun it after deploying.

**`Could not build the function due to a missing permission on the build
service account`** — hit this on the very first deploy to `mhg-icgenerator`,
and any new project will hit it too. Cloud Functions v2 builds run through
Cloud Build, and for projects created after mid-2024 the default build service
account no longer arrives with the permissions it needs. Nothing to do with
your code: the bundle builds locally, Firestore and hosting deploy fine, and
only the six functions fail.

Grant the build role to the project's default Compute Engine service account
(`PROJECT_NUMBER-compute@developer.gserviceaccount.com` — the project number
appears in the build log URLs the error prints):

Console → **IAM & Admin → IAM** → tick **Include Google-provided role grants**
at the top right, or the account stays hidden → find
`<project-number>-compute@developer.gserviceaccount.com` → pencil → **Add
another role** → **Cloud Build Service Account** → Save.

Or with gcloud:

```bash
gcloud projects add-iam-policy-binding <project-id> \
  --member=serviceAccount:<project-number>-compute@developer.gserviceaccount.com \
  --role=roles/cloudbuild.builds.builder
```

Wait a minute for IAM to propagate, then `firebase deploy --only functions`.
The first deploy also enables `cloudbuild`, `run`, `eventarc` and
`artifactregistry` mid-run, which is its own source of first-attempt
flakiness — a plain retry sometimes clears it.


**`cannot execute binary file` / exit code 126** — `node_modules` was installed
by a different operating system. Wipe both and reinstall here:

```bash
rm -rf node_modules functions/node_modules package-lock.json functions/package-lock.json
npm install
npm --prefix functions install
```

**The page loads but sign-in does nothing** — Google sign-in isn't enabled
(step 1.4), or the hosting domain isn't in Authentication → Settings →
Authorized domains. `<project-id>.web.app` is authorized automatically; a custom
domain is not.

**"No access" after granting the claim** — sign out and back in. A token issued
before the claim existed doesn't carry it.

**Every call returns `internal`** — usually Firestore wasn't created (step 1.3).
Check Functions → Logs in the console.

**`Error: Failed to load function definition`** — the bundle didn't build. Run
`npm run functions:prepare` alone and read the output; the type-check runs
before the bundle, so a TypeScript error in the library surfaces here.

**Changed the rules or the brand table** — `npm run deploy` again. The brand
list the web app shows is generated from the config at build time, so it can't
drift from what the engine enforces.
