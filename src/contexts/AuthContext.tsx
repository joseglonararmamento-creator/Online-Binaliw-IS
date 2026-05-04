import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup,
  GoogleAuthProvider, 
  signOut,
  setPersistence,
  browserLocalPersistence,
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp,
  getDocFromServer,
  onSnapshot,
  query,
  where,
  collection,
  getDocs
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile, UserRole } from '../types';
import localforage from 'localforage';

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  isOnline: boolean;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
  completeOnboarding: (displayName: string, role: UserRole, classInviteCode?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    // Ensure persistence is local
    setPersistence(auth, browserLocalPersistence).catch(console.error);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && (error.message.includes('the client is offline') || error.message.includes('unavailable'))) {
          console.warn("Firestore is operating in offline mode.");
        }
      }
    };
    testConnection();

    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (firebaseUser) {
        // Update presence
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        
        unsubscribeProfile = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = { ...docSnap.data(), uid: docSnap.id } as UserProfile;
            setProfile(data);
            
            // Set online status only if profile already exists to satisfy strict rules
            if (isOnline) {
              setDoc(userDocRef, { 
                isOnline: true, 
                lastActive: serverTimestamp() 
              }, { merge: true }).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${firebaseUser.uid} online`));
            }

            // If profile exists but role is missing, we need onboarding
            if (!data.role) {
              setLoading(false);
            }
          } else {
            // Profile doesn't exist at all
            setProfile(null);
          }
          setLoading(false);
        }, (err) => {
          handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
          setLoading(false);
        });

        // Background Sync for Quiz Attempts
        if (isOnline) {
          const pendingAttemptsStore = localforage.createInstance({
            name: "BISonline",
            storeName: "pending_quiz_attempts"
          });

          const sync = async () => {
            const keys = await pendingAttemptsStore.keys();
            if (keys.length > 0) {
              console.log(`Syncing ${keys.length} offline assessment attempts...`);
              for (const key of keys) {
                const attempt = await pendingAttemptsStore.getItem<any>(key);
                if (attempt) {
                  try {
                    const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
                    await addDoc(collection(db, 'quizAttempts'), {
                      ...attempt,
                      completedAt: serverTimestamp(),
                      syncedAt: serverTimestamp()
                    });
                    await pendingAttemptsStore.removeItem(key);
                  } catch (err) {
                    handleFirestoreError(err, OperationType.WRITE, 'sync quiz attempts');
                  }
                }
              }
            }
          };
          sync();
        }
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, [isOnline]);

  const signIn = async () => {
    try {
      await setPersistence(auth, browserLocalPersistence);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Sign in error:", err);
      // Don't alert for cancellation
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-by-user') {
        alert('Google Login Error: ' + err.code + ' - ' + err.message);
      }
    }
  };

  const completeOnboarding = async (displayName: string, role: UserRole, classInviteCode?: string) => {
    if (!user) return;
    
    let classIds: string[] = [];

    if (role === 'student' && classInviteCode) {
      try {
        const q = query(
          collection(db, 'classes'),
          where('inviteCode', '==', classInviteCode.toUpperCase())
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          classIds = [snap.docs[0].id];
        } else {
          alert("Invalid invite code. You can join classes later from your profile.");
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'check invite code');
      }
    }

    const newProfile: UserProfile = {
      uid: user.uid,
      email: user.email || '',
      displayName,
      photoURL: user.photoURL,
      role,
      classIds,
      createdAt: serverTimestamp(),
    };
    try {
      await setDoc(doc(db, 'users', user.uid), newProfile);
      setProfile(newProfile);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid} profile creation`);
    }
  };

  const logout = async () => {
    try {
      if (user) {
        await setDoc(doc(db, 'users', user.uid), { isOnline: false }, { merge: true });
      }
      await signOut(auth);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user?.uid} offline logout`);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, isOnline, signIn, logout, completeOnboarding }}>
      {children}
    </AuthContext.Provider>
  );
};
