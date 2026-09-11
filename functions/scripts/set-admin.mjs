/**
 * Fallback way to grant inn code access, for when the app itself can't.
 *
 * You normally do NOT need this: the first admin self-enables in the web app
 * ("Enable my access"), and admins grant each other from the Access panel.
 * This exists for the case where nobody has access yet and the bootstrap list
 * in functions/src/index.ts doesn't have the right address in it.
 *
 * It uses Application Default Credentials rather than a downloaded key,
 * because org policy can forbid creating service account keys:
 *
 *   gcloud auth application-default login
 *   gcloud auth application-default set-quota-project mhg-icgenerator
 *   node functions/scripts/set-admin.mjs someone@mazcoenterprises.com
 *
 * Your Google account needs the Firebase Authentication Admin role on the
 * project. The user must sign in once before you can grant them anything, and
 * must reload afterwards — a cached token doesn't carry a new claim.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const email = process.argv[2];
const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? 'mhg-icgenerator';

if (!email) {
  console.error('Usage: node functions/scripts/set-admin.mjs <email>');
  process.exit(1);
}

try {
  initializeApp({ credential: applicationDefault(), projectId });
} catch (err) {
  console.error('Could not load Application Default Credentials.');
  console.error('Run: gcloud auth application-default login');
  console.error(err.message);
  process.exit(1);
}

try {
  const auth = getAuth();
  const user = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), mhgAdmin: true });
  console.log(`mhgAdmin granted to ${email} (${user.uid}).`);
  console.log('They need to reload the app for the new claim to take effect.');
} catch (err) {
  if (err.code === 'auth/user-not-found') {
    console.error(`${email} has not signed in yet. Have them open the app and sign in once.`);
  } else {
    console.error(err.message);
  }
  process.exit(1);
}
