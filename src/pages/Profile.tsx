import { useState, useEffect, useRef } from 'react';
import { collection, query, where, getDocs, updateDoc, doc, addDoc, serverTimestamp, onSnapshot, limit, orderBy, arrayUnion, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Assignment, Submission, Class, Reminder, UserProfile as UserProfileType, Friendship } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import imageCompression from 'browser-image-compression';
import { 
  User, 
  Mail, 
  Hash, 
  Award, 
  CheckCircle2, 
  Clock, 
  BookOpen, 
  Camera,
  Save,
  ArrowRight,
  ClipboardList,
  Megaphone,
  Send,
  MessageSquare,
  MessageCircle,
  LayoutGrid,
  Bell,
  Users,
  ChevronLeft,
  UserPlus,
  Check
} from 'lucide-react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

export default function Profile() {
  const { profile: myProfile, isOnline, user: firebaseUser } = useAuth();
  

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const viewUserId = searchParams.get('userId');
  const [viewProfile, setViewProfile] = useState<UserProfileType | null>(null);
  const isOwnProfile = !viewUserId || viewUserId === myProfile?.uid;
  const profile = isOwnProfile ? myProfile : viewProfile;
  
  const [friendship, setFriendship] = useState<Friendship | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  
  // Teacher specific
  const [classes, setClasses] = useState<Class[]>([]);
  const [studentClasses, setStudentClasses] = useState<Class[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [newReminderText, setNewReminderText] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [reminderType, setReminderType] = useState<'status' | 'reminder'>('status');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'uploading' | 'weak-signal' | 'paused'>('uploading');

  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [newPhotoURL, setNewPhotoURL] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!myProfile || !viewUserId || isOwnProfile) return;
    const friendshipId = myProfile.uid < viewUserId ? `${myProfile.uid}_${viewUserId}` : `${viewUserId}_${myProfile.uid}`;
    const unsubscribe = onSnapshot(doc(db, 'friends', friendshipId), (doc) => {
      if (doc.exists()) {
        setFriendship({ id: doc.id, ...doc.data() } as Friendship);
      } else {
        setFriendship(null);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `friends/${friendshipId}`));
    return () => unsubscribe();
  }, [myProfile?.uid, viewUserId, isOwnProfile]);

  const handleAddFriend = async () => {
    if (!myProfile || !viewUserId || requesting) return;
    setRequesting(true);
    try {
      const friendshipId = myProfile.uid < viewUserId ? `${myProfile.uid}_${viewUserId}` : `${viewUserId}_${myProfile.uid}`;
      await setDoc(doc(db, 'friends', friendshipId), {
        user1: myProfile.uid,
        user2: viewUserId,
        status: 'pending',
        createdAt: serverTimestamp()
      }, { merge: true });

      // Notification
      await addDoc(collection(db, 'notifications'), {
        userId: viewUserId,
        type: 'friend_request',
        authorId: myProfile.uid,
        authorName: myProfile.displayName,
        authorPhoto: myProfile.photoURL,
        text: `${myProfile.displayName} wants to connect with you.`,
        isRead: false,
        createdAt: serverTimestamp(),
        link: `/profile?userId=${myProfile.uid}`
      });

      // No alert, rely on button state
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'add friend and notification');
      setRequesting(false);
    }
  };

  useEffect(() => {
    if (profile?.photoURL) setNewPhotoURL(profile.photoURL);
  }, [profile?.photoURL]);

  useEffect(() => {
    if (!viewUserId || viewUserId === myProfile?.uid) {
      setViewProfile(null);
      return;
    }
    
    // Real-time listener for the profile being viewed
    const unsubscribe = onSnapshot(doc(db, 'users', viewUserId), (docSnap) => {
      if (docSnap.exists()) {
        setViewProfile({ ...docSnap.data(), uid: docSnap.id } as UserProfileType);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `users/${viewUserId}`));
    
    return () => unsubscribe();
  }, [viewUserId, myProfile?.uid]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!profile) {
      alert('You must be logged in to upload a profile picture.');
      return;
    }
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }

    setUploading(true);
    try {
      const { uploadWithProgress } = await import('../services/storageService');
      const downloadURL = await uploadWithProgress(file, `profiles/${profile.uid}`, (progress, status) => {
        setUploadProgress(progress);
        if (status) setUploadStatus(status);
      });

      await updateDoc(doc(db, 'users', profile.uid), {
        photoURL: downloadURL
      });
      setNewPhotoURL(downloadURL);
      alert('Profile picture updated successfully!');
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid} photoURL`);
      alert(`Failed to upload image: ${err.message || 'Unknown error'}`);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleJoinClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !inviteCode.trim() || !isOnline) return;

    setUpdating(true);
    try {
      const q = query(collection(db, 'classes'), where('inviteCode', '==', inviteCode.trim().toUpperCase()));
      const snap = await getDocs(q);

      if (snap.empty) {
        alert('Invalid invite code. Please check and try again.');
        return;
      }

      const classId = snap.docs[0].id;

      await updateDoc(doc(db, 'users', profile.uid), {
        classIds: arrayUnion(classId)
      });

      alert(`Successfully joined the class!`);
      setInviteCode('');
      window.location.reload();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid} join class`);
      alert('Failed to join class.');
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    if (!profile) return;

    const fetchData = async () => {
      try {
        if (!profile) {
            setLoading(false);
            return;
        }

        if (profile.role === 'student') {
          const assignmentsSnap = await getDocs(collection(db, 'assignments'));
          const allAssignments = assignmentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment));
          setAssignments(allAssignments);

          const submissionsQuery = query(collection(db, 'submissions'), where('studentId', '==', profile.uid));
          const submissionsSnap = await getDocs(submissionsQuery);
          setSubmissions(submissionsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Submission)));

          if (profile.classIds && profile.classIds.length > 0) {
            try {
                const classesQuery = query(collection(db, 'classes'), where('__name__', 'in', profile.classIds));
                const cSnap = await getDocs(classesQuery);
                setStudentClasses(cSnap.docs.map(d => ({ id: d.id, ...d.data() } as Class)));
            } catch (err) {
                handleFirestoreError(err, OperationType.GET, `classes for student ${profile.uid}`);
            }
          }
        } else {
          // Teacher data
          const classesQuery = query(collection(db, 'classes'), where('teacherId', '==', profile.uid));
          const snap = await getDocs(classesQuery);
          const teacherClasses = snap.docs.map(d => ({ id: d.id, ...d.data() } as Class));
          setClasses(teacherClasses);
          if (teacherClasses.length > 0) setSelectedClassId(teacherClasses[0].id);

          try {
              const remindersQuery = query(
                collection(db, 'reminders'), 
                where('teacherId', '==', profile.uid),
                orderBy('createdAt', 'desc'),
                limit(10)
              );
              onSnapshot(remindersQuery, (snap) => {
                setReminders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Reminder)));
              }, (err) => {
                  handleFirestoreError(err, OperationType.LIST, 'reminders snapshot');
              });
          } catch (err) {
              handleFirestoreError(err, OperationType.GET, "setup reminders query");
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, "profile dashboard data fetch");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [profile]);

  const handlePostReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !newReminderText.trim() || !selectedClassId) return;

    try {
      const reminderData = {
        teacherId: profile.uid,
        classId: selectedClassId,
        text: newReminderText,
        type: reminderType,
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'reminders'), reminderData);

      // Notify students in that class
      const studentsQuery = query(collection(db, 'users'), where('classId', '==', selectedClassId));
      const studentsSnap = await getDocs(studentsQuery);
      
      const targetClass = classes.find(c => c.id === selectedClassId);
      
      const notificationPromises = studentsSnap.docs.map(async (studentDoc) => {
        await addDoc(collection(db, 'notifications'), {
          userId: studentDoc.id,
          title: reminderType === 'reminder' ? 'New Class Reminder' : 'Teacher Status Update',
          body: `${profile.displayName} posted in ${targetClass?.name || 'Class'}: ${newReminderText.substring(0, 50)}${newReminderText.length > 50 ? '...' : ''}`,
          read: false,
          createdAt: serverTimestamp()
        });
      });

      await Promise.all(notificationPromises);

      setNewReminderText('');
      alert('Post published and students notified!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'teacher post reminder/status');
      alert('Failed to post update.');
    }
  };

  const [editMode, setEditMode] = useState(false);
  const [editedProfile, setEditedProfile] = useState({
    displayName: profile?.displayName || '',
    subjectHandled: profile?.subjectHandled || '',
    yearsOfTeaching: profile?.yearsOfTeaching || '',
    gender: profile?.gender || '',
    bio: profile?.bio || ''
  });

  useEffect(() => {
    if (profile) {
      setEditedProfile({
        displayName: profile.displayName || '',
        subjectHandled: profile.subjectHandled || '',
        yearsOfTeaching: profile.yearsOfTeaching || '',
        gender: profile.gender || '',
        bio: profile.bio || ''
      });
    }
  }, [profile]);

  const handleUpdateProfile = async () => {
    if (!profile || !isOnline) {
      alert('Cannot update profile while offline or not logged in.');
      return;
    }
    
    setUpdating(true);
    try {
      // Ensure we're targeting the CURRENT user's UID
      const userRef = doc(db, 'users', profile.uid);
      
      console.log('Updating profile for UID:', profile.uid, 'with data:', editedProfile);
      
      await updateDoc(userRef, {
        displayName: editedProfile.displayName,
        subjectHandled: editedProfile.subjectHandled,
        yearsOfTeaching: editedProfile.yearsOfTeaching,
        gender: editedProfile.gender,
        bio: editedProfile.bio,
        updatedAt: serverTimestamp()
      });
      
      setEditMode(false);
      alert('Profile updated successfully!');
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid}`);
    } finally {
      setUpdating(false);
    }
  };

  const handleUpdatePhoto = async () => {
    if (!profile || !isOnline) return;
    setUpdating(true);
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        photoURL: newPhotoURL
      });
      alert('Profile picture updated successfully!');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid} photoURL manual`);
      alert('Failed to update profile picture.');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-[500px]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
    </div>
  );

  const handleRequestJoinClass = async (classId: string, className: string, teacherId: string) => {
    if (!myProfile || requesting) return;
    setRequesting(true);
    try {
      await addDoc(collection(db, 'notifications'), {
        userId: teacherId,
        type: 'class_join_request',
        authorId: myProfile.uid,
        authorName: myProfile.displayName,
        authorPhoto: myProfile.photoURL,
        classId: classId,
        className: className,
        text: `${myProfile.displayName} requested to join your class: ${className}`,
        isRead: false,
        createdAt: serverTimestamp(),
        link: `/profile?userId=${myProfile.uid}`
      });
      alert('Join request sent to teacher!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'teacher class join request from profile');
    } finally {
      setRequesting(false);
    }
  };

  const studentStats = profile?.role === 'student' ? {
    completedCount: submissions.filter(s => s.status === 'graded' || s.status === 'submitted').length,
    progress: assignments.length > 0 ? (submissions.filter(s => s.status === 'graded' || s.status === 'submitted').length / assignments.length) * 100 : 0
  } : null;

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-20 gpu-accel">
      {/* Profile Header (Facebook Style) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {/* Cover Photo */}
        <div className="h-40 bg-gradient-to-r from-indigo-500 to-purple-600 relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 flex flex-wrap gap-4 p-8 overflow-hidden pointer-events-none">
            {[...Array(10)].map((_, i) => (
              <BookOpen key={i} size={40} className="text-white" />
            ))}
          </div>
          {isOnline && (
            <button className="absolute bottom-2 right-2 p-2 bg-black/40 text-white rounded-lg hover:bg-black/60 transition-all">
              <Camera size={16} />
            </button>
          )}
        </div>

        {/* Profile Info Overlay Area */}
        <div className="px-4 pb-6 relative">
          <div className="flex flex-col items-center -mt-16 sm:flex-row sm:items-end sm:gap-6 sm:px-4">
            {!isOwnProfile && (
              <button 
                onClick={() => navigate(-1)}
                className="absolute top-4 left-4 p-2 bg-white/20 hover:bg-white/40 text-white rounded-full transition-all"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            <div className="relative group shrink-0">
               <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
                accept="image/*"
              />
              <div className="w-32 h-32 p-1.5 bg-white rounded-full shadow-lg relative">
                <img 
                  src={profile?.photoURL || 'https://via.placeholder.com/150'} 
                  className={`w-full h-full rounded-full object-cover transition-all duration-500 ${uploading ? 'scale-90 opacity-40 blur-[2px]' : 'group-hover:opacity-90'}`}
                  alt="Profile"
                />
                {!uploading && (
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded-full"
                  >
                    <Camera size={24} className="text-white" />
                  </button>
                )}
                {uploading && (
                  <div className="absolute inset-0 bg-white/60 rounded-full flex flex-col items-center justify-center p-2 text-center">
                    <span className={`text-[8px] font-black uppercase mb-1 ${uploadStatus === 'weak-signal' ? 'text-amber-500 animate-pulse' : 'text-indigo-600'}`}>
                      {uploadStatus === 'weak-signal' ? 'Weak signal' : 'Uploading'}
                    </span>
                    <span className="text-sm font-black text-indigo-600">{Math.round(uploadProgress)}%</span>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 sm:mt-0 text-center sm:text-left flex-1 pb-2">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">{profile?.displayName}</h2>
              <p className="text-sm text-slate-500 font-medium">{profile?.role} • Student ID: {profile?.uid?.slice(0, 8)}</p>
            </div>

            <div className="mt-4 sm:mt-0 flex gap-2 pb-2">
              {isOwnProfile ? (
                <button 
                  onClick={() => setEditMode(!editMode)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold text-xs shadow-md shadow-indigo-100"
                >
                  {editMode ? 'Cancel Edit' : 'Edit Profile'}
                </button>
              ) : (
                <>
                  {friendship ? (
                    <div className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 ${friendship.status === 'accepted' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-50 text-slate-500 border border-slate-100'}`}>
                      {friendship.status === 'accepted' ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                      {friendship.status === 'accepted' ? 'Friends' : (requesting || friendship.status === 'pending' ? 'Request Sent' : 'Pending Request')}
                    </div>
                  ) : (
                    <button 
                      onClick={handleAddFriend}
                      disabled={requesting}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold text-xs shadow-md shadow-indigo-100 flex items-center gap-2 hover:bg-indigo-700 disabled:bg-slate-400 disabled:shadow-none active:scale-95 transition-all"
                    >
                      <UserPlus size={14} /> {requesting ? 'Request Sent' : 'Add Friend'}
                    </button>
                  )}
                  <button 
                    onClick={() => navigate(`/chat?userId=${profile?.uid}`)}
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg font-bold text-xs shadow-sm hover:bg-slate-50 flex items-center gap-2"
                  >
                    <MessageCircle size={14} /> Message
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-100 space-y-4">
            {editMode ? (
              <div className="space-y-4 px-2">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1 block">Display Name</label>
                  <input 
                    type="text"
                    value={editedProfile.displayName}
                    onChange={e => setEditedProfile({...editedProfile, displayName: e.target.value})}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-600/20"
                  />
                </div>
                {profile?.role === 'teacher' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1 block">Subject</label>
                      <input 
                        type="text"
                        value={editedProfile.subjectHandled}
                        onChange={e => setEditedProfile({...editedProfile, subjectHandled: e.target.value})}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                        placeholder="e.g. Physics"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1 block">Years</label>
                      <input 
                        type="number"
                        value={editedProfile.yearsOfTeaching}
                        onChange={e => setEditedProfile({...editedProfile, yearsOfTeaching: e.target.value})}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                        placeholder="5"
                      />
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1 block">Gender</label>
                  <select 
                    value={editedProfile.gender}
                    onChange={e => setEditedProfile({...editedProfile, gender: e.target.value})}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  >
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1 block">Bio / Summary</label>
                  <textarea 
                    value={editedProfile.bio}
                    onChange={e => setEditedProfile({...editedProfile, bio: e.target.value})}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm h-24"
                  />
                </div>
                <button 
                  onClick={handleUpdateProfile}
                  disabled={updating}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-100"
                >
                  {updating ? 'Saving...' : 'Save Profile Changes'}
                </button>
              </div>
            ) : (
              <div className="space-y-4 px-2">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-900">Bio</h3>
                  <p className="text-sm text-slate-600 leading-relaxed italic">
                    "{profile?.bio || (profile?.role === 'teacher' 
                      ? 'Dedicated educator shaping the future of BISonline. Feel free to reach out for support.' 
                      : 'Student at BISonline passionate about learning and professional development.')}"
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {profile?.role === 'teacher' && (
                    <>
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Subject</p>
                        <p className="text-sm font-bold text-slate-800">{profile.subjectHandled || 'Not set'}</p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Experience</p>
                        <p className="text-sm font-bold text-slate-800">{profile.yearsOfTeaching || '0'} Years</p>
                      </div>
                    </>
                  )}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Gender</p>
                    <p className="text-sm font-bold text-slate-800">{profile?.gender || 'Not specified'}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 pt-2">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Mail size={16} />
                    <span className="text-sm truncate max-w-[200px]">{profile?.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500">
                    <Users size={16} />
                    <span className="text-sm">Community Member</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Profile Sidebar/Widgets Area */}
      <div className="space-y-4">
        {/* Statistics or Actions */}
        {profile?.role === 'student' && studentStats && (
          <section className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4">Academic Tracker</h3>
              <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-2 text-slate-500">
                      <span>Course Progression</span>
                      <span>{Math.round(studentStats.progress)}%</span>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${studentStats.progress}%` }}
                        className="h-full bg-indigo-600 rounded-full"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="bg-indigo-50/50 p-3 rounded-lg border border-indigo-100/50">
                      <p className="text-[9px] uppercase font-black text-indigo-400 mb-0.5">Finished</p>
                      <p className="text-xl font-black text-indigo-700">{studentStats.completedCount}</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <p className="text-[9px] uppercase font-black text-slate-400 mb-0.5">Assigned</p>
                      <p className="text-xl font-black text-slate-700">{assignments.length}</p>
                    </div>
                  </div>
              </div>
          </section>
        )}

        {/* Joined Classes */}
        <section className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4">Classes</h3>
          <div className="space-y-3">
             {profile?.role === 'student' ? (
                studentClasses.map(c => (
                  <div key={c.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center">
                      <BookOpen size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{c.name}</h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Section {c.inviteCode}</p>
                    </div>
                  </div>
                ))
             ) : (
                classes.map(c => (
                  <div key={c.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center">
                        <Users size={20} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">{c.name}</h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{c.inviteCode} • Master</p>
                      </div>
                    </div>
                    {profile.role === 'teacher' && myProfile?.role === 'student' && !myProfile.classIds?.includes(c.id) && (
                      <button 
                        onClick={() => handleRequestJoinClass(c.id, c.name, profile.uid)}
                        className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-sm"
                      >
                        Request Join
                      </button>
                    )}
                    {myProfile?.classIds?.includes(c.id) && (
                      <div className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg font-black text-[9px] uppercase tracking-widest border border-emerald-100 flex items-center gap-1">
                        <Check size={10} /> Joined
                      </div>
                    )}
                  </div>
                ))
             )}
             {(profile?.role === 'student' ? studentClasses.length : classes.length) === 0 && (
                <p className="text-xs text-slate-400 italic py-2">No active classes joined.</p>
             )}
          </div>
        </section>

        {/* Settings Area (Dark Card) - Only for own profile */}
        {isOwnProfile && (
          <section className="bg-slate-900 p-6 rounded-xl text-white shadow-xl">
               <div className="flex items-center gap-3 mb-4">
                  <Camera size={20} className="text-indigo-400" />
                  <h3 className="text-sm font-bold">Photo Settings</h3>
               </div>
               <div className="space-y-4">
                  <div className="flex gap-2">
                      <input 
                          type="text" 
                          value={newPhotoURL}
                          onChange={e => setNewPhotoURL(e.target.value)}
                          placeholder="Avatar URL"
                          className="bg-white/10 border-white/20 text-white rounded-lg px-4 py-2 text-xs flex-1 outline-none"
                      />
                      <button 
                          onClick={handleUpdatePhoto}
                          disabled={updating || !isOnline}
                          className="bg-indigo-600 hover:bg-indigo-700 px-3 py-2 rounded-lg transition-all disabled:opacity-50"
                      >
                          <Save size={16} />
                      </button>
                  </div>
                  {!isOnline && <p className="text-[9px] text-amber-500 font-black uppercase tracking-widest">Online Connection Required</p>}
               </div>
          </section>
        )}
      </div>
    </div>
  );
}
