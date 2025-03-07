import { FIREBASE_ADMIN_KEY } from '$env/static/private';
import admin from 'firebase-admin';

let firebaseAdmin: admin.app.App | undefined | null;
let firebaseAdminAuth: admin.auth.Auth | undefined;

/**
 * Create Firebase Admin singleton
 */
function getFirebaseAdmin(): admin.app.App | undefined | null {
	if (!firebaseAdmin) {
		if (admin.apps.length === 0) {
			firebaseAdmin = admin.initializeApp({
				credential: admin.credential.cert(JSON.parse(FIREBASE_ADMIN_KEY))
			});
		} else {
			firebaseAdmin = admin.apps[0];
		}
	}

	return firebaseAdmin;
}

/**
 * Create Firebase Admin Auth singleton
 */
function getFirebaseAdminAuth(): admin.auth.Auth {
	const currentAdmin = getFirebaseAdmin();
	if (!firebaseAdminAuth) {
		firebaseAdminAuth = currentAdmin!.auth();
	}
	return firebaseAdminAuth;
}

export { getFirebaseAdmin, getFirebaseAdminAuth };
