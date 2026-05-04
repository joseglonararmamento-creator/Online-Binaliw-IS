import { useState, useEffect, useRef } from 'react';
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Lesson, Quiz } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import localforage from 'localforage';
import { 
  Plus, 
  Trash2, 
  Book, 
  FileText, 
  X,
  Search,
  ExternalLink,
  ChevronRight,
  Download,
  CloudOff,
  CheckCircle2,
  Wifi,
  WifiOff,
  Trophy,
  ArrowRight,
  ChevronLeft,
  Sparkles,
  MessageSquare,
  Send,
  Loader2
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Configure stores
const lessonStore = localforage.createInstance({
  name: 'EduConnect',
  storeName: 'offline_lessons'
});

const quizStore = localforage.createInstance({
  name: "EduConnect",
  storeName: "quizzes"
});

export default function Lessons() {
  const { profile, isOnline } = useAuth();
  const navigate = useNavigate();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [offlineLessons, setOfflineLessons] = useState<Lesson[]>([]);
  const [offlineQuizIds, setOfflineQuizIds] = useState<Set<string>>(new Set());
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [showStudyModal, setShowStudyModal] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [search, setSearch] = useState('');
  
  // Form State
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'uploading' | 'weak-signal' | 'paused'>('uploading');
  const [attachedFile, setAttachedFile] = useState<{ url: string, name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadOfflineData();
  }, [isOnline]);

  const loadOfflineData = async () => {
    const lKeys = await lessonStore.keys();
    const storedL: Lesson[] = [];
    for (const key of lKeys) {
      const item = await lessonStore.getItem<Lesson>(key);
      if (item) storedL.push(item);
    }
    setOfflineLessons(storedL);

    const qKeys = await quizStore.keys();
    setOfflineQuizIds(new Set(qKeys));
  };

  useEffect(() => {
    if (!isOnline) {
      setLessons(offlineLessons);
      return;
    }

    const q = query(collection(db, 'lessons'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLessons(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Lesson)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'lessons list'));

    const fetchQuizzes = async () => {
      try {
        const snap = await getDocs(collection(db, 'quizzes'));
        setQuizzes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Quiz)));
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'quizzes list');
      }
    };
    fetchQuizzes();

    return unsubscribe;
  }, [isOnline, offlineLessons]);

  const toggleDownload = async (lesson: Lesson, e: React.MouseEvent) => {
    e.stopPropagation();
    const isDownloaded = offlineLessons.some(l => l.id === lesson.id);

    if (isDownloaded) {
      await lessonStore.removeItem(lesson.id);
      setOfflineLessons(prev => prev.filter(l => l.id !== lesson.id));
    } else {
      setDownloadingIds(prev => new Set(prev).add(lesson.id));
      
      // Save Lesson
      await lessonStore.setItem(lesson.id, lesson);
      
      // Auto-save associated quiz if available
      const associatedQuiz = quizzes.find(q => q.lessonId === lesson.id);
      if (associatedQuiz) {
        await quizStore.setItem(associatedQuiz.id, associatedQuiz);
        setOfflineQuizIds(prev => new Set(prev).add(associatedQuiz.id));
      }

      await new Promise(r => setTimeout(r, 600));
      setOfflineLessons(prev => [...prev, lesson]);
      setDownloadingIds(prev => {
        const next = new Set(prev);
        next.delete(lesson.id);
        return next;
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile || !storage) return;

    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-powerpoint'
    ];

    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|doc|docx|ppt|pptx)$/i)) {
      alert('Please upload a PDF, DOC, or PPT file.');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const { uploadWithProgress } = await import('../services/storageService');
      const url = await uploadWithProgress(file, `lessons/${profile.uid}`, (progress, status) => {
        setUploadProgress(progress);
        if (status) setUploadStatus(status);
      });
      setAttachedFile({ url, name: file.name });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `lessons/upload/${profile.uid}`);
      alert(`Failed to upload file: ${err.message}`);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleAddLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newContent || !profile) return;

    try {
      await addDoc(collection(db, 'lessons'), {
        title: newTitle,
        content: newContent,
        mediaUrls: mediaUrl ? [mediaUrl] : [],
        fileUrl: attachedFile?.url || null,
        fileName: attachedFile?.name || null,
        teacherId: profile.uid,
        createdAt: serverTimestamp(),
      });
      setShowAddModal(false);
      setNewTitle('');
      setNewContent('');
      setMediaUrl('');
      setAttachedFile(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'add lesson');
    }
  };

  const handleDeleteLesson = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this lesson?')) {
      try {
        await deleteDoc(doc(db, 'lessons', id));
        await lessonStore.removeItem(id);
        loadOfflineData();
        if (selectedLesson?.id === id) setSelectedLesson(null);
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `lessons/${id}`);
      }
    }
  };

  const filteredLessons = lessons.filter(l => 
    l.title.toLowerCase().includes(search.toLowerCase()) || 
    l.content.toLowerCase().includes(search.toLowerCase())
  );

  return (
      <div className="space-y-6 gpu-accel">
      {!isOnline && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center gap-3 text-amber-800 animate-in fade-in">
          <CloudOff size={20} className="shrink-0" />
          <div className="text-sm font-medium">
            Offline Mode: Modules and Assessments marked with <CheckCircle2 className="inline ml-1 text-emerald-500" size={14} /> are available.
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div className="flex items-center justify-between gap-2 overflow-hidden">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight flex flex-wrap items-center gap-2">
              Lessons & Modules
              {isOnline ? (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[9px] font-black uppercase tracking-widest rounded-full shrink-0">
                  <Wifi size={10} /> Active
                </span>
              ) : (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-500 text-[9px] font-black uppercase tracking-widest rounded-full shrink-0">
                  <WifiOff size={10} /> Local
                </span>
              )}
            </h2>
            <p className="text-slate-500 text-xs md:text-sm">Study at your own pace, anytime, anywhere.</p>
          </div>
          {profile?.role === 'teacher' && isOnline && (
            <button 
              onClick={() => setShowAddModal(true)}
              className="md:hidden p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100 shrink-0"
            >
              <Plus size={20} />
            </button>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search lessons..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-64 shadow-sm"
            />
          </div>
          {profile?.role === 'teacher' && isOnline && (
            <button 
              onClick={() => setShowAddModal(true)}
              className="hidden md:block p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100"
            >
              <Plus size={24} />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
        {/* Lesson List */}
        <div className={`${selectedLesson ? 'hidden md:block' : 'block'} md:col-span-1 space-y-3`}>
          <AnimatePresence>
            {filteredLessons.map((lesson) => {
              const isDownloaded = offlineLessons.some(l => l.id === lesson.id);
              const isDownloading = downloadingIds.has(lesson.id);
              const associatedQuiz = quizzes.find(q => q.lessonId === lesson.id);
              const hasQuiz = !!associatedQuiz;
              const isQuizDownloaded = associatedQuiz && offlineQuizIds.has(associatedQuiz.id);
              
              return (
                <motion.div
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  key={lesson.id}
                  onClick={() => setSelectedLesson(lesson)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all group ${
                    selectedLesson?.id === lesson.id 
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-100' 
                    : 'bg-white border-slate-100 text-slate-900 hover:border-indigo-200 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-bold truncate">{lesson.title}</h4>
                        {isDownloaded && !isDownloading && <CheckCircle2 size={14} className={selectedLesson?.id === lesson.id ? 'text-indigo-200' : 'text-emerald-500'} />}
                      </div>
                      <div className="flex items-center gap-2">
                        <p className={`text-[10px] font-black uppercase tracking-widest ${selectedLesson?.id === lesson.id ? 'text-indigo-200' : 'text-slate-400'}`}>
                          {lesson.content.length} Len
                        </p>
                        {hasQuiz && (
                          <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded flex items-center gap-1 ${
                            selectedLesson?.id === lesson.id ? 'bg-indigo-500 text-white' : 'bg-amber-50 text-amber-600 border border-amber-100'
                          }`}>
                            <Trophy size={8} /> Assessment
                            {isQuizDownloaded && <CheckCircle2 size={8} className="text-emerald-500" />}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {isOnline && (
                        <button 
                          onClick={(e) => toggleDownload(lesson, e)}
                          className={`p-1.5 rounded-lg transition-all ${
                            isDownloading ? 'animate-pulse' : ''
                          } ${
                            selectedLesson?.id === lesson.id 
                            ? 'hover:bg-indigo-500 text-white' 
                            : isDownloaded ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 hover:bg-indigo-50 hover:text-indigo-600'
                          }`}
                          title="Save for Learning Offline"
                        >
                          <Download size={16} className={isDownloading ? 'animate-bounce' : ''} />
                        </button>
                      )}
                      {profile?.role === 'teacher' && isOnline && (
                        <button 
                          onClick={(e) => handleDeleteLesson(lesson.id, e)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            selectedLesson?.id === lesson.id ? 'hover:bg-indigo-500 text-white' : 'hover:bg-red-50 text-slate-400 hover:text-red-600'
                          }`}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {filteredLessons.length === 0 && (
            <div className="py-12 text-center text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
              {isOnline ? 'No lessons matching your search.' : 'No offline lessons available. Connect to internet to download resources.'}
            </div>
          )}
        </div>

        {/* Selected Lesson Detail */}
        <div className={`${selectedLesson ? 'block' : 'hidden md:block'} md:col-span-2`}>
          {selectedLesson ? (
            <motion.div 
              key={selectedLesson.id}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 md:p-10 min-h-[500px]"
            >
              <button 
                onClick={() => setSelectedLesson(null)}
                className="md:hidden flex items-center gap-1 text-indigo-600 font-bold text-sm mb-6 -ml-2"
              >
                <ChevronLeft size={20} /> Back to Modules
              </button>

              <header className="mb-8 border-b border-slate-100 pb-8">
                <div className="flex flex-wrap items-center justify-between gap-6">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex flex-wrap items-center gap-2 text-indigo-600 mb-2 font-black uppercase tracking-widest text-[9px] sm:text-[10px]">
                      <FileText size={14} />
                      Lesson Module
                      {offlineLessons.some(l => l.id === selectedLesson.id) && (
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full flex items-center gap-1">
                          <CheckCircle2 size={10} /> Saved Offline
                        </span>
                      )}
                    </div>
                    <h3 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
                      {selectedLesson.title}
                    </h3>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-3">
                    {isOnline && (
                      <button 
                        onClick={() => setShowStudyModal(true)}
                        className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-2 hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all hover:-translate-y-1 active:scale-95"
                      >
                        <Sparkles size={16} />
                        Help Me Study
                      </button>
                    )}

                    {/* Improved Quiz Link */}
                  {(() => {
                    const associatedQuiz = quizzes.find(q => q.lessonId === selectedLesson.id);
                    const isAvailable = associatedQuiz && (isOnline || offlineQuizIds.has(associatedQuiz.id));
                    
                    if (!isAvailable) return null;

                    return (
                      <button 
                        onClick={() => navigate(`/quiz/${associatedQuiz.id}`)}
                        className="px-6 py-3 bg-amber-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-2 hover:bg-amber-600 shadow-lg shadow-amber-100 transition-all hover:-translate-y-1 active:scale-95"
                      >
                        <Trophy size={16} />
                        Launch Quiz
                        <ArrowRight size={14} />
                      </button>
                    );
                  })()}
                </div>
              </div>
            </header>

              <div className="prose prose-slate max-w-none prose-headings:font-bold prose-p:text-slate-600 prose-p:leading-relaxed bg-slate-50/30 p-5 md:p-8 rounded-3xl border border-slate-100/50 text-sm md:text-base">
                <ReactMarkdown>{selectedLesson.content}</ReactMarkdown>
              </div>

              {selectedLesson.fileUrl && (
                <div className="mt-8 p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-indigo-600 shadow-sm">
                      <Download size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{selectedLesson.fileName || 'Attached Document'}</p>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Lesson Material</p>
                    </div>
                  </div>
                  <a 
                    href={selectedLesson.fileUrl} 
                    target="_blank" 
                    rel="noreferrer"
                    className="px-4 py-2 bg-white text-indigo-600 rounded-lg text-xs font-black uppercase tracking-widest border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                  >
                    Download
                  </a>
                </div>
              )}

              {selectedLesson.mediaUrls && selectedLesson.mediaUrls.length > 0 && (
                <div className="mt-12 pt-12 border-t border-slate-100">
                  <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2 uppercase tracking-widest text-xs">
                    <ExternalLink size={18} className="text-indigo-600" />
                    Curated Resources
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {selectedLesson.mediaUrls.map((url, i) => (
                      <a 
                        key={i} 
                        href={isOnline ? url : '#'} 
                        target={isOnline ? "_blank" : undefined}
                        rel="noreferrer"
                        className={`flex items-center gap-3 p-4 bg-slate-50 rounded-2xl transition-all border border-transparent ${!isOnline ? 'cursor-not-allowed opacity-60' : 'hover:bg-slate-100 hover:border-indigo-100 group'}`}
                        onClick={e => !isOnline && e.preventDefault()}
                      >
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 group-hover:text-indigo-600 transition-colors shadow-sm">
                          <Book size={20} />
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <span className="text-sm font-bold text-slate-700 truncate block">{url}</span>
                          {!isOnline && <span className="text-[10px] text-amber-600 font-bold uppercase tracking-tighter">Online Only</span>}
                        </div>
                        {isOnline && <ChevronRight size={16} className="ml-auto text-slate-300 group-hover:text-indigo-600" />}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <div className="bg-white rounded-3xl border border-dashed border-slate-200 h-[500px] flex flex-col items-center justify-center text-slate-400 text-center px-8">
              <div className="p-8 bg-slate-50 rounded-full mb-6">
                <Book size={64} className="text-slate-300" />
              </div>
              <h4 className="text-xl font-black text-slate-900 mb-2">Module Viewer</h4>
              <p className="text-sm max-w-xs text-slate-500">Pick a course module from the syllabus to start your learning session.</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Lesson Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl w-full max-w-xl shadow-2xl flex flex-col my-auto max-h-[90vh] overflow-hidden"
            >
              <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-indigo-600 text-white shrink-0">
                <h3 className="text-lg font-bold">New Lesson</h3>
                <button onClick={() => setShowAddModal(false)} className="p-1.5 hover:bg-indigo-500 rounded-lg transition-colors">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleAddLesson} className="flex flex-col min-h-0 overflow-hidden">
                <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-widest">Lesson Title</label>
                    <input 
                      type="text" 
                      required 
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      placeholder="e.g. Introduction to Calculus"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-widest">Content (Markdown Supported)</label>
                    <textarea 
                      required 
                      rows={5}
                      value={newContent}
                      onChange={e => setNewContent(e.target.value)}
                      placeholder="Compose your lesson module here..."
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-600 leading-relaxed font-mono text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-widest">External Link (Optional)</label>
                      <input 
                        type="url" 
                        value={mediaUrl}
                        onChange={e => setMediaUrl(e.target.value)}
                        placeholder="https://youtube.com/..."
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-widest">Upload File (PDF, DOC, PPT)</label>
                      <div className="space-y-3">
                        <input 
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileUpload}
                          className="hidden"
                          accept=".pdf,.doc,.docx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                        />
                        
                        {!attachedFile && !uploading ? (
                          <button 
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full py-4 px-4 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-indigo-400 hover:text-indigo-600 transition-all group"
                          >
                            <div className="p-3 bg-slate-50 rounded-full group-hover:bg-indigo-50 transition-colors">
                              <Plus size={24} />
                            </div>
                            <span className="text-xs font-black uppercase tracking-widest">Select Material</span>
                          </button>
                        ) : uploading ? (
                          <div className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl">
                            <div className="flex justify-between items-center mb-2">
                              <span className={`text-[10px] font-black uppercase tracking-widest ${uploadStatus === 'weak-signal' ? 'text-amber-500 animate-pulse' : 'text-indigo-600'}`}>
                                {uploadStatus === 'weak-signal' ? 'Weak Signal - Retrying...' : 'Uploading...'}
                              </span>
                              <span className="text-[10px] font-black text-indigo-600">{Math.round(uploadProgress)}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <motion.div 
                                className={`h-full ${uploadStatus === 'weak-signal' ? 'bg-amber-400' : 'bg-indigo-600'}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${uploadProgress}%` }}
                                transition={{ duration: 0.1 }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-emerald-600 shadow-sm shrink-0">
                              <CheckCircle2 size={20} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-emerald-900 truncate">{attachedFile!.name}</p>
                              <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Ready to publish</p>
                            </div>
                            <button 
                              type="button" 
                              onClick={() => setAttachedFile(null)}
                              className="p-2 hover:bg-emerald-100 rounded-lg text-emerald-600 transition-colors shrink-0"
                              title="Remove File"
                            >
                              <X size={18} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3 shrink-0">
                  <button 
                    type="button" 
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 py-2.5 text-slate-500 text-xs font-black uppercase tracking-widest hover:text-slate-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="flex-[2] py-2.5 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-[0.98]"
                  >
                    Publish Module
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {selectedLesson && (
        <StudyAssistantModal 
          isOpen={showStudyModal} 
          onClose={() => setShowStudyModal(false)} 
          lessonTitle={selectedLesson.title} 
          lessonContent={selectedLesson.content} 
        />
      )}
    </div>
  );
}

function StudyAssistantModal({ isOpen, onClose, lessonTitle, lessonContent }: { isOpen: boolean, onClose: () => void, lessonTitle: string, lessonContent: string }) {
  const [messages, setMessages] = useState<{ role: 'user' | 'model', text: string }[]>([
    { role: 'model', text: `Hi! I'm your AI Study Assistant. I've read the module "**${lessonTitle}**". How can I help you understand it better? You can ask me to summarize it, explain a concept, or quiz you on the topics!` }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setLoading(true);

    try {
      const history = messages.map(m => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: [{ text: m.text }]
      }));

      const model = ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          ...history,
          { role: 'user', parts: [{ text: userMessage }] }
        ],
        config: {
          systemInstruction: `You are a helpful and expert AI Study Assistant for a student. 
          The student is currently studying a module titled: "${lessonTitle}".
          Here is the full content of the module:
          ---
          ${lessonContent}
          ---
          Provide clear, concise, and educational explanations. Use analogies if helpful. 
          Encourage critical thinking. If the user asks about something completely unrelated to the study context, gently steer them back to the topic.`
        }
      });

      const response = await model;
      setMessages(prev => [...prev, { role: 'model', text: response.text || "I'm sorry, I couldn't generate a response." }]);
    } catch (err) {
      console.error("AI Error:", err);
      setMessages(prev => [...prev, { role: 'model', text: "Error: I'm having trouble connecting to my brain right now. Please try again later." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col h-[80vh]"
          >
            <header className="p-5 bg-indigo-600 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-white">Study Assistant</h3>
                  <p className="text-[10px] opacity-80 font-bold uppercase tracking-tighter line-clamp-1">{lessonTitle}</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </header>

            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50 custom-scrollbar"
            >
              {messages.map((m, i) => (
                <div 
                  key={i} 
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] rounded-2xl p-4 text-sm shadow-sm ${
                    m.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-tr-none' 
                    : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none'
                  }`}>
                    <div className="prose prose-sm prose-slate max-w-none prose-p:leading-relaxed prose-p:m-0">
                      <ReactMarkdown>{m.text}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white text-slate-400 border border-slate-150 rounded-2xl rounded-tl-none p-4 flex items-center gap-2 shadow-sm">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-[10px] font-black uppercase tracking-widest">AI is thinking...</span>
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleSend} className="p-4 bg-white border-t border-slate-100 flex gap-3 shrink-0">
              <input 
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask your AI study buddy anything..."
                className="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-900"
              />
              <button 
                type="submit"
                disabled={!input.trim() || loading}
                className="bg-indigo-600 text-white w-12 h-12 rounded-xl flex items-center justify-center hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50 active:scale-90 shrink-0"
              >
                <Send size={20} />
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

