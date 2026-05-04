import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage, auth, handleFirestoreError, OperationType } from '../firebase';
import imageCompression from 'browser-image-compression';

export interface UploadResult {
  url: string;
  name: string;
  size: number;
}

/**
 * Compresses images before upload for slow networks
 */
async function compressImageIfPossible(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  
  const options = {
    maxSizeMB: 0.5, // Target 500KB as requested
    maxWidthOrHeight: 1920,
    useWebWorker: true
  };
  
  try {
    console.log(`Original size: ${file.size / 1024 / 1024} MB`);
    const compressedFile = await imageCompression(file, options);
    console.log(`Compressed size: ${compressedFile.size / 1024 / 1024} MB`);
    return compressedFile;
  } catch (error) {
    console.warn("Compression failed, using original file:", error);
    return file;
  }
}

/**
 * Robust Upload Method with Progress and Compression
 */
export async function uploadWithProgress(
  file: File,
  path: string,
  onProgress?: (progress: number, status?: 'uploading' | 'weak-signal' | 'paused') => void
): Promise<string> {
  if (!storage) {
    throw new Error("Firebase Storage is not available.");
  }

  const result = await uploadFileDetailed(file, path, onProgress);
  return result.url;
}

/**
 * Detailed upload function returning metadata
 */
export async function uploadFileDetailed(
  file: File,
  path: string,
  onProgress?: (progress: number, status?: 'uploading' | 'weak-signal' | 'paused') => void
): Promise<UploadResult> {
  if (!storage) {
    throw new Error("Firebase Storage is not available.");
  }

  // Pre-upload compression
  const fileToUpload = await compressImageIfPossible(file);

  // Ensure user is authenticated if needed (usually required by rules)
  if (!auth.currentUser) {
    const err = new Error('Unauthorized upload attempt');
    handleFirestoreError(err, OperationType.WRITE, `storage/${path}`);
    throw err;
  }

  // Set timeout for storage (resiliency for slow data)
  // 120 seconds as requested
  storage.maxUploadRetryTime = 120000; 

  return new Promise((resolve, reject) => {
    try {
      const timestamp = Date.now();
      const safeName = fileToUpload.name.replace(/[^a-zA-Z0-9.]/g, '_');
      const storageRef = ref(storage, `${path}/${timestamp}_${safeName}`);
      
      const uploadTask = uploadBytesResumable(storageRef, fileToUpload);

      let lastBytes = 0;
      let lastUpdate = Date.now();
      let weakSignalDetected = false;

      // Handle network state changes
      const handleConnectionBack = () => {
        console.log('Network back online, attempting to resume upload...');
        uploadTask.resume();
      };
      window.addEventListener('online', handleConnectionBack);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          const currentBytes = snapshot.bytesTransferred;
          const now = Date.now();

          // Weak signal detection: if progress hasn't moved in 10 seconds
          if (currentBytes > lastBytes) {
            lastBytes = currentBytes;
            lastUpdate = now;
            weakSignalDetected = false;
            if (onProgress) onProgress(Math.round(progress), 'uploading');
          } else if (now - lastUpdate > 10000) {
            weakSignalDetected = true;
            if (onProgress) onProgress(Math.round(progress), 'weak-signal');
            
            // Explicitly try a nudge: pause and resume if stuck too long
            if (now - lastUpdate > 20000 && snapshot.state === 'running') {
              console.warn("Upload appears stuck. Attempting pause/resume nudge...");
              uploadTask.pause();
              setTimeout(() => uploadTask.resume(), 1000);
            }
          } else {
             if (onProgress) onProgress(Math.round(progress), weakSignalDetected ? 'weak-signal' : 'uploading');
          }
          
          switch (snapshot.state) {
            case 'paused':
              if (onProgress) onProgress(Math.round(progress), 'paused');
              break;
            case 'running':
              // Handled by progress logic above
              break;
          }
        },
        (error) => {
          window.removeEventListener('online', handleConnectionBack);
          handleFirestoreError(error, OperationType.WRITE, `storage/${path}`);
          reject(error);
        },
        async () => {
          window.removeEventListener('online', handleConnectionBack);
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            resolve({
              url: downloadURL,
              name: file.name,
              size: fileToUpload.size
            });
          } catch (err) {
            handleFirestoreError(err, OperationType.GET, `storage/${path}/url`);
            reject(err);
          }
        }
      );
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `storage/${path}/init`);
      reject(err);
    }
  });
}
