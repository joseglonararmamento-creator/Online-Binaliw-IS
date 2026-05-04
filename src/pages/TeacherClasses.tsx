import { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot, query, where, serverTimestamp, deleteDoc, doc, getDocs, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Class, UserProfile } from '../types';
import { 
  Plus, 
  Users, 
  Trash2, 
  Copy, 
  CheckCircle2, 
  Search,
  BookOpen,
  LayoutGrid,
  X,
  UserPlus,
  UserMinus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function TeacherClasses() {
  const { profile, isOnline } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [allStudents, setAllStudents] = useState<UserProfile[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassDescription, setNewClassDescription] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState('');

  const [activeTab, setActiveTab] = useState<'classes' | 'requests'>('classes');
  const [joinRequests, setJoinRequests] = useState<any[]>([]);

  useEffect(() => {
    if (!profile) return;

    // Teachers see their classes, students see all classes to join
    const q = profile.role === 'teacher' 
      ? query(collection(db, 'classes'), where('teacherId', '==', profile.uid))
      : query(collection(db, 'classes'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setClasses(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Class)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'classes snapshot'));

    if (profile.role === 'teacher') {
      const requestsQ = query(
        collection(db, 'notifications'),
        where('userId', '==', profile.uid),
        where('type', '==', 'class_join_request'),
        where('isRead', '==', false)
      );
      const unsubscribeRequests = onSnapshot(requestsQ, (snap) => {
        setJoinRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'join requests snapshot'));

      const studentsQuery = query(collection(db, 'users'), where('role', '==', 'student'));
      const unsubscribeStudents = onSnapshot(studentsQuery, (snapshot) => {
        setAllStudents(snapshot.docs.map(d => d.data() as UserProfile));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'students snapshot teacherclasses'));

      return () => {
        unsubscribe();
        unsubscribeRequests();
        unsubscribeStudents();
      };
    }

    return () => unsubscribe();
  }, [profile]);

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !newClassName.trim()) return;

    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    try {
      await addDoc(collection(db, 'classes'), {
        name: newClassName,
        description: newClassDescription,
        teacherId: profile.uid,
        inviteCode,
        createdAt: serverTimestamp()
      });
      setShowAddModal(false);
      setNewClassName('');
      setNewClassDescription('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'add class');
    }
  };

  const handleDeleteClass = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this class? All student links will be broken.')) return;
    try {
      await deleteDoc(doc(db, 'classes', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `classes/${id}`);
    }
  };

  const handleToggleMember = async (student: UserProfile, isAdding: boolean) => {
    if (!selectedClass || !isOnline) return;
    try {
      if (isAdding) {
        await updateDoc(doc(db, 'users', student.uid), {
          classIds: arrayUnion(selectedClass.id)
        });
      } else {
        await updateDoc(doc(db, 'users', student.uid), {
          classIds: arrayRemove(selectedClass.id)
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${student.uid} class join/leave`);
    }
  };

  const handleJoinRequest = async (cls: Class) => {
    if (!profile) return;
    try {
      await addDoc(collection(db, 'notifications'), {
        userId: cls.teacherId,
        type: 'class_join_request',
        authorId: profile.uid,
        authorName: profile.displayName,
        authorPhoto: profile.photoURL,
        classId: cls.id,
        className: cls.name,
        text: `${profile.displayName} wants to join your class: ${cls.name}`,
        isRead: false,
        createdAt: serverTimestamp()
      });
      alert('Join request sent to teacher!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'add class join request');
    }
  };

  const handleHandleRequest = async (notif: any, accept: boolean) => {
    try {
      if (accept) {
        await updateDoc(doc(db, 'users', notif.authorId), {
          classIds: arrayUnion(notif.classId)
        });
        // Notify student
        await addDoc(collection(db, 'notifications'), {
          userId: notif.authorId,
          type: 'class_accepted',
          authorId: profile?.uid,
          authorName: profile?.displayName,
          authorPhoto: profile?.photoURL,
          text: `Your request to join ${notif.className} has been accepted!`,
          isRead: false,
          createdAt: serverTimestamp(),
          link: '/classes'
        });
      }
      await updateDoc(doc(db, 'notifications', notif.id), { isRead: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'handle join request');
    }
  };

  if (profile?.role === 'student') {
    return (
      <div className="space-y-6 pb-12">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Browse Classes</h2>
          <p className="text-slate-500 font-medium">Find learning spaces and request to join.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {classes.map(cls => {
            const isMember = profile.classIds?.includes(cls.id);
            return (
              <motion.div
                key={cls.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col hover:shadow-md transition-all group"
              >
                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-4">
                  <LayoutGrid size={24} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-1">{cls.name}</h3>
                <p className="text-sm text-slate-500 mb-6 flex-1 line-clamp-2">{cls.description}</p>
                
                {isMember ? (
                  <div className="w-full py-3 bg-emerald-50 text-emerald-600 rounded-xl font-black text-[10px] uppercase tracking-[0.15em] flex items-center justify-center gap-2 border border-emerald-100">
                    <CheckCircle2 size={16} /> Member
                  </div>
                ) : (
                  <button 
                    onClick={() => handleJoinRequest(cls)}
                    className="w-full py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.15em] shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
                  >
                    Request to Join
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  }

  const getStudentCount = (classId: string) => {
    return allStudents.filter(s => s.classIds?.includes(classId)).length;
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex gap-4">
          <button 
            onClick={() => setActiveTab('classes')}
            className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'classes' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
          >
            My Classes
          </button>
          <button 
            onClick={() => setActiveTab('requests')}
            className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all relative ${activeTab === 'requests' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Join Requests
            {joinRequests.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center border-2 border-white">
                {joinRequests.length}
              </span>
            )}
          </button>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all"
        >
          <Plus size={20} />
          Create New Class
        </button>
      </div>

      {activeTab === 'classes' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {classes.map((cls) => {
              const count = getStudentCount(cls.id);
              return (
                <motion.div
                  key={cls.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm hover:shadow-md transition-shadow group flex flex-col"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                      <LayoutGrid size={24} />
                    </div>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => { setSelectedClass(cls); setShowMembersModal(true); }}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                        title="Manage Students"
                      >
                        <Users size={18} />
                      </button>
                      <button 
                        onClick={() => handleDeleteClass(cls.id)}
                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-slate-900 mb-1">{cls.name}</h3>
                  <p className="text-sm text-slate-500 line-clamp-2 mb-6 flex-1">{cls.description || 'No description provided.'}</p>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-400 px-1 pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <Users size={14} />
                        <span>{count} Students</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <BookOpen size={14} />
                        <span>0 Lessons</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {classes.length === 0 && (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 rounded-[40px] border-2 border-dashed border-slate-200">
              <LayoutGrid size={48} className="mb-4 opacity-20" />
              <p className="font-bold">No classes created yet</p>
              <p className="text-sm">Click the button above to start your first class</p>
            </div>
          )}
        </div>
      ) : (
        <div className="max-w-2xl space-y-4">
          <AnimatePresence>
            {joinRequests.map((req) => (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <img src={req.authorPhoto || 'https://via.placeholder.com/48'} className="w-12 h-12 rounded-2xl object-cover border border-slate-100 shadow-sm" alt="" />
                  <div>
                    <h4 className="font-black text-slate-900">{req.authorName}</h4>
                    <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Wants to join {req.className}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleHandleRequest(req, false)}
                    className="px-4 py-2 bg-slate-50 text-slate-400 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-slate-100"
                  >
                    Decline
                  </button>
                  <button 
                    onClick={() => handleHandleRequest(req, true)}
                    className="px-6 py-2 bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-100"
                  >
                    Accept
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {joinRequests.length === 0 && (
            <div className="py-20 text-center text-slate-400 italic text-sm">
              No pending join requests.
            </div>
          )}
        </div>
      )}

      {/* Class Create Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' }}
              onClick={() => setShowAddModal(false)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white rounded-[40px] p-8 md:p-10 w-full max-w-lg shadow-2xl overflow-hidden"
            >
              <h2 className="text-3xl font-black text-slate-900 mb-2">New Learning Space</h2>
              <p className="text-slate-500 mb-8">Define your classroom and invite students.</p>

              <form onSubmit={handleCreateClass} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 ml-1">Class Name</label>
                  <input 
                    type="text" 
                    required
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    placeholder="e.g. Advanced Mathematics"
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-100 outline-none transition-all font-bold text-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 ml-1">Description</label>
                  <textarea 
                    rows={3}
                    value={newClassDescription}
                    onChange={(e) => setNewClassDescription(e.target.value)}
                    placeholder="What will students learn here?"
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-100 outline-none transition-all font-medium text-slate-600 resize-none"
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 py-4 text-slate-500 font-black text-sm uppercase tracking-widest hover:bg-slate-50 rounded-2xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-indigo-600 text-white font-black text-sm uppercase tracking-widest rounded-2xl hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all"
                  >
                    Launch Class
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Members Management Modal */}
      <AnimatePresence>
        {showMembersModal && selectedClass && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <motion.div 
               style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' }}
               onClick={() => setShowMembersModal(false)}
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="relative bg-white h-full max-h-[90vh] md:w-full md:max-w-2xl shadow-2xl rounded-3xl overflow-hidden flex flex-col"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-black text-slate-900">{selectedClass.name}</h3>
                  <p className="text-sm text-slate-500 font-medium">Manage members and link students</p>
                </div>
                <button 
                  onClick={() => setShowMembersModal(false)}
                  className="p-3 bg-slate-50 text-slate-400 hover:text-slate-900 rounded-2xl transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 bg-slate-50">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    value={studentSearch}
                    onChange={e => setStudentSearch(e.target.value)}
                    placeholder="Search students by name..."
                    className="w-full pl-12 pr-6 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-100 outline-none transition-all font-bold text-slate-700 text-sm shadow-sm"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {allStudents
                  .filter(s => s.displayName?.toLowerCase().includes(studentSearch.toLowerCase()))
                  .map(student => {
                    const isMember = student.classIds?.includes(selectedClass.id);
                    return (
                      <div key={student.uid} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:border-indigo-100 hover:shadow-sm transition-all group">
                        <div className="flex items-center gap-4">
                          <img 
                            src={student.photoURL || `https://ui-avatars.com/api/?name=${student.displayName}`} 
                            className="w-10 h-10 rounded-xl shadow-sm"
                            alt=""
                          />
                          <div>
                            <p className="font-bold text-slate-900">{student.displayName}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{student.email}</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => handleToggleMember(student, !isMember)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
                            isMember 
                            ? 'bg-red-50 text-red-500 hover:bg-red-100' 
                            : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-100'
                          }`}
                        >
                          {isMember ? (
                            <><UserMinus size={14} /> Remove</>
                          ) : (
                            <><UserPlus size={14} /> Tag to Class</>
                          )}
                        </button>
                      </div>
                    );
                  })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
