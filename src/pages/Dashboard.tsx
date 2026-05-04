import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, limit, orderBy, onSnapshot, addDoc, serverTimestamp, setDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Lesson, Assignment, Submission, Reminder, UserProfile, Post, Friendship, Comment } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import localforage from 'localforage';
import { BookOpen, ClipboardList, CheckCircle2, Clock, ArrowRight, TrendingUp, AlertCircle, MessageSquare, CloudOff, Share2, Megaphone, LayoutDashboard, User, MessageCircle, ExternalLink, X, Plus, Send, Trash2, Heart, Paperclip, Youtube, Download, FileText, MoreVertical, Pencil, Loader2, Check } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { getSafeDate } from '../lib/dateUtils';
import ShareModal from '../components/ShareModal';
import StudyAssistant from '../components/StudyAssistant';
import { PostSkeleton } from '../components/Skeleton';
import { BrandLogo } from '../components/BrandLogo';

export default function Dashboard() {
  const { profile, isOnline, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [recentSubmissions, setRecentSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [interactions, setInteractions] = useState<{ [key: string]: { hearts: number, comments: any[] } }>({});
  const [newPostText, setNewPostText] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [postFile, setPostFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [postToDelete, setPostToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showMobilePost, setShowMobilePost] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'uploading' | 'weak-signal' | 'paused'>('uploading');

  useEffect(() => {
    if (!isOnline) return;
    const qCount = query(collection(db, 'users'), where('isOnline', '==', true), limit(100));
    const unsubCount = onSnapshot(qCount, (snap) => setOnlineCount(snap.size), (err) => handleFirestoreError(err, OperationType.GET, 'users online count dashboard'));
    return () => unsubCount();
  }, [isOnline]);

  const handleDeletePost = async () => {
    if (!postToDelete) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'posts', postToDelete));
      setPostToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `posts/${postToDelete}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleAddFriend = async (targetUserId: string) => {
    if (!profile) return;
    try {
      const friendshipId = profile.uid < targetUserId ? `${profile.uid}_${targetUserId}` : `${targetUserId}_${profile.uid}`;
      await setDoc(doc(db, 'friends', friendshipId), {
        user1: profile.uid,
        user2: targetUserId,
        status: 'pending',
        createdAt: serverTimestamp()
      }, { merge: true });

      // Create notification
      await addDoc(collection(db, 'notifications'), {
        userId: targetUserId,
        type: 'friend_request',
        authorId: profile.uid,
        authorName: profile.displayName,
        authorPhoto: profile.photoURL,
        text: `${profile.displayName} sent you a friend request`,
        isRead: false,
        createdAt: serverTimestamp(),
        link: `/profile?userId=${profile.uid}`
      });
      alert('Friend request sent!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'add friend request');
    }
  };

  const handlePostUpdate = async () => {
    if (!profile || (!newPostText.trim() && !postFile)) return;
    if (profile.role !== 'teacher') {
      alert("Only teachers can post status updates.");
      return;
    }
    setPublishing(true);
    try {
      let mediaUrl = '';
      let mediaType: 'image' | 'file' | undefined;
      let fileName = '';
      let fileSize = 0;

      if (postFile) {
        setUploadProgress(0);
        setUploadStatus('uploading');
        const { uploadWithProgress } = await import('../services/storageService');
        mediaUrl = await uploadWithProgress(postFile, 'posts', (progress, status) => {
          setUploadProgress(progress);
          if (status) setUploadStatus(status);
        });
        mediaType = postFile?.type?.startsWith('image/') ? 'image' : 'file';
        fileName = postFile?.name;
        fileSize = postFile?.size;
      }

      const payload: any = {
        authorId: profile?.uid,
        authorName: profile?.displayName,
        photoURL: profile?.photoURL,
        text: newPostText,
        createdAt: serverTimestamp(),
        likes: 0
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
      const match = newPostText?.match(youtubeRegex);
      if (match && match[1]) {
        payload.youtubeId = match[1];
      }

      const postRef = await addDoc(collection(db, 'posts'), payload);

      // Notify accepted friends
      const myFriends = friends?.filter(f => f.status === 'accepted') || [];
      for (const friendship of myFriends) {
        const friendId = friendship.user1 === profile?.uid ? friendship.user2 : friendship.user1;
        await addDoc(collection(db, 'notifications'), {
          userId: friendId,
          type: 'new_post',
          authorId: profile?.uid,
          authorName: profile?.displayName,
          authorPhoto: profile?.photoURL,
          postId: postRef?.id,
          text: `${profile?.displayName} posted a new update: "${newPostText?.substring(0, 30)}..."`,
          isRead: false,
          createdAt: serverTimestamp(),
          link: '/' // Redirect to dashboard
        });
      }

      setNewPostText('');
      setPostFile(null);
      setUploadProgress(null);
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
      if (showMobilePost) setShowMobilePost(false);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, 'post update dashboard');
    } finally {
      setPublishing(false);
    }
  };

  const handleStatHeart = (id: string) => {
    setInteractions(prev => ({
      ...prev,
      [id]: {
        hearts: (prev[id]?.hearts || 0) + 1,
        comments: prev[id]?.comments || []
      }
    }));
  };

  useEffect(() => {
    if (!profile?.uid || !isOnline) return;
    const q = query(
      collection(db, 'friends'),
      where('user1', '==', profile.uid)
    );
    const q2 = query(
      collection(db, 'friends'),
      where('user2', '==', profile.uid)
    );
    
    // Combine snapshots (simple version)
    const unsub1 = onSnapshot(q, (snap1) => {
      const f1 = snap1.docs.map(d => ({ id: d.id, ...d.data() as object } as Friendship));
      setFriends(prev => {
        const other = prev.filter(f => f.user2 === profile.uid);
        return [...f1, ...other];
      });
    }, (err) => handleFirestoreError(err, OperationType.GET, 'friends user1 dashboard'));
    const unsub2 = onSnapshot(q2, (snap2) => {
      const f2 = snap2.docs.map(d => ({ id: d.id, ...d.data() as object } as Friendship));
      setFriends(prev => {
        const other = prev.filter(f => f.user1 === profile.uid);
        return [...other, ...f2];
      });
    }, (err) => handleFirestoreError(err, OperationType.GET, 'friends user2 dashboard'));

    return () => { unsub1(); unsub2(); };
  }, [profile?.uid, isOnline]);

  useEffect(() => {
    if (!profile?.uid || !isOnline) return;

    const lessonsQuery = query(collection(db, 'lessons'), orderBy('createdAt', 'desc'), limit(10));
    const unsubLessons = onSnapshot(lessonsQuery, (snap) => {
      setLessons(snap.docs.map(d => ({ id: d.id, ...d.data() as object } as Lesson)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'lessons list dashboard'));

    const assignmentsQuery = query(collection(db, 'assignments'), orderBy('deadline', 'asc'), limit(5));
    const unsubAssignments = onSnapshot(assignmentsQuery, (snap) => {
      setAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() as object } as Assignment)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'assignments list dashboard'));

    const subsQuery = profile.role === 'teacher' 
      ? query(collection(db, 'submissions'), limit(5), orderBy('submittedAt', 'desc'))
      : query(collection(db, 'submissions'), where('studentId', '==', profile.uid), limit(5), orderBy('submittedAt', 'desc'));
    
    const unsubSubs = onSnapshot(subsQuery, (snap) => {
      setRecentSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() as object } as Submission)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'submissions list dashboard'));

    let remindersQuery;
    if (profile.role === 'student' && profile.classIds && profile.classIds.length > 0) {
      remindersQuery = query(collection(db, 'reminders'), where('classId', 'in', profile.classIds), orderBy('createdAt', 'desc'), limit(3));
    } else if (profile.role === 'teacher') {
      remindersQuery = query(collection(db, 'reminders'), where('teacherId', '==', profile.uid), orderBy('createdAt', 'desc'), limit(3));
    }

    let unsubReminders = () => {};
    if (remindersQuery) {
      unsubReminders = onSnapshot(remindersQuery, (snap) => {
        setReminders(snap.docs.map(d => ({ id: d.id, ...d.data() as object } as Reminder)));
      }, (err) => handleFirestoreError(err, OperationType.GET, 'reminders list dashboard'));
    }

    return () => {
      unsubLessons();
      unsubAssignments();
      unsubSubs();
      unsubReminders();
    };
  }, [profile?.uid, profile?.role, isOnline]);

  useEffect(() => {
    const fetchData = async () => {
      if (!profile?.role && !authLoading) {
        setLoading(false);
        return;
      }

      try {
        if (!isOnline) {
          const keys = await localforage.keys();
          const stored: Lesson[] = [];
          for (const key of keys.slice(0, 3)) {
            const lesson = await localforage.getItem<Lesson>(key);
            if (lesson) stored.push(lesson);
          }
          setLessons(stored);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'Dashboard local cache fetch');
      } finally {
        setLoading(false);
      }
    };

    if (profile && !authLoading) fetchData();
  }, [profile, isOnline, authLoading]);

  // Real-time posts listener for social feed (Friends + Self)
  useEffect(() => {
    if (!isOnline || !profile?.uid) return;
    
    // Get list of accepted friend IDs
    const acceptedFriendIds = friends
      .filter(f => f.status === 'accepted')
      .map(f => f.user1 === profile.uid ? f.user2 : f.user1);
    
    // Feed includes self + friends
    const feedIds = [profile.uid, ...acceptedFriendIds];
    
    // Firestore "in" query limited to 30 IDs. If more, we'd need a different strategy,
    // but for this applet architecture, we'll slice to the first 29 friends + self.
    const limitedFeedIds = feedIds.slice(0, 30);

    const q = query(
      collection(db, 'posts'), 
      where('authorId', 'in', limitedFeedIds),
      orderBy('createdAt', 'desc'), 
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() as object } as Post)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'posts feed dashboard'));
    
    return () => unsubscribe();
  }, [isOnline, profile?.uid, friends]);

  if (loading || authLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-pulse text-indigo-600 font-medium">Loading your dashboard...</div>
    </div>
  );

  if (!profile?.role) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-center p-6 bg-white rounded-3xl border border-slate-100 shadow-sm">
        <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6">
          <User size={40} className="text-indigo-600" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 mb-2">Select Your Role</h2>
        <p className="text-slate-500 mb-8 max-w-xs">Please complete your profile setup to access the dashboard features.</p>
        <button 
          onClick={() => navigate('/onboarding')}
          className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-100"
        >
          Complete Setup
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Success Toast */}
      <AnimatePresence>
        {showSuccessToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed top-20 right-6 z-[100] bg-emerald-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-500/50"
          >
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
              <Check size={20} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest">Update Posted</p>
              <p className="text-[10px] text-emerald-100 font-bold">Successfully shared with the campus!</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Floating Action Button */}
      {profile?.role === 'teacher' && (
        <div className="fixed bottom-20 right-6 z-40 lg:hidden">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowMobilePost(true)}
            className="w-14 h-14 bg-indigo-600 text-white rounded-full shadow-2xl flex items-center justify-center neon-glow-indigo"
          >
            <Plus size={28} />
          </motion.button>
        </div>
      )}

      {/* Mobile Post Overlay */}
      <AnimatePresence>
        {showMobilePost && (
          <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            className="fixed inset-0 z-[60] bg-[#0a0a0c] p-6 lg:hidden overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-xl font-black text-white tracking-tighter">New Update</h3>
                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Share with campus</p>
              </div>
              <button onClick={() => setShowMobilePost(false)} className="p-3 bg-white/5 text-white/40 rounded-2xl">
                <X size={24} />
              </button>
            </div>
            <textarea
              autoFocus
              value={newPostText}
              onChange={e => setNewPostText(e.target.value)}
              placeholder="What's on your mind?"
              className="w-full h-48 p-6 bg-white/5 border border-white/5 rounded-[2rem] outline-none focus:ring-4 focus:ring-indigo-500/10 text-white text-lg resize-none placeholder:text-white/10"
            />
            
            <div className="mt-6 space-y-4">
              {uploadProgress !== null && (
                <div className="space-y-1.5 px-2">
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                    <span className={uploadStatus === 'weak-signal' ? 'text-amber-500 animate-pulse' : 'text-indigo-400'}>
                      {uploadStatus === 'weak-signal' ? 'Weak Signal - Retrying...' : 'Uploading'}
                    </span>
                    <span className="text-white/60">{uploadProgress}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ 
                        width: `${uploadProgress}%`,
                        backgroundColor: uploadStatus === 'weak-signal' ? '#f59e0b' : '#4f46e5'
                      }}
                      className="h-full shadow-[0_0_10px_rgba(79,70,229,0.3)]"
                    />
                  </div>
                </div>
              )}

              {postFile && (
                <div className="flex items-center justify-between p-4 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
                  <div className="flex items-center gap-3">
                    <FileText size={20} className="text-indigo-400" />
                    <span className="text-sm font-bold text-indigo-100 truncate max-w-[200px]">{postFile.name}</span>
                  </div>
                  <button onClick={() => setPostFile(null)} className="text-indigo-400">
                    <X size={20} />
                  </button>
                </div>
              )}

              <div className="flex justify-between items-center bg-white/5 p-4 rounded-3xl border border-white/5">
                 <button 
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.onchange = (e: any) => setPostFile(e.target.files[0]);
                      input.click();
                    }}
                    className="flex items-center gap-2 text-white/40"
                  >
                    <Paperclip size={20} />
                    <span className="text-xs font-black uppercase tracking-widest">Attach File</span>
                  </button>
                 <button 
                    onClick={handlePostUpdate}
                    disabled={publishing || (!newPostText.trim() && !postFile)}
                    className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-900/40 disabled:opacity-50"
                  >
                    {publishing ? 'Posting...' : 'Share Now'}
                  </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col lg:flex-row gap-6 relative min-h-screen pb-20 gpu-accel">
        {/* Feed Column */}
        <div className="flex-1 max-w-[700px] mx-auto w-full space-y-6 gpu-accel">
          {/* Mobile Teacher Tools */}
          {profile?.role === 'teacher' && (
            <div className="lg:hidden bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl shadow-lg p-4 text-white flex items-center justify-between">
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-widest">Professor Panel</h3>
                <p className="text-xs font-bold text-indigo-100">Manage your virtual classrooms</p>
              </div>
              <button 
                onClick={() => navigate('/classes')}
                className="px-4 py-2 bg-white text-indigo-600 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95"
              >
                <Plus size={14} className="inline mr-1" /> Create Class
              </button>
            </div>
          )}

      {/* What's Latest Box - Desktop Only */}
      {profile?.role === 'teacher' && (
        <div className="hidden lg:block glass-light p-6 rounded-2xl shadow-xl border-gradient-neo flex flex-col gap-4">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-[0.15em] mb-1">Teacher's Announcement</h3>

          <div className="flex items-start gap-4">
            <img src={profile?.photoURL || 'https://via.placeholder.com/48'} className="w-12 h-12 rounded-full border-2 border-indigo-50 shadow-sm" alt="Me" />
            <div className="flex-1 space-y-3">
              <textarea 
                value={newPostText}
                onChange={e => setNewPostText(e.target.value)}
                placeholder="Post a status update or announcement for students..."
                className="w-full min-h-[80px] p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/10 text-slate-700 text-sm resize-none transition-all"
              />
              
              {postFile && (
                <div className="flex items-center justify-between p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                  <div className="flex items-center gap-3">
                    <FileText size={18} className="text-indigo-600" />
                    <span className="text-xs font-bold text-indigo-900 truncate max-w-[200px]">{postFile.name}</span>
                  </div>
                  <button onClick={() => setPostFile(null)} className="text-indigo-400 hover:text-indigo-600">
                    <X size={16} />
                  </button>
                </div>
              )}

              {uploadProgress !== null && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                    <span className={uploadStatus === 'weak-signal' ? 'text-amber-500 animate-pulse' : 'text-indigo-600'}>
                      {uploadStatus === 'weak-signal' ? 'Weak Signal - Retrying...' : 'Uploading Assets'}
                    </span>
                    <span className="text-indigo-600">{uploadProgress}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <motion.div 
                      key="progress-bar"
                      initial={{ width: 0 }}
                      animate={{ 
                        width: `${uploadProgress}%`,
                        backgroundColor: uploadStatus === 'weak-signal' ? '#f59e0b' : '#4f46e5'
                      }}
                      className="h-full shadow-[0_0_10px_rgba(79,70,229,0.5)]"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center">
                <button 
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.onchange = (e: any) => setPostFile(e.target.files[0]);
                    input.click();
                  }}
                  className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl transition-all shadow-sm border border-transparent hover:border-slate-100"
                >
                  <Paperclip size={20} />
                </button>
                <button 
                  onClick={handlePostUpdate}
                  disabled={publishing || (!newPostText.trim() && !postFile)}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-100 disabled:opacity-50 flex items-center gap-2 hover:bg-indigo-700 transition-all active:scale-95"
                >
                  {publishing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {publishing ? 'Publishing...' : 'Share Update'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

        {/* Combined Feed (Posts + Lessons) */}
        <div className="space-y-6">
          <AnimatePresence mode="popLayout">
            {loading ? (
              <motion.div key="skeletons" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <PostSkeleton />
                <PostSkeleton />
                <PostSkeleton />
              </motion.div>
            ) : ([...(posts || []), ...(lessons?.map(l => ({ ...l, isLesson: true })) || [])] as any[])
              .sort((a, b) => {
                const dateA = a?.createdAt?.toDate?.()?.getTime() || 0;
                const dateB = b?.createdAt?.toDate?.()?.getTime() || 0;
                return dateB - dateA;
              })
              .map((item: any) => (
                item?.isLesson ? (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={item?.id} 
                    className="bg-white rounded-xl shadow-md border border-slate-100 overflow-hidden"
                  >
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center overflow-hidden border border-slate-100 shadow-sm">
                        <BrandLogo size={40} className="object-contain" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 hover:underline cursor-pointer">BISonline Academic</h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight flex items-center gap-1">
                          {(() => {
                            const d = getSafeDate(item.createdAt);
                            return d ? `Lesson • ${format(d, 'MMM d')}` : 'Lesson • Recently';
                          })()}
                        </p>
                      </div>
                    </div>
                    <button className="text-slate-400 hover:bg-slate-50 p-2 rounded-full">
                      <ExternalLink size={16} />
                    </button>
                  </div>
                  <div className="px-4 pb-3">
                    <h5 className="font-bold text-slate-900 mb-2 text-lg leading-tight">{item?.title}</h5>
                    <p className="text-sm text-slate-600 line-clamp-4 leading-relaxed">{item?.content}</p>
                  </div>
                  <div className="aspect-[16/9] bg-slate-50 flex items-center justify-center border-y border-slate-50">
                    <BookOpen size={48} className="text-indigo-100" />
                  </div>
                  <div className="px-4 py-2 flex items-center justify-between border-t border-slate-50">
                    <div className="flex items-center -space-x-1">
                      <motion.div 
                        whileHover={{ scale: 1.2 }}
                        className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-[8px] text-white ring-2 ring-white cursor-pointer"
                      >❤️</motion.div>
                      <motion.div 
                        whileHover={{ scale: 1.2 }}
                        className="w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center text-[8px] text-white ring-2 ring-white cursor-pointer"
                      >👍</motion.div>
                       <motion.div 
                        whileHover={{ scale: 1.2 }}
                        className="w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center text-[8px] text-white ring-2 ring-white cursor-pointer"
                      >🙌</motion.div>
                      <span className="ml-2 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                        {interactions[item?.id]?.hearts || 0} Reactions
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                       {interactions[item?.id]?.comments?.length || 0} Comments
                    </span>
                  </div>
                  <div className="px-2 pb-2 flex items-center gap-2">
                    <motion.button 
                      whileTap={{ scale: 1.4 }}
                      onClick={() => handleStatHeart(item?.id)}
                      className="flex-1 py-2 hover:bg-slate-50 rounded-lg text-slate-600 font-bold text-xs flex items-center justify-center gap-2 transition-all active:text-red-500"
                    >
                      <TrendingUp size={16} />
                      Heart
                    </motion.button>
                    <button className="flex-1 py-2 hover:bg-slate-50 rounded-lg text-slate-600 font-bold text-xs flex items-center justify-center gap-2 transition-all">
                      <MessageCircle size={16} />
                      Comment
                    </button>
                  </div>
                </motion.div>
                ) : (
                  <PostCard 
                    key={item?.id} 
                    post={item} 
                    profile={profile} 
                    onDelete={() => setPostToDelete(item?.id)} 
                  />
                )
              ))}

          {reminders.map((rem) => (
            <div key={rem.id} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden p-4">
               <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                    <Megaphone size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Education Update</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{rem.type} • Now</p>
                  </div>
               </div>
               <p className="text-sm text-slate-700 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100/50 italic">"{rem.text}"</p>
            </div>
          ))}
          </AnimatePresence>
        </div>
      </div>

        {/* Sidebar (Right) */}
      <div className="hidden lg:block w-80 h-fit space-y-6 sticky top-4">
        {/* Create Class Button - High Priority for Teacher */}
        {profile?.role === 'teacher' && (
          <motion.div 
            whileHover={{ y: -4 }}
            className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 rounded-2xl shadow-xl shadow-indigo-200 p-6 text-white relative overflow-hidden"
          >
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
            <div className="absolute -left-6 -bottom-6 w-24 h-24 bg-purple-500/20 rounded-full blur-2xl"></div>
            
            <h3 className="text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-2">
              <Megaphone size={12} className="text-indigo-200" />
              Teacher Command Center
            </h3>
            <p className="text-sm font-bold text-indigo-50 mb-6 leading-tight">Ready to start a new learning space or invite students?</p>
            
            <button 
              onClick={() => navigate('/classes')}
              className="w-full py-4 bg-white text-indigo-700 rounded-xl font-black text-xs uppercase tracking-[0.15em] shadow-lg hover:bg-slate-50 transition-all flex items-center justify-center gap-3 group"
            >
              <Plus size={16} className="group-hover:rotate-90 transition-transform duration-300" />
              Create a Class
            </button>
          </motion.div>
        )}

        {/* Calendar Widget Alternative */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-4">
           <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Upcoming Lessons</h3>
              <Link to="/calendar" className="text-[9px] font-black text-indigo-600 uppercase hover:underline">View All</Link>
           </div>
           <div className="space-y-4">
             {lessons.slice(0, 2).map(l => (
               <div key={l.id} className="relative pl-4 border-l-2 border-indigo-100">
                  <p className="text-[10px] font-black text-indigo-600 uppercase mb-0.5">{(() => { const d = getSafeDate(l.createdAt); return d ? format(d, 'EEEE') : 'Soon'; })()}</p>
                  <p className="text-xs font-bold text-slate-800 line-clamp-1">{l.title}</p>
               </div>
             ))}
             {lessons.length === 0 && <p className="text-[10px] text-slate-400 italic">No scheduled lessons yet.</p>}
           </div>
        </div>

        {/* Global Stats */}
        <div className="grid grid-cols-2 gap-4">
           <div className="bg-slate-900 rounded-2xl p-4 text-white">
              <p className="text-[9px] font-black text-slate-500 uppercase mb-3">Live Feed</p>
              <div className="flex items-end gap-2">
                 <span className="text-2xl font-black">{posts.length + lessons.length}</span>
                 <TrendingUp size={14} className="text-emerald-400 mb-1" />
              </div>
           </div>
           <div className="bg-white rounded-2xl p-4 border border-slate-100">
              <p className="text-[9px] font-black text-slate-400 uppercase mb-3">Online</p>
              <span className="text-2xl font-black text-slate-900">{onlineCount}</span>
           </div>
        </div>
      </div>
    </div>

      {/* User Interaction Dialog */}
      <AnimatePresence>
        {selectedUser && (
          <div className="fixed inset-0 flex items-center justify-center z-[100] p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedUser(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-xs bg-white rounded-3xl shadow-2xl p-6 border border-slate-100 overflow-hidden"
            >
              <button 
                onClick={() => setSelectedUser(null)}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>

              <div className="flex flex-col items-center text-center mt-4">
                <div className="relative mb-4">
                  <img 
                    src={selectedUser.photoURL || 'https://via.placeholder.com/128'} 
                    className="w-24 h-24 rounded-full border-4 border-indigo-50 shadow-xl object-cover"
                    alt={selectedUser.displayName || ''}
                  />
                  <div className="absolute bottom-1 right-1 w-6 h-6 bg-emerald-500 border-4 border-white rounded-full"></div>
                </div>
                
                <h3 className="text-xl font-black text-slate-900 mb-1">{selectedUser.displayName}</h3>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">{selectedUser.role} • Online</p>

                <div className="w-full space-y-3">
                  {friends.find(f => f.user1 === selectedUser.uid || f.user2 === selectedUser.uid) ? (
                    <div className="w-full py-3 bg-emerald-50 text-emerald-600 rounded-xl font-black text-xs uppercase tracking-widest text-center border border-emerald-100 flex items-center justify-center gap-2">
                      <CheckCircle2 size={16} />
                      {friends.find(f => f.user1 === selectedUser.uid || f.user2 === selectedUser.uid)?.status === 'accepted' ? 'Friends' : 'Pending Request'}
                    </div>
                  ) : (
                    <button 
                      onClick={() => handleAddFriend(selectedUser.uid)}
                      className="w-full flex items-center justify-center gap-3 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                    >
                      <Plus size={16} />
                      Add Friend
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      // Navigate to profile
                      navigate(`/profile?userId=${selectedUser.uid}`);
                      setSelectedUser(null);
                    }}
                    className="w-full flex items-center justify-center gap-3 py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
                  >
                    <User size={16} />
                    View Profile
                  </button>
                  <button 
                     onClick={() => {
                      // Navigate to chat with user
                      navigate(`/chat?userId=${selectedUser.uid}`);
                      setSelectedUser(null);
                    }}
                    className="w-full flex items-center justify-center gap-3 py-3 border border-slate-200 text-slate-700 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm"
                  >
                    <MessageCircle size={16} />
                    Direct Message
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {postToDelete && (
          <div className="fixed inset-0 flex items-center justify-center z-[110] p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPostToDelete(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 border border-slate-100 overflow-hidden text-center"
            >
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle size={32} className="text-red-500" />
              </div>
              
              <h3 className="text-xl font-black text-slate-900 mb-2">Delete Update?</h3>
              <p className="text-slate-500 text-sm mb-8">This action cannot be undone. Are you sure you want to remove this status update?</p>

              <div className="flex gap-3">
                <button 
                  onClick={() => setPostToDelete(null)}
                  className="flex-1 py-3 bg-slate-50 text-slate-600 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeletePost}
                  disabled={deleting}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-100 disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ShareModal 
        isOpen={isShareModalOpen} 
        onClose={() => setIsShareModalOpen(false)} 
        url={window.location.origin} 
      />

      <StudyAssistant />
    </div>
  );
}


function StatCard({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: string, color: string }) {
  return (
    <div className="p-6 bg-white rounded-3xl border border-slate-100 shadow-sm">
      <div className={`w-12 h-12 ${color} rounded-2xl flex items-center justify-center mb-4 shadow-inner`}>
        {icon}
      </div>
      <p className="text-slate-500 text-sm font-medium mb-1">{label}</p>
      <h4 className="text-2xl font-black text-slate-900">{value}</h4>
    </div>
  );
}

function PostCard({ post, profile, onDelete }: { post: Post, profile: UserProfile | null, onDelete: () => void }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [showComments, setShowComments] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [likes, setLikes] = useState(post.likes || 0);
  const [hasLiked, setHasLiked] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(post.text);

  useEffect(() => {
    if (!profile || !post.id) return;
    const checkLike = async () => {
      try {
        const likeDoc = await getDocs(query(
          collection(db, 'post_likes'), 
          where('postId', '==', post.id),
          where('userId', '==', profile.uid)
        ));
        setHasLiked(!likeDoc.empty);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `post_likes/${post.id}_${profile.uid}`);
      }
    };
    checkLike();
  }, [post.id, profile?.uid]);

  useEffect(() => {
    if (!post.id) return;
    const q = query(
      collection(db, 'comments'), 
      where('parentId', '==', post.id),
      where('parentType', '==', 'post'),
      orderBy('createdAt', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() as object } as Comment)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, `comments/${post.id}`));
    return () => unsubscribe();
  }, [post.id]);

  const handleLike = async () => {
    if (!profile || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const likeRef = doc(db, 'post_likes', `${post.id}_${profile.uid}`);
      const postRef = doc(db, 'posts', post.id);

      if (hasLiked) {
        await deleteDoc(likeRef);
        await updateDoc(postRef, { likes: Math.max(0, (post.likes || 0) - 1) });
        setLikes(prev => Math.max(0, prev - 1));
        setHasLiked(false);
      } else {
        await setDoc(likeRef, { userId: profile.uid, postId: post.id, createdAt: serverTimestamp() });
        await updateDoc(postRef, { likes: (post.likes || 0) + 1 });
        setLikes(prev => prev + 1);
        setHasLiked(true);

        if (post.authorId !== profile.uid) {
          await addDoc(collection(db, 'notifications'), {
            userId: post.authorId,
            type: 'post_liked',
            authorId: profile.uid,
            authorName: profile.displayName,
            authorPhoto: profile.photoURL,
            postId: post.id,
            text: `${profile.displayName} hearted your post!`,
            isRead: false,
            createdAt: serverTimestamp(),
            link: '/'
          });
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `post like/unlike ${post.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const payload: any = {
        parentId: post.id,
        parentType: 'post',
        authorId: profile.uid,
        authorName: profile.displayName,
        authorPhoto: profile.photoURL,
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

      // Notify post author if it's not self
      if (post.authorId !== profile.uid) {
        await addDoc(collection(db, 'notifications'), {
          userId: post.authorId,
          type: 'post_comment',
          authorId: profile.uid,
          authorName: profile.displayName,
          authorPhoto: profile.photoURL,
          postId: post.id,
          text: `${profile.displayName} commented on your post: "${newComment.substring(0, 30)}..."`,
          isRead: false,
          createdAt: serverTimestamp(),
          link: '/'
        });
      }

      setNewComment('');
      setShowComments(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `add comment to post ${post.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdatePost = async () => {
    if (!editText.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'posts', post.id), {
        text: editText,
        updatedAt: serverTimestamp()
      });
      setIsEditing(false);
      setShowOptions(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `posts/${post.id} update`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (window.confirm('Are you sure you want to delete this status update?')) {
      try {
        await deleteDoc(doc(db, 'posts', post.id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `posts/${post.id}`);
      }
    }
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -4 }}
      className="glass-light rounded-2xl shadow-xl p-6 transition-all duration-500 border-gradient-neo group gpu-accel"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link to={`/profile?id=${post.authorId}`}>
            <img src={post.photoURL || 'https://via.placeholder.com/40'} className="w-10 h-10 rounded-full object-cover shadow-sm border-2 border-indigo-50" alt="" />
          </Link>
          <div>
            <Link to={`/profile?id=${post.authorId}`}>
              <h4 className="text-sm font-bold text-slate-900 hover:text-indigo-600 transition-colors">{post.authorName}</h4>
            </Link>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight flex items-center gap-1.5">
              <Clock size={10} />
              {(() => {
                const d = getSafeDate(post.createdAt);
                return d ? format(d, 'MMM d, yyyy • h:mm a') : 'Just now';
              })()}
            </p>
          </div>
        </div>
        <div className="relative">
          {(profile?.uid === post.authorId || profile?.role === 'teacher') && (
            <button 
              onClick={() => setShowOptions(!showOptions)}
              className="p-2 text-slate-400 hover:bg-slate-50 rounded-full transition-all"
            >
              <MoreVertical size={16} />
            </button>
          )}

          <AnimatePresence>
            {showOptions && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="fixed inset-0 z-10" onClick={() => setShowOptions(false)}></div>
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 z-20 py-2"
                >
                  {profile?.uid === post.authorId && (
                    <button 
                      onClick={() => { setIsEditing(true); setShowOptions(false); }}
                      className="w-full px-4 py-2 text-left text-xs font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-3 transition-colors"
                    >
                      <Pencil size={14} />
                      Edit Update
                    </button>
                  )}
                  <button 
                    onClick={handleConfirmDelete}
                    className="w-full px-4 py-2 text-left text-xs font-bold text-red-500 hover:bg-red-50 flex items-center gap-3 transition-colors"
                  >
                    <Trash2 size={14} />
                    Delete Update
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="mb-4">
        {isEditing ? (
          <div className="space-y-3">
            <textarea 
              value={editText}
              onChange={e => setEditText(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/10 outline-none min-h-[100px] resize-none"
            />
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => { setIsEditing(false); setEditText(post.text); }}
                className="px-4 py-1.5 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 tracking-widest"
              >
                Cancel
              </button>
              <button 
                onClick={handleUpdatePost}
                disabled={isSubmitting || !editText.trim()}
                className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-100 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">{post.text}</p>
        )}
      </div>
      
      {post.youtubeId && (
        <div className="mb-4 rounded-xl overflow-hidden shadow-sm border border-slate-100 aspect-video">
          <iframe 
            className="w-full h-full"
            src={`https://www.youtube.com/embed/${post.youtubeId}`}
            title="YouTube Video"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      {post.mediaUrl && post.mediaType === 'image' && (
        <div className="mb-4 rounded-xl overflow-hidden border border-slate-100">
          <img src={post.mediaUrl} className="w-full max-h-[400px] object-cover" alt="Attached Media" />
        </div>
      )}

      {post.mediaUrl && post.mediaType === 'file' && (
        <div className="mb-4 p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-4 group">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shadow-inner">
            <FileText size={24} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">{post.fileName}</p>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {(post.fileSize || 0) > 1024 * 1024 
                ? `${((post.fileSize || 0) / (1024 * 1024)).toFixed(1)} MB` 
                : `${((post.fileSize || 0) / 1024).toFixed(1)} KB`}
            </p>
          </div>
          <a 
            href={post.mediaUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="p-3 bg-white border border-slate-200 text-indigo-600 rounded-xl hover:bg-slate-50 transition-all shadow-sm"
          >
            <Download size={20} />
          </a>
        </div>
      )}

      <div className="flex items-center gap-4 pt-4 border-t border-slate-50">
          <motion.button 
            whileTap={{ scale: 1.5 }}
            onClick={handleLike}
            className={`flex items-center gap-2 transition-colors ${hasLiked ? 'text-red-500' : 'text-slate-500 hover:text-red-500'}`}
          >
            <motion.div
              animate={hasLiked ? { scale: [1, 1.4, 1] } : {}}
              transition={{ duration: 0.3 }}
            >
              <Heart size={16} fill={hasLiked ? "currentColor" : "none"} />
            </motion.div>
            <span className="text-[11px] font-black uppercase tracking-tighter">
              {likes > 0 ? `${likes} Hearts` : 'Heart'}
            </span>
          </motion.button>
          <button 
            onClick={() => setShowComments(!showComments)}
            className={`flex items-center gap-2 transition-colors ${showComments ? 'text-indigo-600' : 'text-slate-500 hover:text-indigo-600'}`}
          >
            <MessageSquare size={16} />
            <span className="text-[11px] font-black uppercase tracking-tighter">
              {comments.length > 0 ? `${comments.length} Comments` : 'Comment'}
            </span>
          </button>
      </div>

      <AnimatePresence>
        {showComments && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-6 space-y-4">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-3">
                  <img src={comment.authorPhoto || 'https://via.placeholder.com/32'} className="w-8 h-8 rounded-full border border-slate-100" alt="" />
                  <div className="flex-1 bg-slate-50 rounded-2xl p-3">
                    <div className="flex items-center justify-between mb-1">
                      <h5 className="text-[11px] font-bold text-slate-900">{comment.authorName}</h5>
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">
                        {(() => {
                          const d = getSafeDate(comment.createdAt);
                          return d ? format(d, 'h:mm a') : 'Now';
                        })()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{comment.text}</p>
                    
                    {comment.youtubeId && (
                      <div className="mt-2 rounded-lg overflow-hidden border border-slate-100 aspect-video">
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

              <form onSubmit={handleAddComment} className="flex gap-3 pt-2">
                <img src={profile?.photoURL || 'https://via.placeholder.com/32'} className="w-8 h-8 rounded-full border border-slate-100" alt="" />
                <div className="flex-1 relative">
                  <input 
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    placeholder="Write a comment..."
                    className="w-full bg-slate-50 border border-slate-100 rounded-full py-2 px-4 text-xs pr-10 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                  />
                  <button 
                    disabled={!newComment.trim() || isSubmitting}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-indigo-600 disabled:text-slate-300 transition-colors"
                  >
                    <Send size={14} />
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
