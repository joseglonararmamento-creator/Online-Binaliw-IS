import { 
  initializeApp 
} from 'firebase/app';
import { 
  getAuth 
} from 'firebase/auth';
import { 
  initializeFirestore, 
  doc, 
  getDocFromServer, 
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Optimized for mobile stability and offline resilience
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
}, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth();

// Validate Connection to Firestore
async function testConnection() {
  try {
    // Attempt to fetch a dummy doc to verify connection
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && (error.message.includes('the client is offline') || error.message.includes('unavailable'))) {
      console.warn("Firestore is operating in offline mode. Changes will sync once connection is restored.");
    }
  }
}
testConnection();

let storageInstance: FirebaseStorage | null = null;
try {
  storageInstance = getStorage(app);
} catch (error) {
  console.warn("Firebase Storage is not available or not provisioned:", error);
}

export const storage = storageInstance;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // In development, we keep the original stack trace
  if (error instanceof Error && (error as any).code === 'permission-denied') {
    throw new Error(JSON.stringify(errInfo));
  }
  throw error;
}
