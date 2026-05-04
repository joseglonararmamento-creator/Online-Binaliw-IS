import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Quiz } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import localforage from 'localforage';
import { 
  Trophy, 
  ChevronRight, 
  Timer,
  HelpCircle,
  ArrowRight,
  CloudOff,
  Wifi,
  WifiOff,
  CloudLightning,
  RefreshCw
} from 'lucide-react';

// Configure stores
const quizStore = localforage.createInstance({
  name: "EduConnect",
  storeName: "quizzes"
});

const pendingAttemptsStore = localforage.createInstance({
  name: "EduConnect",
  storeName: "pending_quiz_attempts"
});

export default function QuizPage() {
  const { quizId } = useParams();
  const { profile, isOnline } = useAuth();
  const navigate = useNavigate();
  
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const fetchQuiz = async () => {
      if (!quizId) return;

      try {
        if (isOnline) {
          const docRef = doc(db, 'quizzes', quizId);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const quizData = { id: snap.id, ...snap.data() } as Quiz;
            setQuiz(quizData);
            // Cache for offline
            await quizStore.setItem(quizId, quizData);
          }
        } else {
          // Try local cache
          const cachedQuiz = await quizStore.getItem<Quiz>(quizId);
          if (cachedQuiz) {
            setQuiz(cachedQuiz);
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `quizzes/${quizId}`);
      } finally {
        setLoading(false);
      }
    };
    fetchQuiz();
  }, [quizId, isOnline]);

  // Sync effect when back online
  useEffect(() => {
    if (isOnline && profile) {
      syncPendingAttempts();
    }
  }, [isOnline, profile]);

  const syncPendingAttempts = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const keys = await pendingAttemptsStore.keys();
      for (const key of keys) {
        const attempt = await pendingAttemptsStore.getItem<any>(key);
        if (attempt) {
          await addDoc(collection(db, 'quizAttempts'), {
            ...attempt,
            completedAt: serverTimestamp(), // Refresh timestamp to sync time
            syncedAt: serverTimestamp()
          });
          await pendingAttemptsStore.removeItem(key);
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'sync pending quiz attempts');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleNext = async () => {
    if (selectedOption === null || !quiz) return;

    let finalScore = score;
    if (selectedOption === quiz.questions[currentQuestion].correctAnswer) {
      finalScore += 1;
      setScore(finalScore);
    }

    if (currentQuestion + 1 < quiz.questions.length) {
      setCurrentQuestion(q => q + 1);
      setSelectedOption(null);
    } else {
      setIsFinished(true);
      await saveAttempt(finalScore);
    }
  };

  const saveAttempt = async (finalScore: number) => {
    if (!quiz || !profile) return;

    const attemptData = {
      quizId: quiz.id,
      studentId: profile.uid,
      score: finalScore,
      total: quiz.questions.length,
      offline: !isOnline
    };

    try {
      if (isOnline) {
        await addDoc(collection(db, 'quizAttempts'), {
          ...attemptData,
          completedAt: serverTimestamp(),
        });
      } else {
        // Save to pending
        const attemptId = `pending_${Date.now()}`;
        await pendingAttemptsStore.setItem(attemptId, attemptData);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `quizAttempts for quiz ${quiz.id}`);
      // Fallback to local if primary save fails
      const attemptId = `pending_fb_${Date.now()}`;
      await pendingAttemptsStore.setItem(attemptId, attemptData);
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <div className="animate-spin w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full" />
      <p className="text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse">Initializing Quiz Engine...</p>
    </div>
  );

  if (!quiz) return (
    <div className="text-center py-20 px-8 bg-white rounded-3xl border border-dashed border-slate-200 glass-morphism">
      <HelpCircle size={48} className="mx-auto mb-4 text-slate-300" />
      <h3 className="text-2xl font-bold text-slate-900 mb-2">Quiz unavailable</h3>
      <p className="text-slate-500 mb-6 max-w-sm mx-auto">
        {isOnline 
          ? "This assessment might have been removed." 
          : "This quiz isn't cached for offline use. Connect to the internet to download it."}
      </p>
      <button onClick={() => navigate('/lessons')} className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all">
        Back to Lessons
      </button>
    </div>
  );

  if (isFinished) {
    const percentage = Math.round((score / quiz.questions.length) * 100);
    return (
      <div className="max-w-2xl mx-auto py-12">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-12 text-center shadow-xl border border-slate-100 relative overflow-hidden"
        >
          {/* Confetti-like background accent */}
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-amber-400 via-indigo-600 to-emerald-500" />
          
          <div className="inline-flex p-6 bg-amber-50 rounded-full mb-8 relative">
            <Trophy size={80} className="text-amber-500" />
            {!isOnline && (
              <div className="absolute -bottom-2 -right-2 p-2 bg-slate-100 text-slate-500 rounded-lg border-2 border-white shadow-sm" title="Stored Offline">
                <CloudOff size={16} />
              </div>
            )}
          </div>
          <h2 className="text-4xl font-black text-slate-900 mb-2 tracking-tight">Assessment Complete!</h2>
          <p className="text-slate-500 mb-8 font-medium">
            {!isOnline 
              ? "Result saved locally. It will sync automatically once you're back online." 
              : "Your performance has been recorded successfully."}
          </p>
          
          <div className="grid grid-cols-2 gap-6 mb-12">
            <div className="p-8 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Correct Hits</p>
              <h4 className="text-4xl font-black text-indigo-600">{score}/{quiz.questions.length}</h4>
            </div>
            <div className="p-8 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Proficiency</p>
              <h4 className="text-4xl font-black text-emerald-500">{percentage}%</h4>
            </div>
          </div>

          {!isOnline && (
            <div className="mb-8 p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-center gap-3 text-left">
              <CloudLightning className="text-amber-600 shrink-0" size={20} />
              <p className="text-xs text-amber-800 leading-normal">
                <strong>Offline Notice:</strong> Since you are disconnected, your results are securely stored on this device. Just open EduConnect when you have internet to sync.
              </p>
            </div>
          )}

          <div className="flex gap-4">
            <button 
              onClick={() => navigate('/lessons')}
              className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all hover:-translate-y-1"
            >
              Return to Course
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const progress = ((currentQuestion + 1) / quiz.questions.length) * 100;
  const question = quiz.questions[currentQuestion];

  return (
    <div className="max-w-3xl mx-auto py-4 md:py-8">
      <div className="mb-6 md:mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 overflow-hidden">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] md:text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] block">Self-Assessment</span>
            {isOnline ? (
              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-600 text-[8px] font-black uppercase tracking-widest rounded shrink-0">
                <Wifi size={8} /> Live
              </span>
            ) : (
              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[8px] font-black uppercase tracking-widest rounded shrink-0">
                <WifiOff size={8} /> Cache
              </span>
            )}
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight leading-tight">{quiz.title}</h2>
        </div>
        <div className="flex flex-col items-start sm:items-end gap-1 shrink-0">
          <div className="flex items-center gap-2 text-slate-400 font-bold">
            <Timer size={18} />
            <span className="text-sm tabular-nums">Question {currentQuestion + 1}/{quiz.questions.length}</span>
          </div>
          {isSyncing && (
            <div className="flex items-center gap-1 text-indigo-500 text-[9px] font-bold uppercase tracking-tighter">
              <RefreshCw size={10} className="animate-spin" />
              Syncing results...
            </div>
          )}
        </div>
      </div>

      <div className="h-2 md:h-3 w-full bg-slate-100 rounded-full mb-8 md:mb-12 overflow-hidden shadow-inner">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          className="h-full bg-indigo-600 rounded-full"
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div 
          key={currentQuestion}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="bg-white rounded-3xl p-6 md:p-10 border border-slate-100 shadow-xl shadow-slate-100/50"
        >
          <h3 className="text-xl md:text-2xl font-bold text-slate-800 mb-8 md:mb-10 leading-relaxed font-sans">
            {question.question}
          </h3>

          <div className="space-y-4">
            {question.options.map((option, i) => (
              <button 
                key={i}
                onClick={() => setSelectedOption(i)}
                className={`w-full text-left p-4 md:p-6 rounded-2xl border-2 transition-all flex items-center justify-between group ${
                  selectedOption === i 
                  ? 'bg-indigo-50 border-indigo-600 ring-4 ring-indigo-50 shadow-sm' 
                  : 'bg-white border-slate-100 hover:border-indigo-200 text-slate-600 hover:bg-slate-50/50'
                }`}
              >
                <span className={`font-bold transition-colors text-sm md:text-base ${selectedOption === i ? 'text-indigo-900' : 'text-slate-700'}`}>
                  {option}
                </span>
                <div className={`w-5 h-5 md:w-6 md:h-6 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ml-2 ${
                  selectedOption === i ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200'
                }`}>
                  {selectedOption === i && <ArrowRight size={14} />}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-8 md:mt-12 pt-6 md:pt-8 border-t border-slate-50 flex flex-col sm:flex-row gap-4 justify-between items-center">
            <div className="text-[10px] md:text-xs text-slate-400 font-medium text-center sm:text-left">
              Submit your answer to proceed to the next query.
            </div>
            <button 
              disabled={selectedOption === null}
              onClick={handleNext}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 text-white px-8 py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50 disabled:grayscale transition-all active:scale-95"
            >
              {currentQuestion + 1 === quiz.questions.length ? 'Finalize' : 'Confirm & Next'}
              <ChevronRight size={18} />
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

