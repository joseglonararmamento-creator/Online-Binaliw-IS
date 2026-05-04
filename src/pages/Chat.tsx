import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  updateDoc, 
  setDoc,
  doc, 
  deleteDoc,
  limit,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { 
  Send, 
  Paperclip, 
  Image as ImageIcon, 
  X, 
  Smile, 
  Book,
  GraduationCap,
  Download,
  Phone,
  Video,
  Mic,
  ChevronRight,
  MoreVertical,
  Trash2,
  Search,
  FileText,
  MessageCircle,
  Plus,
  FileCode,
  FileArchive,
  MonitorPlay,
  FileUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { uploadWithProgress } from '../services/storageService';
import { getSafeDate } from '../lib/dateUtils';

interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: any;
  mediaUrl?: string;
  mediaType?: 'image' | 'file' | 'audio' | 'video';
  fileName?: string;
  fileSize?: number;
  reactions?: { [emoji: string]: string[] };
}

interface ChatUser {
  uid: string;
  displayName: string;
  photoURL?: string;
  role: string;
  isOnline?: boolean;
}

const AudioPlayer = ({ src, isMine }: { src: string, isMine: boolean }) => {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.error);
    }
    setPlaying(!playing);
  };

  return (
    <div className={`flex items-center gap-2 p-2 rounded-xl border ${isMine ? 'bg-indigo-700/50 border-white/20' : 'bg-slate-50 border-slate-200'}`}>
      <button 
        type="button"
        onClick={togglePlay}
        className={`w-8 h-8 rounded-full flex items-center justify-center ${isMine ? 'bg-white text-indigo-600' : 'bg-indigo-600 text-white'}`}
      >
        {playing ? <div className="w-1.5 h-1.5 bg-current rounded-full animate-ping" /> : <Mic size={14} />}
      </button>
      <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
        <audio 
          ref={audioRef} 
          src={src} 
          onEnded={() => setPlaying(false)}
          className="hidden"
        />
        {playing && <motion.div initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 5 }} className="h-full bg-indigo-500" />}
      </div>
    </div>
  );
};

export default function Chat() {
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const targetUserId = searchParams.get('userId');
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [chatType, setChatType] = useState<'class' | 'dm'>('dm');
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [userClasses, setUserClasses] = useState<any[]>([]);
  const [uploadingProgress, setUploadingProgress] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'uploading' | 'weak-signal' | 'paused'>('uploading');
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<{ [id: string]: number }>({});
  const [searchQuery, setSearchQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [messageLimit, setMessageLimit] = useState(20);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Auto-scroll logic
  useEffect(() => {
    if (messages && messages.length > 0 && !isLoadingMore) {
      // Only auto-scroll to bottom if we just loaded the first batch 
      // or if the latest message is from the current user
      const lastMsg = messages[messages.length - 1];
      const isInitialLoad = messages.length <= 20 && messageLimit === 20;
      const isMyNewMessage = lastMsg.senderId === profile?.uid;

      if (isInitialLoad || isMyNewMessage) {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [messages?.length, isLoadingMore, messageLimit, profile?.uid]);

  // Online Status Monitoring
  useEffect(() => {
    if (!profile?.uid) return;
    const userRef = doc(db, 'users', profile.uid);
    updateDoc(userRef, { isOnline: true }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid} online init`));

    const handleVisibility = () => {
      updateDoc(userRef, { isOnline: document.visibilityState === 'visible' }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid} visibility`));
    };

    window.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('visibilitychange', handleVisibility);
      updateDoc(userRef, { isOnline: false }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid} offline`));
    };
  }, [profile?.uid]);

  // Sync Users List
  useEffect(() => {
    if (!profile?.uid) return;
    const q = query(collection(db, 'users'), limit(50));
    const unsubscribe = onSnapshot(q, (snap) => {
      const usersList = snap.docs.map(d => ({ ...d.data(), uid: d.id } as ChatUser)).filter(u => u.uid !== profile?.uid);
      setUsers(usersList);

      // Handle direct message from URL
      if (targetUserId && !selectedUser && !selectedClass) {
        const target = usersList.find(u => u.uid === targetUserId);
        if (target) {
          setSelectedUser(target);
          setChatType('dm');
        }
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users list chat'));
    return () => unsubscribe();
  }, [profile?.uid]);

  // Sync Classes List
  useEffect(() => {
    if (!profile?.uid) return;
    const updateClasses = (snap: any) => {
      setUserClasses(prev => {
        const newClasses = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        const merged = [...prev];
        newClasses.forEach((nc: any) => {
          const idx = merged.findIndex(c => c.id === nc.id);
          if (idx >= 0) merged[idx] = nc;
          else merged.push(nc);
        });
        return merged;
      });
    };

    const unsubStudent = onSnapshot(query(collection(db, 'classes'), where('students', 'array-contains', profile.uid)), updateClasses, (err) => handleFirestoreError(err, OperationType.LIST, 'student classes chat'));
    const unsubTeacher = onSnapshot(query(collection(db, 'classes'), where('teacherId', '==', profile.uid)), updateClasses, (err) => handleFirestoreError(err, OperationType.LIST, 'teacher classes chat'));
    
    return () => { unsubStudent(); unsubTeacher(); };
  }, [profile?.uid]);

  // Sync Unread Counts
  useEffect(() => {
    if (!profile?.uid) return;
    const unsubFns: (() => void)[] = [];

    users.forEach(u => {
      const chatId = profile.uid < u.uid ? `${profile.uid}_${u.uid}` : `${u.uid}_${profile.uid}`;
      const unsub = onSnapshot(doc(db, 'chats', chatId), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const lastRead = getSafeDate(data?.lastRead?.[profile.uid]);
          const lastMsg = getSafeDate(data?.lastMessageTime);
          setUnreadCounts(prev => ({ ...prev, [u.uid]: (lastMsg && (!lastRead || lastMsg > lastRead)) ? 1 : 0 }));
        }
      }, (err) => handleFirestoreError(err, OperationType.GET, `chats/${chatId} unread`));
      unsubFns.push(unsub);
    });

    userClasses.forEach(c => {
      const unsub = onSnapshot(doc(db, 'classes', c.id), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const lastRead = getSafeDate(data?.lastRead?.[profile.uid]);
          const lastMsg = getSafeDate(data?.lastMessageTime);
          setUnreadCounts(prev => ({ ...prev, [c.id]: (lastMsg && (!lastRead || lastMsg > lastRead)) ? 1 : 0 }));
        }
      }, (err) => handleFirestoreError(err, OperationType.GET, `classes/${c.id} unread`));
      unsubFns.push(unsub);
    });

    return () => unsubFns.forEach(fn => fn());
  }, [profile?.uid, users.length, userClasses.length]);

  // Mark Read Logic
  useEffect(() => {
    if (!profile?.uid || !messages?.length || (!selectedUser && !selectedClass)) return;
    const markAsRead = async () => {
      try {
        if (chatType === 'dm' && selectedUser) {
          const chatId = profile.uid < selectedUser.uid ? `${profile.uid}_${selectedUser.uid}` : `${selectedUser.uid}_${profile.uid}`;
          await setDoc(doc(db, 'chats', chatId), { lastRead: { [profile.uid]: serverTimestamp() } }, { merge: true });
        } else if (chatType === 'class' && selectedClass) {
          await setDoc(doc(db, 'classes', selectedClass.id), { lastRead: { [profile.uid]: serverTimestamp() } }, { merge: true });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `mark read ${chatType} chat`);
      }
    };
    markAsRead();
  }, [messages?.length, chatType, selectedUser?.uid, selectedClass?.id, profile?.uid]);

  // Message Syncing
  useEffect(() => {
    if (!profile?.uid) return;
    let q: any;
    if (chatType === 'dm' && selectedUser) {
      const chatId = profile.uid < selectedUser.uid ? `${profile.uid}_${selectedUser.uid}` : `${selectedUser.uid}_${profile.uid}`;
      q = query(collection(db, `chats/${chatId}/messages`), orderBy('createdAt', 'desc'), limit(messageLimit));
    } else if (chatType === 'class' && selectedClass) {
      q = query(collection(db, `classes/${selectedClass.id}/messages`), orderBy('createdAt', 'desc'), limit(messageLimit));
    }

    if (!q) {
      setMessages(null);
      return;
    }

    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Message)).reverse();
      setMessages(msgs);
      setHasMore(snap.docs.length >= messageLimit);
      setIsLoadingMore(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'messages list chat');
      setIsLoadingMore(false);
    });
    return () => unsub();
  }, [chatType, selectedUser, selectedClass, profile?.uid, messageLimit]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollTop === 0 && hasMore && !isLoadingMore) {
      setIsLoadingMore(true);
      setMessageLimit(prev => prev + 20);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!profile?.uid || (!newMessage.trim() && !uploadingProgress)) return;

    const textToSubmit = newMessage.trim();
    setNewMessage('');

    try {
      let chatId = '';
      if (chatType === 'dm' && selectedUser) {
        chatId = profile.uid < selectedUser.uid ? `${profile.uid}_${selectedUser.uid}` : `${selectedUser.uid}_${profile.uid}`;
      } else if (chatType === 'class' && selectedClass) {
        chatId = selectedClass.id;
      }

      if (!chatId) throw new Error("No chat selected");

      const colRef = collection(db, chatType === 'dm' ? `chats/${chatId}/messages` : `classes/${chatId}/messages`);
      await addDoc(colRef, {
        senderId: profile.uid,
        text: textToSubmit,
        createdAt: serverTimestamp(),
        reactions: {}
      });

      const metaRef = doc(db, chatType === 'dm' ? 'chats' : 'classes', chatId);
      await setDoc(metaRef, { lastMessageTime: serverTimestamp() }, { merge: true });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `send message ${chatType} chat`);
    }
  };

  const handleFileUpload = async (file: File, type: 'image' | 'file' | 'audio' | 'video') => {
    if (!profile?.uid) return;
    try {
      let chatId = '';
      if (chatType === 'dm' && selectedUser) {
        chatId = profile.uid < selectedUser.uid ? `${profile.uid}_${selectedUser.uid}` : `${selectedUser.uid}_${profile.uid}`;
      } else if (chatType === 'class' && selectedClass) {
        chatId = selectedClass.id;
      }
      if (!chatId) throw new Error("No active chat");

      setUploadStatus('uploading');
      const url = await uploadWithProgress(file, `chat/${chatId}`, (progress, status) => {
        setUploadingProgress(progress);
        if (status) setUploadStatus(status);
      });
      const colRef = collection(db, chatType === 'dm' ? `chats/${chatId}/messages` : `classes/${chatId}/messages`);
      
      await addDoc(colRef, {
        senderId: profile.uid,
        mediaUrl: url,
        mediaType: type,
        fileName: file.name,
        fileSize: file.size,
        text: '',
        createdAt: serverTimestamp(),
        reactions: {}
      });

      const metaRef = doc(db, chatType === 'dm' ? 'chats' : 'classes', chatId);
      await setDoc(metaRef, { lastMessageTime: serverTimestamp() }, { merge: true });
      setShowPlusMenu(false);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `upload/send media ${chatType} chat`);
    } finally {
      setUploadingProgress(null);
    }
  };

  const handleAddReaction = async (msgId: string, emoji: string) => {
    if (!profile?.uid || !messages) return;
    let chatId = '';
    if (chatType === 'dm' && selectedUser) {
      chatId = profile.uid < selectedUser.uid ? `${profile.uid}_${selectedUser.uid}` : `${selectedUser.uid}_${profile.uid}`;
    } else if (chatType === 'class' && selectedClass) {
      chatId = selectedClass.id;
    }
    const colPath = chatType === 'dm' ? `chats/${chatId}/messages` : `classes/${chatId}/messages`;

    try {
      const msg = messages.find(m => m.id === msgId);
      if (!msg) return;

      const reactions = msg.reactions || {};
      const usersWhoReacted = reactions[emoji] || [];
      
      if (usersWhoReacted.includes(profile.uid)) {
        reactions[emoji] = usersWhoReacted.filter(id => id !== profile.uid);
      } else {
        reactions[emoji] = [...usersWhoReacted, profile.uid];
      }

      await updateDoc(doc(db, colPath, msgId), { reactions });
      setShowReactionPicker(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `reaction ${colPath}/${msgId}`);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!profile?.uid) return;
    try {
      let chatId = '';
      if (chatType === 'dm' && selectedUser) {
        chatId = profile.uid < selectedUser.uid ? `${profile.uid}_${selectedUser.uid}` : `${selectedUser.uid}_${profile.uid}`;
      } else if (chatType === 'class' && selectedClass) {
        chatId = selectedClass.id;
      }
      const colPath = chatType === 'dm' ? `chats/${chatId}/messages` : `classes/${chatId}/messages`;
      await deleteDoc(doc(db, colPath, msgId));
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `message ${msgId} in ${chatType} chat`);
    }
  };

  // Recording Logic
  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorder?.stop();
      mediaRecorder?.stream.getTracks().forEach(t => t.stop());
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        const file = new File([audioBlob], "voice_note.webm", { type: 'audio/webm' });
        handleFileUpload(file, 'audio');
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err) {
      window.alert("Microphone access required for voice notes.");
    }
  };

  return (
    <div className="h-full flex overflow-hidden bg-[#F8FAFC]">
      {/* Sidebar Section */}
      <div className={`w-full md:w-80 border-r border-slate-200 ${selectedUser || selectedClass ? 'hidden' : 'flex'} md:flex flex-col bg-white`}>
        <div className="p-6">
          <h2 className="text-xl font-black text-slate-900 mb-4 tracking-tight">Messenger</h2>
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Contacts, classes..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="flex p-1 bg-slate-100 rounded-xl mb-6">
            <button 
              onClick={() => { setChatType('dm'); setSelectedUser(null); setSelectedClass(null); }}
              className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${chatType === 'dm' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
            >
              Members
            </button>
            <button 
              onClick={() => { setChatType('class'); setSelectedUser(null); setSelectedClass(null); }}
              className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${chatType === 'class' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
            >
              Classes
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 space-y-2 pb-6">
          {chatType === 'dm' ? (
            users.filter(u => u?.displayName?.toLowerCase().includes(searchQuery.toLowerCase())).map(u => (
              <button 
                key={u.uid}
                onClick={() => setSelectedUser(u)}
                className={`w-full p-3 rounded-2xl flex items-center gap-3 transition-all ${selectedUser?.uid === u.uid ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'hover:bg-slate-50'}`}
              >
                <div className="relative">
                  <img src={u?.photoURL || 'https://via.placeholder.com/40'} className="w-10 h-10 rounded-full border-2 border-white shadow-sm" alt="" />
                  {u?.isOnline && <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white" />}
                </div>
                <div className="text-left flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <p className="text-xs font-bold truncate">{u?.displayName}</p>
                    {unreadCounts[u.uid] > 0 && <div className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse" />}
                  </div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase">{u?.role}</p>
                </div>
              </button>
            ))
          ) : (
            userClasses.filter(c => c?.name?.toLowerCase().includes(searchQuery.toLowerCase())).map(c => (
              <button 
                key={c.id}
                onClick={() => setSelectedClass(c)}
                className={`w-full p-3.5 rounded-2xl flex items-center gap-3 transition-all ${selectedClass?.id === c.id ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'hover:bg-slate-50'}`}
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm relative">
                  <Book size={18} />
                  {unreadCounts[c.id] > 0 && <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-indigo-600 rounded-full border-2 border-white animate-pulse" />}
                </div>
                <div className="text-left flex-1 min-w-0">
                  <p className="text-xs font-bold truncate">{c?.name}</p>
                  <p className="text-[9px] text-slate-400 font-bold uppercase truncate">{c?.teacherName}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Area */}
      <div className={`flex-1 flex flex-col relative bg-white ${!selectedUser && !selectedClass ? 'hidden md:flex' : 'flex'}`}>
        {selectedUser || selectedClass ? (
          <>
            {/* Header Area */}
            <header className="h-16 px-4 bg-white/80 backdrop-blur-md border-b border-slate-100 flex items-center justify-between z-10 sticky top-0">
              <div className="flex items-center gap-3">
                <button className="md:hidden p-2 -ml-2 text-slate-400" onClick={() => { setSelectedUser(null); setSelectedClass(null); }}>
                   <ChevronRight size={20} className="rotate-180" />
                </button>
                {chatType === 'dm' ? (
                  <img src={selectedUser?.photoURL || 'https://via.placeholder.com/40'} className="w-9 h-9 rounded-full border border-indigo-50" alt="" />
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm">
                    <GraduationCap size={18} />
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-bold text-slate-900 leading-none mb-1">{chatType === 'dm' ? selectedUser?.displayName : selectedClass?.name}</h3>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${selectedUser?.isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">
                      {chatType === 'dm' ? (selectedUser?.isOnline ? 'Available' : 'Away') : 'Academic Channel'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                <button className="p-2 text-slate-400 hover:bg-slate-50 rounded-xl"><Phone size={16} /></button>
                <button className="p-2 text-slate-400 hover:bg-slate-50 rounded-xl"><Video size={16} /></button>
                <button className="p-2 text-slate-400 hover:bg-slate-50 rounded-xl"><MoreVertical size={16} /></button>
              </div>
            </header>

            {/* Chat Body */}
            <div 
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/20"
            >
              {isLoadingMore && (
                <div className="flex justify-center p-4">
                  <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {!messages ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                   <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Securely Connecting...</p>
                </div>
              ) : Array.isArray(messages) && messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-12">
                   <div className="w-16 h-16 bg-white rounded-3xl shadow-sm flex items-center justify-center text-slate-200 mb-6 border border-slate-50">
                      <MessageCircle size={32} />
                   </div>
                   <h4 className="text-base font-black text-slate-900 mb-1">Send a Greeting</h4>
                   <p className="text-xs text-slate-400 max-w-[200px]">Start your conversation securely. Your messages are private.</p>
                </div>
              ) : (
                messages.map((m, idx) => {
                  const isMine = m?.senderId === profile?.uid;
                  const mDate = getSafeDate(m?.createdAt);
                  const prevDate = idx > 0 ? getSafeDate(messages[idx-1]?.createdAt) : null;
                  const showDate = !prevDate || (mDate && format(mDate, 'yyMMdd') !== format(prevDate, 'yyMMdd'));

                  return (
                    <div key={m?.id} className="space-y-1.5 focus-within:z-10">
                      {showDate && mDate && (
                        <div className="flex justify-center my-6">
                           <span className="px-3 py-1 bg-white border border-slate-100 rounded-full text-[9px] font-black text-slate-400 uppercase tracking-widest shadow-sm">
                             {format(mDate, 'MMMM d, yyyy')}
                           </span>
                        </div>
                      )}
                      
                      <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                         <div className={`max-w-[85%] flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                           <div className="group relative">
                             <div className={`px-4 py-3 rounded-2xl shadow-sm transition-all duration-200 ${
                               isMine 
                                 ? 'bg-indigo-600 text-white rounded-br-none' 
                                 : 'bg-white border border-slate-100 text-slate-900 rounded-bl-none'
                             }`}>
                               {m?.mediaType === 'image' && <img src={m?.mediaUrl} className="rounded-xl mb-2 max-w-full shadow-inner" alt="" />}
                               {m?.mediaType === 'video' && (
                                 <video src={m?.mediaUrl} controls className="rounded-xl mb-2 max-w-full shadow-inner" />
                               )}
                               {m?.mediaType === 'file' && (
                                 <div className={`p-3 rounded-xl flex items-center gap-3 mb-2 ${isMine ? 'bg-white/10' : 'bg-slate-50 border border-slate-100'}`}>
                                   <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                     m.fileName?.toLowerCase().endsWith('.pdf') ? 'bg-red-50 text-red-500' :
                                     m.fileName?.toLowerCase().endsWith('.ppt') || m.fileName?.toLowerCase().endsWith('.pptx') ? 'bg-amber-50 text-amber-600' :
                                     m.fileName?.toLowerCase().endsWith('.doc') || m.fileName?.toLowerCase().endsWith('.docx') ? 'bg-blue-50 text-blue-600' :
                                     'bg-indigo-50 text-indigo-600'
                                   }`}>
                                     <FileText size={20} />
                                   </div>
                                   <div className="flex-1 min-w-0">
                                     <p className={`text-[10px] font-black truncate ${isMine ? 'text-white' : 'text-slate-900'}`}>{m?.fileName}</p>
                                     <p className={`text-[8px] uppercase tracking-widest opacity-60 ${isMine ? 'text-white/70' : 'text-slate-400'}`}>
                                       {m.fileName?.toLowerCase().endsWith('.pdf') ? 'PDF Document' :
                                        m.fileName?.toLowerCase().endsWith('.ppt') || m.fileName?.toLowerCase().endsWith('.pptx') ? 'PowerPoint' :
                                        m.fileName?.toLowerCase().endsWith('.doc') || m.fileName?.toLowerCase().endsWith('.docx') ? 'Word Document' :
                                        'Attachment'}
                                     </p>
                                   </div>
                                   <a href={m?.mediaUrl} target="_blank" rel="noreferrer" className={`p-2 rounded-lg transition-colors ${isMine ? 'hover:bg-white/20 text-white' : 'hover:bg-slate-100 text-slate-400'}`}>
                                     <Download size={14} />
                                   </a>
                                 </div>
                               )}
                               {m?.mediaType === 'audio' && <AudioPlayer src={m?.mediaUrl || ''} isMine={isMine} />}
                               {m?.text && <p className="text-sm leading-relaxed whitespace-pre-wrap">{m?.text}</p>}

                               {/* Reactions */}
                               {m?.reactions && Object.keys(m.reactions).length > 0 && (
                                 <div className={`absolute -bottom-2 ${isMine ? 'right-0' : 'left-0'} flex gap-1`}>
                                   {Object.entries(m.reactions).map(([emoji, uids]) => (
                                     uids && uids.length > 0 && (
                                       <div key={emoji} className="px-1.5 py-0.5 bg-white border border-slate-100 rounded-full shadow-md text-[9px] flex items-center gap-1 scale-90">
                                         <span>{emoji}</span>
                                         <span className="font-bold text-slate-400">{uids.length}</span>
                                       </div>
                                     )
                                   ))}
                                 </div>
                               )}
                             </div>

                             {/* Action Row */}
                             <div className={`mt-1.5 flex items-center gap-3 ${isMine ? 'justify-end' : 'justify-start'}`}>
                               <span className="text-[8px] font-black text-slate-300 uppercase tracking-tighter">
                                 {mDate ? format(mDate, 'h:mm a') : 'Encrypting...'}
                               </span>
                               <button 
                                 onClick={() => setShowReactionPicker(showReactionPicker === m?.id ? null : m?.id)}
                                 className="opacity-0 group-hover:opacity-100 transition-all p-1 text-slate-300 hover:text-indigo-600 scale-90"
                               >
                                 <Smile size={12} />
                               </button>
                               {isMine && (
                                 <button onClick={() => handleDeleteMessage(m.id)} className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 transition-all scale-90">
                                   <Trash2 size={12} />
                                 </button>
                               )}
                             </div>

                             <AnimatePresence>
                               {showReactionPicker === m?.id && (
                                 <motion.div 
                                   initial={{ opacity: 0, scale: 0.8, y: 5 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8 }}
                                   className={`absolute bottom-full mb-3 ${isMine ? 'right-0' : 'left-0'} p-2.5 bg-white rounded-full shadow-2xl border border-slate-100 z-30 flex gap-2.5`}
                                 >
                                   {['👍', '❤️', '😂', '😮', '😢'].map(emoji => (
                                     <button key={emoji} onClick={() => handleAddReaction(m.id, emoji)} className="text-base hover:scale-125 transition-transform">{emoji}</button>
                                   ))}
                                 </motion.div>
                               )}
                             </AnimatePresence>
                           </div>
                         </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={scrollRef} className="h-4" />
            </div>

            {/* Input Dashboard */}
            <footer className="p-4 bg-white border-t border-slate-100 safe-bottom">
              {uploadingProgress !== null && (
                <div className="mb-3 px-4 py-2 bg-indigo-50/50 rounded-2xl flex items-center gap-4">
                  <div className={`w-5 h-5 border-2 ${uploadStatus === 'weak-signal' ? 'border-amber-500 animate-pulse' : 'border-indigo-600 animate-spin'} border-t-transparent rounded-full`} />
                  <div className="flex-1">
                     <p className={`text-[9px] font-black uppercase tracking-[0.1em] ${uploadStatus === 'weak-signal' ? 'text-amber-500' : 'text-indigo-600'}`}>
                       {uploadStatus === 'weak-signal' ? 'Weak Signal - Retrying...' : 'Transmitting Payload...'}
                     </p>
                     <div className="h-1 bg-indigo-100 rounded-full mt-1.5 overflow-hidden">
                        <motion.div 
                          className={`h-full ${uploadStatus === 'weak-signal' ? 'bg-amber-500' : 'bg-indigo-600'}`} 
                          animate={{ width: `${uploadingProgress}%` }} 
                        />
                     </div>
                  </div>
                  <div className="text-[10px] font-black text-indigo-600">{uploadingProgress}%</div>
                </div>
              )}

              <form onSubmit={handleSendMessage} className="flex items-center gap-3 relative">
                <div className="flex items-center gap-0.5">
                   <div className="relative">
                      <button 
                        type="button"
                        onClick={() => setShowPlusMenu(!showPlusMenu)}
                        className={`p-2.5 rounded-xl transition-all active:scale-95 ${showPlusMenu ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
                      >
                         <Plus size={18} className={`transition-transform duration-300 ${showPlusMenu ? 'rotate-45' : ''}`} />
                      </button>

                      <AnimatePresence>
                        {showPlusMenu && (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 10 }}
                            className="absolute bottom-full left-0 mb-4 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 p-2 z-50"
                          >
                            <label className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors group">
                               <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                                  <ImageIcon size={18} />
                               </div>
                               <div className="text-left">
                                  <p className="text-[10px] font-black text-slate-900 uppercase">Gallery</p>
                                  <p className="text-[8px] text-slate-400 font-bold uppercase">Photos & Videos</p>
                               </div>
                               <input type="file" className="hidden" accept="image/*,video/*" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], e.target.files[0].type.startsWith('video/') ? 'video' : 'image')} />
                            </label>

                            <label className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors group mt-1">
                               <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                                  <FileUp size={18} />
                               </div>
                               <div className="text-left">
                                  <p className="text-[10px] font-black text-slate-900 uppercase">Documents</p>
                                  <p className="text-[8px] text-slate-400 font-bold uppercase">PDF, PPT, Word</p>
                               </div>
                               <input type="file" className="hidden" accept=".pdf,.ppt,.pptx,.doc,.docx" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'file')} />
                            </label>
                          </motion.div>
                        )}
                      </AnimatePresence>
                   </div>
                </div>

                <div className="flex-1 bg-slate-50 border border-slate-100 rounded-[20px] flex items-center px-4 transition-all focus-within:ring-4 focus-within:ring-indigo-100 focus-within:bg-white focus-within:border-indigo-200">
                   <textarea 
                     rows={1}
                     value={newMessage}
                     onChange={(e) => setNewMessage(e.target.value)}
                     placeholder="Message..."
                     className="flex-1 py-3 text-sm bg-transparent outline-none resize-none max-h-32 min-h-[44px]"
                     onKeyDown={(e) => {
                       if (e.key === 'Enter' && !e.shiftKey) {
                         e.preventDefault();
                         handleSendMessage();
                       }
                     }}
                   />
                   <button 
                     type="button" 
                     onClick={toggleRecording} 
                     className={`ml-2 p-2 rounded-lg transition-all ${isRecording ? 'text-red-500 bg-red-50 animate-pulse' : 'text-slate-400 hover:text-indigo-600'}`}
                   >
                     {isRecording ? <X size={18} /> : <Mic size={18} />}
                   </button>
                </div>

                <button 
                  type="submit"
                  disabled={!newMessage.trim() && uploadingProgress === null}
                  className="w-11 h-11 bg-indigo-600 text-white rounded-[18px] flex items-center justify-center shadow-lg shadow-indigo-100 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:scale-100 transition-all shrink-0"
                >
                  <Send size={18} fill="currentColor" className="ml-0.5" />
                </button>
              </form>
            </footer>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/20">
             <div className="w-20 h-20 bg-white rounded-[28px] shadow-xl flex items-center justify-center text-indigo-600 mb-8 border border-slate-100">
                <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ repeat: Infinity, duration: 4 }}>
                   <MessageCircle size={40} strokeWidth={1.5} />
                </motion.div>
             </div>
             <h3 className="text-lg font-black text-slate-900 mb-2 tracking-tight">Select a Chat</h3>
             <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] max-w-[180px] leading-relaxed">Choose a contact or academic class to start your session.</p>
          </div>
        )}
      </div>
    </div>
  );
}
