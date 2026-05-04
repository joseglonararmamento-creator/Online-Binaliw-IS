import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, updateDoc, doc, deleteDoc, where, getDocs, limit, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Confession, Comment } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Heart, MessageSquare, Image as ImageIcon, Trash2, Shield, User, Ghost, Clock, SendHorizontal, X, Paperclip, Youtube, FileText, Download, MoreVertical, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { getSafeDate } from '../lib/dateUtils';
import { uploadFileDetailed as uploadFile } from '../services/storageService';
import { ConfessionSkeleton } from '../components/Skeleton';

export default function Confessions() {
  const { profile } = useAuth();
  const [confessions, setConfessions] = useState<Confession[]>([]);
  const [text, setText] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [showMobileConfess, setShowMobileConfess] = useState(false);

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'confessions'), orderBy('createdAt', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snap) => {
      setConfessions(snap.docs.map(d => ({ id: d.id, ...d.data() as object } as Confession)));
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'confessions list'));
    return () => unsubscribe();
  }, []);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !text.trim() || publishing) return;

    setPublishing(true);
    try {
      let mediaUrl = '';
      let mediaType: 'image' | 'file' | undefined;
      let fileName = '';
      let fileSize = 0;

      if (attachedFile) {
        setUploadProgress(0);
        const { uploadWithProgress } = await import('../services/storageService');
        mediaUrl = await uploadWithProgress(attachedFile, 'confessions', (progress) => {
          setUploadProgress(progress);
        });
        mediaType = attachedFile.type.startsWith('image/') ? 'image' : 'file';
        fileName = attachedFile.name;
        fileSize = attachedFile.size;
      }

      const payload: any = {
        authorId: profile.uid,
        authorName: isAnonymous ? 'Secret Shadow' : profile.displayName,
        authorPhoto: isAnonymous ? '' : profile.photoURL,
        text: text,
        isAnonymous: isAnonymous,
        likesCount: 0,
        createdAt: serverTimestamp()
      };

      if (mediaUrl) {
        payload.mediaUrl = mediaUrl;
        payload.mediaType = mediaType;
        if (mediaType === 'file') {
          payload.fileName = fileName;
          payload.fileSize = fileSize;
        }
      }

      // YouTube Integration
      const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?([^&?\s]+)/;
      const match = text.match(youtubeRegex);
      if (match && match[1]) {
        payload.youtubeId = match[1];
      }

      await addDoc(collection(db, 'confessions'), payload);

      setText('');
      setAttachedFile(null);
      setUploadProgress(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'add confession');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="max-w-[700px] mx-auto w-full space-y-8 pb-20 gpu-accel">
      {/* Mobile FAB */}
      <div className="fixed bottom-20 right-6 z-40 lg:hidden">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowMobileConfess(true)}
          className="w-14 h-14 bg-pink-600 text-white rounded-full shadow-2xl flex items-center justify-center neon-glow-pink"
        >
          <Ghost size={28} />
        </motion.button>
      </div>

      {/* Mobile Confess Overlay */}
      <AnimatePresence>
        {showMobileConfess && (
          <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            className="fixed inset-0 z-[60] confessions-theme p-6 lg:hidden"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-black text-white">Share a Secret</h3>
              <button onClick={() => setShowMobileConfess(false)} className="p-2 text-slate-400">
                <X size={24} />
              </button>
            </div>
            <textarea
              autoFocus
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="What's your secret?"
              className="w-full h-40 p-4 bg-white/5 border border-white/10 rounded-2xl outline-none focus:ring-4 focus:ring-pink-500/20 text-white text-lg resize-none"
            />
            <div className="mt-4 flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setIsAnonymous(!isAnonymous)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${isAnonymous ? 'bg-pink-500 text-white ring-4 ring-pink-500/20' : 'bg-white/5 text-slate-400'}`}
                >
                  <Ghost size={16} /> {isAnonymous ? 'Anonymous' : 'Public'}
                </button>
              </div>
               <button 
                  onClick={handlePublish as any}
                  disabled={publishing || !text.trim()}
                  className="w-full py-4 bg-pink-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-xl shadow-pink-900/20 disabled:opacity-50"
                >
                  {publishing ? 'Whispering...' : 'Confess Now'}
                </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="text-center space-y-2">
        <motion.div 
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-16 h-16 bg-pink-500/20 rounded-3xl flex items-center justify-center mx-auto mb-4 neon-glow-pink border border-pink-500/30"
        >
          <Shield className="text-pink-500" size={32} />
        </motion.div>
        <h1 className="text-4xl font-black text-white tracking-tighter">Campus Secrets</h1>
        <p className="text-slate-400 font-medium">Whisper your thoughts anonymously. No judgment, just secrets.</p>
      </div>

      <div className="hidden lg:block glass-dark p-8 rounded-[2rem] border-gradient-neo-dark shadow-2xl space-y-6">
        <div className="flex gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border-2 transition-all ${isAnonymous ? 'bg-pink-500/20 border-pink-500/30 text-pink-500 neon-glow-pink' : 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400'}`}>
            {isAnonymous ? <Ghost size={24} /> : <User size={24} />}
          </div>
          <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/30">
                Whisper something...
              </span>
              <div 
                onClick={() => setIsAnonymous(!isAnonymous)}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${isAnonymous ? 'text-pink-400' : 'text-slate-400'}`}>
                  Post Anonymously
                </span>
                <div className={`w-10 h-5 rounded-full relative transition-colors ${isAnonymous ? 'bg-pink-500' : 'bg-white/10'}`}>
                  <motion.div 
                    animate={{ x: isAnonymous ? 22 : 2 }}
                    className="absolute top-1 w-3 h-3 bg-white rounded-full shadow-sm"
                  />
                </div>
              </div>
            </div>

            <textarea 
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Type your secret here..."
              className="w-full min-h-[120px] bg-white/5 border border-white/5 rounded-3xl p-6 text-white placeholder:text-slate-600 focus:ring-4 focus:ring-pink-500/10 outline-none transition-all text-lg resize-none"
            />

            {attachedFile && (
              <div className="relative rounded-2xl overflow-hidden group border border-white/10">
                {attachedFile.type.startsWith('image/') ? (
                  <img src={URL.createObjectURL(attachedFile)} className="w-full h-48 object-cover opacity-70 group-hover:opacity-100 transition-opacity" alt="Preview" />
                ) : (
                  <div className="bg-white/5 p-6 flex flex-col items-center justify-center border-2 border-dashed border-white/10">
                    <FileText size={48} className="text-white/20 mb-2" />
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">{attachedFile.name}</p>
                  </div>
                )}
                <button 
                  onClick={() => setAttachedFile(null)}
                  className="absolute top-2 right-2 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {uploadProgress !== null && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-black text-pink-400 uppercase tracking-widest">
                  <span>Secret Encrypting...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.5)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-between items-center">
              <button 
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.onchange = (e: any) => setAttachedFile(e.target.files[0]);
                  input.click();
                }}
                className="flex items-center gap-2 text-white/40 hover:text-white transition-colors"
              >
                <Paperclip size={20} />
                <span className="text-[10px] font-black uppercase tracking-widest">Attach File</span>
              </button>
              <button 
                onClick={handlePublish as any}
                disabled={publishing || !text.trim()}
                className="px-8 py-3 bg-pink-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-pink-900/40 hover:bg-pink-700 transition-all disabled:opacity-50"
              >
                {publishing ? 'Confessing...' : 'Whisper Secret'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        <AnimatePresence mode="popLayout">
          {loading ? (
            <motion.div key="skeletons" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ConfessionSkeleton />
              <ConfessionSkeleton />
              <ConfessionSkeleton />
            </motion.div>
          ) : confessions.map((confession) => (
            <ConfessionCard key={confession.id} confession={confession} currentProfile={profile} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ConfessionCard({ confession, currentProfile }: { confession: Confession, currentProfile: any }) {
  const [likes, setLikes] = useState(confession.likesCount || 0);
  const [hasLiked, setHasLiked] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(confession.text);

  useEffect(() => {
    if (!currentProfile || !confession.id) return;
    const checkLike = async () => {
      try {
        const likeDoc = await getDocs(query(
          collection(db, 'confession_likes'), 
          where('confessionId', '==', confession.id),
          where('userId', '==', currentProfile.uid)
        ));
        setHasLiked(!likeDoc.empty);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `confession_likes/${confession.id}_${currentProfile.uid}`);
      }
    };
    checkLike();

    const q = query(
      collection(db, 'comments'), 
      where('parentId', '==', confession.id),
      where('parentType', '==', 'confession'),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(q, (snap) => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() as object } as Comment)));
    }, (err) => handleFirestoreError(err, OperationType.GET, `comments list for confession ${confession.id}`));
  }, [confession.id, currentProfile]);

  const handleLike = async () => {
    if (!currentProfile || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const likeRef = doc(db, 'confession_likes', `${confession.id}_${currentProfile.uid}`);
      const confessionRef = doc(db, 'confessions', confession.id);

      if (hasLiked) {
        await deleteDoc(likeRef);
        await updateDoc(confessionRef, { likesCount: Math.max(0, (confession.likesCount || 0) - 1) });
        setLikes(prev => Math.max(0, prev - 1));
        setHasLiked(false);
      } else {
        await setDoc(likeRef, { userId: currentProfile.uid, confessionId: confession.id, createdAt: serverTimestamp() });
        await updateDoc(confessionRef, { likesCount: (confession.likesCount || 0) + 1 });
        setLikes(prev => prev + 1);
        setHasLiked(true);

        // Notify confession author if it's not self
        if (confession.authorId !== currentProfile.uid) {
          await addDoc(collection(db, 'notifications'), {
            userId: confession.authorId,
            type: 'confession_liked',
            authorId: currentProfile.uid,
            authorName: currentProfile.displayName,
            authorPhoto: currentProfile.photoURL,
            text: `${currentProfile.displayName} hearted your confession!`,
            isRead: false,
            createdAt: serverTimestamp(),
            link: '/confessions'
          });
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `confession like/unlike ${confession.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProfile || !newComment.trim()) return;

    try {
      const payload: any = {
        parentId: confession.id,
        parentType: 'confession',
        authorId: currentProfile.uid,
        authorName: currentProfile.displayName,
        authorPhoto: currentProfile.photoURL,
        text: newComment,
        isAnonymous: false,
        createdAt: serverTimestamp()
      };

      // YouTube Integration
      const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?([^&?\s]+)/;
      const match = newComment.match(youtubeRegex);
      if (match && match[1]) {
        payload.youtubeId = match[1];
      }

      await addDoc(collection(db, 'comments'), payload);

      // Notify confession author if it's not self
      if (confession.authorId !== currentProfile.uid) {
        await addDoc(collection(db, 'notifications'), {
          userId: confession.authorId,
          type: 'confession_comment',
          authorId: currentProfile.uid,
          authorName: currentProfile.displayName,
          authorPhoto: currentProfile.photoURL,
          text: `${currentProfile.displayName} commented on your confession: "${newComment.substring(0, 30)}..."`,
          isRead: false,
          createdAt: serverTimestamp(),
          link: '/confessions'
        });
      }

      setNewComment('');
      setShowComments(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `add comment to confession ${confession.id}`);
    }
  };

  const handleUpdateConfession = async () => {
    if (!editText.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'confessions', confession.id), {
        text: editText,
        updatedAt: serverTimestamp()
      });
      setIsEditing(false);
      setShowOptions(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `confessions/${confession.id} update`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (window.confirm('Are you sure you want to delete this confession?')) {
      try {
        await deleteDoc(doc(db, 'confessions', confession.id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `confessions/${confession.id}`);
      }
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      layout
      whileHover={{ y: -4 }}
      className="glass-dark rounded-3xl border border-white/10 shadow-2xl overflow-hidden transition-all duration-500 border-gradient-neo-dark group gpu-accel"
    >
      <div className="p-6 space-y-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${confession.isAnonymous ? 'bg-indigo-500/20 text-pink-400 neon-glow-pink' : 'bg-indigo-500/20 text-indigo-400'}`}>
              {confession.isAnonymous ? <Ghost size={20} /> : <User size={20} />}
            </div>
            <div>
              <h4 className="text-sm font-black text-white">{confession.authorName}</h4>
              <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5">
                <Clock size={10} />
                {(() => {
                  const d = getSafeDate(confession.createdAt);
                  return d ? format(d, 'MMM d, yyyy • h:mm a') : 'Just now';
                })()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {confession.isAnonymous && (
              <div className="bg-pink-500/10 px-3 py-1 rounded-full text-[9px] font-black text-pink-400 uppercase tracking-widest animate-pulse border border-pink-500/20">
                Secret Confession
              </div>
            )}
            <div className="relative">
              {(currentProfile?.uid === confession.authorId || currentProfile?.role === 'teacher') && (
                <button 
                  onClick={() => setShowOptions(!showOptions)}
                  className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                >
                  <MoreVertical size={18} />
                </button>
              )}

              <AnimatePresence>
                {showOptions && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="fixed inset-0 z-10" onClick={() => setShowOptions(false)} />
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                      className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 z-20 py-2"
                    >
                      {currentProfile?.uid === confession.authorId && (
                        <button 
                          onClick={() => { setIsEditing(true); setShowOptions(false); }}
                          className="w-full px-4 py-2 text-left text-xs font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-3 transition-colors"
                        >
                          <Pencil size={14} />
                          Edit Confession
                        </button>
                      )}
                      <button 
                        onClick={handleConfirmDelete}
                        className="w-full px-4 py-2 text-left text-xs font-bold text-red-500 hover:bg-red-50 flex items-center gap-3 transition-colors"
                      >
                        <Trash2 size={14} />
                        Delete Confession
                      </button>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {isEditing ? (
          <div className="space-y-3">
            <textarea 
              value={editText}
              onChange={e => setEditText(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/10 outline-none min-h-[100px] resize-none"
            />
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => { setIsEditing(false); setEditText(confession.text); }}
                className="px-4 py-1.5 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 tracking-widest"
              >
                Cancel
              </button>
              <button 
                onClick={handleUpdateConfession}
                disabled={isSubmitting || !editText.trim()}
                className="px-4 py-1.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-100 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <p className="text-slate-100 font-medium leading-relaxed whitespace-pre-wrap">{confession.text}</p>
        )}

        {confession.youtubeId && (
          <div className="rounded-2xl overflow-hidden border border-slate-100 aspect-video">
            <iframe 
              className="w-full h-full"
              src={`https://www.youtube.com/embed/${confession.youtubeId}`}
              title="YouTube Video"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}

        {confession.mediaUrl && (confession as any).mediaType === 'image' && (
          <div className="rounded-2xl overflow-hidden border border-slate-100">
            <img src={confession.mediaUrl} className="w-full max-h-[400px] object-cover" alt="Attached Media" />
          </div>
        )}

        {confession.mediaUrl && (confession as any).mediaType === 'file' && (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-4 group">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shadow-inner">
              <FileText size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{(confession as any).fileName}</p>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {((confession as any).fileSize || 0) > 1024 * 1024 
                  ? `${(((confession as any).fileSize || 0) / (1024 * 1024)).toFixed(1)} MB` 
                  : `${(((confession as any).fileSize || 0) / 1024).toFixed(1)} KB`}
              </p>
            </div>
            <a 
              href={confession.mediaUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="p-3 bg-white border border-slate-200 text-indigo-600 rounded-xl hover:bg-slate-50 transition-all shadow-sm"
            >
              <Download size={20} />
            </a>
          </div>
        )}
        
        {/* Legacy imageUrl support */}
        {confession.imageUrl && !confession.mediaUrl && (
          <div className="rounded-2xl overflow-hidden border border-slate-100">
            <img src={confession.imageUrl} className="w-full max-h-[400px] object-cover" alt="Attached Media" />
          </div>
        )}

        <div className="flex items-center gap-6 pt-4 border-t border-white/5">
          <motion.button 
            whileTap={{ scale: 1.5 }}
            onClick={handleLike}
            className={`flex items-center gap-2 group transition-colors ${hasLiked ? 'text-pink-500' : 'text-slate-400 hover:text-pink-500'}`}
          >
            <motion.div 
              className={`p-2 rounded-xl transition-all ${hasLiked ? 'bg-pink-500/10' : 'group-hover:bg-pink-500/10'}`}
              animate={hasLiked ? { scale: [1, 1.4, 1] } : {}}
            >
              <Heart size={18} fill={hasLiked ? "currentColor" : "none"} />
            </motion.div>
            <span className="text-[11px] font-black uppercase tracking-tighter">{likes} Hearts</span>
          </motion.button>
          <button 
            onClick={() => setShowComments(!showComments)}
            className={`flex items-center gap-2 group transition-colors ${showComments ? 'text-indigo-400' : 'text-slate-400 hover:text-indigo-400'}`}
          >
            <div className={`p-2 rounded-xl transition-all ${showComments ? 'bg-indigo-500/10' : 'group-hover:bg-indigo-500/10'}`}>
              <MessageSquare size={18} />
            </div>
            <span className="text-[11px] font-black uppercase tracking-tighter">{comments.length} Comments</span>
          </button>
        </div>

        <AnimatePresence>
          {showComments && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden space-y-4"
            >
              <div className="pt-4 space-y-4 max-h-[300px] overflow-y-auto no-scrollbar">
                {comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3">
                    <img src={comment.authorPhoto || 'https://via.placeholder.com/32'} className="w-8 h-8 rounded-lg object-cover" alt="" />
                    <div className="flex-1 bg-white/5 rounded-2xl p-3 border border-white/5">
                      <div className="flex items-center justify-between mb-1">
                        <h5 className="text-[10px] font-black text-white">{comment.authorName}</h5>
                        <span className="text-[9px] text-slate-500 font-bold tracking-tight">
                          {(() => {
                            const d = getSafeDate(comment.createdAt);
                            return d ? format(d, 'h:mm a') : 'Now';
                          })()}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 font-medium">{comment.text}</p>
                      
                      {comment.youtubeId && (
                        <div className="mt-2 rounded-lg overflow-hidden border border-white/10 aspect-video">
                          <iframe 
                            className="w-full h-full"
                            src={`https://www.youtube.com/embed/${comment.youtubeId}`}
                            title="YouTube Video"
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={handleAddComment} className="flex gap-3 pt-2">
                <img src={currentProfile?.photoURL || 'https://via.placeholder.com/32'} className="w-8 h-8 rounded-lg object-cover" alt="" />
                <div className="flex-1 relative">
                  <input 
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    placeholder="Write a comment..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-4 text-xs pr-10 outline-none focus:ring-2 focus:ring-pink-500/20 transition-all font-medium text-white"
                  />
                  <button 
                    disabled={!newComment.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-pink-400 disabled:text-slate-600"
                  >
                    <Send size={14} />
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
