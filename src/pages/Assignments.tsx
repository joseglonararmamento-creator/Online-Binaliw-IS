import { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, setDoc, doc, Timestamp, where, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Assignment, Submission } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ClipboardList, 
  Clock, 
  Send, 
  CheckCircle, 
  Plus, 
  GraduationCap,
  FileUp,
  Trash2,
  Search,
  ChevronLeft,
  X
} from 'lucide-react';
import { format } from 'date-fns';
import { getSafeDate } from '../lib/dateUtils';

export default function Assignments() {
  const { profile } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [search, setSearch] = useState('');
  
  // Submission Form
  const [submissionText, setSubmissionText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'uploading' | 'weak-signal' | 'paused'>('uploading');

  // New Assignment Form
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDeadline, setNewDeadline] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'assignments'), orderBy('deadline', 'asc'));
    const unsubscribeA = onSnapshot(q, (snapshot) => {
      setAssignments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Assignment)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'assignments list'));

    const subQ = profile?.role === 'teacher' 
      ? query(collection(db, 'submissions'), orderBy('submittedAt', 'desc'))
      : query(collection(db, 'submissions'), where('studentId', '==', profile?.uid || ''));
    
    const unsubscribeS = onSnapshot(subQ, (snapshot) => {
      setSubmissions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Submission)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'submissions list'));

    return () => { unsubscribeA(); unsubscribeS(); };
  }, [profile]);

  const handleAddAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'assignments'), {
        title: newTitle,
        description: newDesc,
        deadline: Timestamp.fromDate(new Date(newDeadline)),
        teacherId: profile?.uid,
        lessonId: 'general', // Simplified
        createdAt: serverTimestamp(),
      });
      setShowAddModal(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'add assignment');
    }
  };

  const handleSubmitWork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssignment || !profile) return;
    setIsSubmitting(true);
    setUploadProgress(0);

    try {
      let fileUrl = '';
      let fileName = '';

      if (selectedFile) {
        if (!storage) {
          throw new Error('Firebase Storage is not enabled or provisioned. Please contact your administrator.');
        }
        
        const { uploadWithProgress } = await import('../services/storageService');
        fileUrl = await uploadWithProgress(selectedFile, `submissions/${selectedAssignment.id}/${profile.uid}`, (progress, status) => {
          setUploadProgress(progress);
          if (status) setUploadStatus(status);
        });
        fileName = selectedFile.name;
      }

      await addDoc(collection(db, 'submissions'), {
        assignmentId: selectedAssignment.id,
        studentId: profile.uid,
        content: submissionText,
        fileUrl,
        fileName,
        status: 'submitted',
        submittedAt: serverTimestamp(),
      });
      setSubmissionText('');
      setSelectedFile(null);
      setUploadProgress(0);
      alert("Submission successful!");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `submission for assignment ${selectedAssignment.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGrade = async (subId: string, grade: number, feedback: string) => {
    try {
      await setDoc(doc(db, 'submissions', subId), {
        grade,
        feedback,
        status: 'graded'
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `submissions/${subId} grade`);
    }
  };

  const handleDeleteAssignment = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this assignment?')) {
      try {
        await deleteDoc(doc(db, 'assignments', id));
        if (selectedAssignment?.id === id) setSelectedAssignment(null);
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `assignments/${id}`);
      }
    }
  };

  const filteredAssignments = assignments.filter(a => 
    a.title.toLowerCase().includes(search.toLowerCase()) ||
    a.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Assignments</h2>
          <p className="text-sm text-slate-500">Track deadlines, submit work, and view grades.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search assignments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-64 shadow-sm"
            />
          </div>
          {profile?.role === 'teacher' && (
            <button 
              onClick={() => setShowAddModal(true)}
              className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all whitespace-nowrap"
            >
              <Plus size={20} />
              Post Assignment
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative">
        {/* Assignment List */}
        <div className={`${selectedAssignment ? 'hidden lg:block' : 'block'} lg:col-span-1 space-y-4`}>
          {filteredAssignments.map(assignment => {
            const mySubmission = submissions.find(s => s.assignmentId === assignment.id && s.studentId === profile?.uid);
            return (
              <motion.div 
                layout
                key={assignment.id}
                onClick={() => setSelectedAssignment(assignment)}
                className={`p-5 rounded-2xl border cursor-pointer transition-all group ${
                  selectedAssignment?.id === assignment.id 
                  ? 'border-indigo-600 ring-2 ring-indigo-50 shadow-lg' 
                  : 'bg-white border-slate-100 hover:border-slate-300 shadow-sm'
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <h4 className="font-bold text-slate-900 truncate pr-2">{assignment.title}</h4>
                  <div className="flex items-center gap-2">
                    {mySubmission && (
                      <div className="text-emerald-500 bg-emerald-50 p-1 rounded-full">
                        <CheckCircle size={16} />
                      </div>
                    )}
                    {profile?.role === 'teacher' && (
                      <button 
                        onClick={(e) => handleDeleteAssignment(assignment.id, e)}
                        className="p-1 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] sm:text-xs text-slate-500 uppercase font-black tracking-widest">
                  <Clock size={14} className="text-red-400" />
                  <span>Due {(() => {
                    const d = getSafeDate(assignment.deadline);
                    return d ? format(d, 'MMM d, h:mm a') : 'TBA';
                  })()}</span>
                </div>
                {mySubmission?.status === 'graded' && (
                  <div className="mt-3 px-3 py-1 bg-indigo-50 text-indigo-600 text-[10px] uppercase font-black rounded-lg inline-block">
                    Grade: {mySubmission.grade}/100
                  </div>
                )}
              </motion.div>
            );
          })}
          {filteredAssignments.length === 0 && (
            <div className="py-12 text-center text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
              No assignments found.
            </div>
          )}
        </div>

        {/* Detailed View / Action Area */}
        <div className={`${selectedAssignment ? 'block' : 'hidden lg:block'} lg:col-span-2`}>
          {selectedAssignment ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-3xl border border-slate-100 p-6 md:p-8 shadow-sm h-full"
            >
              <button 
                onClick={() => setSelectedAssignment(null)}
                className="lg:hidden flex items-center gap-1 text-indigo-600 font-bold text-sm mb-6 -ml-2"
              >
                <ChevronLeft size={20} /> Back to List
              </button>

              <h3 className="text-2xl md:text-3xl font-black text-slate-900 mb-2">{selectedAssignment.title}</h3>
              <p className="text-slate-600 mb-8 leading-relaxed whitespace-pre-wrap text-sm md:text-base">{selectedAssignment.description}</p>
              
              <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-4 mb-8">
                <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center text-red-500 shrink-0">
                  <Clock size={20} />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-0.5">Deadline</p>
                  <p className="text-slate-900 font-bold text-sm sm:text-base">
                    {(() => {
                      const d = getSafeDate(selectedAssignment.deadline);
                      return d ? format(d, 'PPPP p') : 'TBA';
                    })()}
                  </p>
                </div>
              </div>

              {profile?.role === 'student' ? (
                <div className="space-y-6">
                  <div className="h-px bg-slate-100" />
                  <h4 className="font-bold text-slate-900 flex items-center gap-2">
                    <FileUp size={20} className="text-indigo-600" />
                    Your Submission
                  </h4>
                  {submissions.find(s => s.assignmentId === selectedAssignment.id && s.studentId === profile.uid) ? (
                    <div className="p-6 border border-emerald-100 bg-emerald-50/30 rounded-2xl">
                      <p className="text-emerald-700 font-medium mb-2 flex items-center gap-2">
                        <CheckCircle size={18} />
                        You have already submitted this assignment.
                      </p>
                      <p className="text-slate-500 text-sm">Waiting for teacher grading...</p>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmitWork} className="space-y-4">
                      <textarea 
                        required
                        placeholder="Type your response or paste links to your projects here..."
                        value={submissionText}
                        onChange={e => setSubmissionText(e.target.value)}
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none min-h-[150px]"
                      />
                      
                      <div className="p-6 border-2 border-dashed border-slate-200 rounded-2xl hover:border-indigo-300 transition-colors bg-slate-50/50">
                        <input 
                          type="file" 
                          id="file-upload"
                          className="hidden" 
                          onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                        />
                        <label 
                          htmlFor="file-upload"
                          className="flex flex-col items-center justify-center cursor-pointer gap-2"
                        >
                          <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center text-slate-400">
                            <Plus size={24} />
                          </div>
                          <span className="text-sm font-bold text-slate-600">
                            {selectedFile ? selectedFile.name : 'Attach a file (Optional)'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                            PDF, DOCX, ZIP, JPG, PNG
                          </span>
                        </label>
                        {selectedFile && (
                          <button 
                            type="button"
                            onClick={() => setSelectedFile(null)}
                            className="mt-2 text-xs text-red-500 font-bold uppercase tracking-widest hover:underline block mx-auto"
                          >
                            Remove File
                          </button>
                        )}
                      </div>

                      <button 
                        disabled={isSubmitting}
                        type="submit"
                        className="w-full flex flex-col items-center justify-center gap-2 bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
                      >
                        {isSubmitting ? (
                          <div className="space-y-2 w-full px-8">
                            <div className="flex justify-between items-center text-[10px] uppercase tracking-widest font-black">
                              <span className={uploadStatus === 'weak-signal' ? 'text-amber-300 animate-pulse' : 'text-white/80'}>
                                {uploadStatus === 'weak-signal' ? 'Weak Signal - Retrying...' : 'Uploading & Submitting...'}
                              </span>
                              <span>{Math.round(uploadProgress)}%</span>
                            </div>
                            <div className="h-1 w-full bg-white/20 rounded-full overflow-hidden">
                              <motion.div 
                                className={`h-full ${uploadStatus === 'weak-signal' ? 'bg-amber-400' : 'bg-white'}`}
                                animate={{ width: `${uploadProgress}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="flex items-center gap-2"><Send size={18} /> Submit Assignment</span>
                        )}
                      </button>
                    </form>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="h-px bg-slate-100" />
                  <h4 className="font-bold text-slate-900 flex items-center gap-2">
                    <GraduationCap size={20} className="text-indigo-600" />
                    Submissions for Grading
                  </h4>
                  <div className="space-y-4">
                    {submissions.filter(s => s.assignmentId === selectedAssignment.id).map(sub => (
                      <div key={sub.id} className="p-6 border border-slate-100 rounded-2xl">
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                              <ClipboardList size={20} />
                            </div>
                            <div>
                              <p className="font-bold text-slate-900">Student ID: {sub.studentId.substring(0, 8)}...</p>
                              <p className="text-xs text-slate-500">
                                {(() => {
                                  const d = getSafeDate(sub.submittedAt);
                                  return d ? format(d, 'Pp') : 'Now';
                                })()}
                              </p>
                            </div>
                          </div>
                          {sub.status === 'graded' ? (
                            <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs font-bold">Graded: {sub.grade}/100</span>
                          ) : (
                            <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-xs font-bold">Needs Review</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-600 bg-slate-50 p-4 rounded-xl mb-4 italic">"{sub.content}"</p>
                        
                        {sub.fileUrl && (
                          <div className="mb-4">
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Attached File</p>
                            <a 
                              href={sub.fileUrl} 
                              target="_blank" 
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 p-3 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors font-bold text-sm"
                            >
                              <FileUp size={16} />
                              {sub.fileName || 'View Attachment'}
                            </a>
                          </div>
                        )}

                        {sub.status !== 'graded' && (
                          <div className="flex gap-4">
                            <input 
                              type="number" 
                              placeholder="Grade (0-100)" 
                              className="w-24 px-3 py-2 border rounded-xl"
                              onChange={(e) => {
                                const g = parseInt(e.target.value);
                                if (g >= 0 && g <= 100) sub.grade = g;
                              }}
                            />
                            <button 
                              onClick={() => handleGrade(sub.id, sub.grade || 0, 'Great job!')}
                              className="flex-1 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors"
                            >
                              Submit Grade
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    {submissions.filter(s => s.assignmentId === selectedAssignment.id).length === 0 && (
                      <div className="py-8 text-center text-slate-400 italic">No submissions yet.</div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <div className="bg-white rounded-3xl border border-dashed border-slate-200 h-[400px] flex flex-col items-center justify-center text-slate-400">
              <ClipboardList size={48} className="mb-4 opacity-20" />
              <p>Select an assignment to view details or submissions</p>
            </div>
          )}
        </div>
      </div>

      {/* Post Assignment Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm shadow-indigo-200"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl w-full max-w-lg shadow-2xl flex flex-col my-auto"
            >
              <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-indigo-600 text-white shrink-0">
                <h3 className="text-lg font-black uppercase tracking-widest">New Assignment</h3>
                <button onClick={() => setShowAddModal(false)} className="p-1.5 hover:bg-indigo-500 rounded-lg transition-colors">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleAddAssignment} className="flex flex-col flex-1 overflow-hidden">
                <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-widest">Assignment Title</label>
                    <input 
                      type="text" 
                      required 
                      value={newTitle} 
                      onChange={e => setNewTitle(e.target.value)} 
                      placeholder="e.g. Final Design Project"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium" 
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-widest">Instructions</label>
                    <textarea 
                      rows={5} 
                      required 
                      value={newDesc} 
                      onChange={e => setNewDesc(e.target.value)} 
                      placeholder="Specify deliverables and requirements..."
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-xs leading-relaxed" 
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-widest">Submission Deadline</label>
                    <input 
                      type="datetime-local" 
                      required 
                      value={newDeadline} 
                      onChange={e => setNewDeadline(e.target.value)} 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm" 
                    />
                  </div>
                </div>

                <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3 shrink-0">
                  <button 
                    type="button" 
                    onClick={() => setShowAddModal(false)} 
                    className="flex-1 py-2.5 text-slate-500 text-[10px] font-black uppercase tracking-widest hover:text-slate-700"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="flex-[2] py-2.5 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all active:scale-95"
                  >
                    Post Assignment
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
