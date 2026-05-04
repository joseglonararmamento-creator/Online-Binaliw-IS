import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { QuizAttempt, Quiz } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import localforage from 'localforage';
import { 
  Trophy, 
  Calendar, 
  TrendingUp, 
  Award,
  ChevronRight,
  ClipboardCheck,
  Search,
  CloudOff,
  RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';
import { getSafeDate } from '../lib/dateUtils';

const pendingAttemptsStore = localforage.createInstance({
  name: "EduConnect",
  storeName: "pending_quiz_attempts"
});

export default function QuizHistory() {
  const { profile, isOnline } = useAuth();
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [pendingAttempts, setPendingAttempts] = useState<any[]>([]);
  const [quizzes, setQuizzes] = useState<Record<string, Quiz>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!profile) return;

    const fetchQuizzesAndPending = async () => {
      try {
        // Fetch quizzes
        const snap = await getDocs(collection(db, 'quizzes'));
        const quizMap: Record<string, Quiz> = {};
        snap.docs.forEach(doc => {
          quizMap[doc.id] = { id: doc.id, ...doc.data() } as Quiz;
        });
        setQuizzes(quizMap);

        // Fetch pending attempts
        const keys = await pendingAttemptsStore.keys();
        const pending: any[] = [];
        for (const key of keys) {
          const item = await pendingAttemptsStore.getItem(key);
          if (item && typeof item === 'object') pending.push({ id: key, ...item });
        }
        setPendingAttempts(pending);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'quizzes list for history');
      }
    };

    fetchQuizzesAndPending();

    // Fetch attempts from Firestore
    const q = profile.role === 'teacher'
      ? query(collection(db, 'quizAttempts'), orderBy('completedAt', 'desc'))
      : query(collection(db, 'quizAttempts'), where('studentId', '==', profile.uid), orderBy('completedAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAttempts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as QuizAttempt)));
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'quiz attempts list'));

    return unsubscribe;
  }, [profile, isOnline]);

  const filteredAttempts = attempts.filter(a => {
    const quiz = quizzes[a.quizId];
    return quiz?.title.toLowerCase().includes(search.toLowerCase()) || 
           a.studentId.toLowerCase().includes(search.toLowerCase());
  });

  const filteredPending = pendingAttempts.filter(a => {
    const quiz = quizzes[a.quizId];
    return quiz?.title.toLowerCase().includes(search.toLowerCase());
  });

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-pulse text-indigo-600 font-bold">Loading assessment history...</div>
    </div>
  );

  const totalAttemptsCount = attempts.length + pendingAttempts.length;
  const averageScore = attempts.length > 0 
    ? Math.round((attempts.reduce((acc, curr) => acc + (curr.score / curr.total), 0) / attempts.length) * 100) 
    : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Quiz History</h2>
          <p className="text-slate-500">Track performance and review past assessments.</p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search assessments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-64 shadow-sm"
          />
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
            <ClipboardCheck size={28} />
          </div>
          <div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Completed</p>
            <h4 className="text-2xl font-black text-slate-900">{totalAttemptsCount}</h4>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
            <TrendingUp size={28} />
          </div>
          <div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Avg. Score</p>
            <h4 className="text-2xl font-black text-slate-900">{averageScore}%</h4>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center">
            <Award size={28} />
          </div>
          <div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Achievement</p>
            <h4 className="text-2xl font-black text-slate-900">{averageScore > 80 ? 'Master' : 'Learner'}</h4>
          </div>
        </div>
      </div>

      {/* History List/Table */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden shadow-slate-200/50">
        {/* Mobile List View */}
        <div className="block md:hidden divide-y divide-slate-100">
          <AnimatePresence>
            {/* Pending Attempts First */}
            {filteredPending.map((attempt) => {
              const quiz = quizzes[attempt.quizId];
              const percentage = Math.round((attempt.score / attempt.total) * 100);
              
              return (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  key={attempt.id} 
                  className="p-5 bg-amber-50/30"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <CloudOff size={14} className="text-amber-600" />
                      <span className="font-bold text-slate-800 text-sm truncate max-w-[200px]">{quiz?.title || 'Unknown Quiz'}</span>
                    </div>
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[8px] font-black uppercase rounded">Offline</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-slate-500 font-bold">
                       {attempt.score} / {attempt.total}
                    </div>
                    <div className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-700">
                      {percentage}%
                    </div>
                    <div className="flex items-center gap-1 text-amber-600 text-[8px] font-black uppercase">
                       <RefreshCw size={10} className="animate-spin" />
                       Syncing
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {/* Synced Attempts */}
            {filteredAttempts.map((attempt) => {
              const quiz = quizzes[attempt.quizId];
              const percentage = Math.round((attempt.score / attempt.total) * 100);
              
              return (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  key={attempt.id} 
                  className="p-5 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                       <Trophy size={14} className="text-indigo-600" />
                       <span className="font-bold text-slate-800 text-sm truncate max-w-[180px]">{quiz?.title || 'Unknown Quiz'}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      percentage >= 80 ? 'bg-emerald-50 text-emerald-600' : 
                      percentage >= 50 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
                    }`}>
                      {percentage}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-500">
                    <div className="font-bold text-slate-700">
                       {attempt.score} / {attempt.total}
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar size={12} />
                      {(() => {
                        const d = getSafeDate(attempt.completedAt);
                        return d ? format(d, 'MMM d, yyyy') : 'No Date';
                      })()}
                    </div>
                    {profile?.role === 'teacher' && (
                      <div className="text-[10px] font-medium text-indigo-400">
                        {attempt.studentId.substring(0, 8)}...
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="p-6 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Assessment</th>
                {profile?.role === 'teacher' && <th className="p-6 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Student</th>}
                <th className="p-6 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-center">Score</th>
                <th className="p-6 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-center">Percentage</th>
                <th className="p-6 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Status / Date</th>
                <th className="p-6 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <AnimatePresence>
                {/* Pending Attempts First */}
                {filteredPending.map((attempt) => {
                  const quiz = quizzes[attempt.quizId];
                  const percentage = Math.round((attempt.score / attempt.total) * 100);
                  
                  return (
                    <motion.tr 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      key={attempt.id} 
                      className="bg-amber-50/30 hover:bg-amber-50 transition-colors group"
                    >
                      <td className="p-6">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
                            <CloudOff size={16} />
                          </div>
                          <div>
                            <span className="font-bold text-slate-800">{quiz?.title || 'Unknown Quiz'}</span>
                            <span className="ml-2 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[8px] font-black uppercase rounded">Offline</span>
                          </div>
                        </div>
                      </td>
                      {profile?.role === 'teacher' && (
                        <td className="p-6">
                          <span className="text-sm font-medium text-slate-600">You (Offline)</span>
                        </td>
                      )}
                      <td className="p-6 text-center font-bold text-slate-900">
                        {attempt.score} / {attempt.total}
                      </td>
                      <td className="p-6 text-center">
                        <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-700">
                          {percentage}%
                        </span>
                      </td>
                      <td className="p-6">
                        <div className="flex items-center gap-2 text-amber-600 text-xs font-bold uppercase tracking-wider">
                          <RefreshCw size={12} className="animate-spin" />
                          Pending Sync
                        </div>
                      </td>
                      <td className="p-6 text-right">
                        <button className="p-2 text-slate-300">
                          <ChevronRight size={20} />
                        </button>
                      </td>
                    </motion.tr>
                  );
                })}

                {/* Synced Attempts */}
                {filteredAttempts.map((attempt) => {
                  const quiz = quizzes[attempt.quizId];
                  const percentage = Math.round((attempt.score / attempt.total) * 100);
                  
                  return (
                    <motion.tr 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      key={attempt.id} 
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      <td className="p-6">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                            <Trophy size={16} />
                          </div>
                          <span className="font-bold text-slate-800">{quiz?.title || 'Unknown Quiz'}</span>
                        </div>
                      </td>
                      {profile?.role === 'teacher' && (
                        <td className="p-6">
                          <span className="text-sm font-medium text-slate-600">{attempt.studentId.substring(0, 8)}...</span>
                        </td>
                      )}
                      <td className="p-6 text-center font-bold text-slate-900">
                        {attempt.score} / {attempt.total}
                      </td>
                      <td className="p-6 text-center">
                        <span className={`px-3 py-1 rounded-full text-xs font-black ${
                          percentage >= 80 ? 'bg-emerald-50 text-emerald-600' : 
                          percentage >= 50 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
                        }`}>
                          {percentage}%
                        </span>
                      </td>
                      <td className="p-6">
                        <div className="flex items-center gap-2 text-slate-500 text-sm">
                          <Calendar size={14} />
                          {(() => {
                            const d = getSafeDate(attempt.completedAt);
                            return d ? format(d, 'MMM d, yyyy') : 'No Date';
                          })()}
                        </div>
                      </td>
                      <td className="p-6 text-right">
                        <button className="p-2 text-slate-300 group-hover:text-indigo-600 transition-colors">
                          <ChevronRight size={20} />
                        </button>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
          
          {filteredAttempts.length === 0 && filteredPending.length === 0 && (
            <div className="p-20 text-center flex flex-col items-center">
              <div className="bg-slate-50 p-6 rounded-full mb-4">
                <Trophy size={48} className="text-slate-200" />
              </div>
              <h4 className="text-xl font-bold text-slate-400">No attempts found</h4>
              <p className="text-slate-500 max-w-sm mt-2">When you complete quizzes, your scores and history will appear here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

