import { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, Timestamp, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { CalendarEvent, Assignment } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar as CalendarIcon, 
  Plus, 
  Trash2, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  MapPin,
  X,
  Type
} from 'lucide-react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameDay, 
  isSameMonth, 
  addDays, 
  eachDayOfInterval 
} from 'date-fns';
import { getSafeDate } from '../lib/dateUtils';

export default function CalendarPage() {
  const { profile } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());

  // Form State
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newType, setNewType] = useState('Exam');

  useEffect(() => {
    const unsubEvents = onSnapshot(collection(db, 'calendarEvents'), (snapshot) => {
      setEvents(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as CalendarEvent)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'calendarEvents list'));
    
    // Also show assignment deadlines on calendar
    const unsubAssignments = onSnapshot(collection(db, 'assignments'), (snapshot) => {
      setAssignments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Assignment)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'assignments list calendar'));

    return () => { unsubEvents(); unsubAssignments(); };
  }, []);

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'calendarEvents'), {
        title: newTitle,
        description: newDesc,
        date: Timestamp.fromDate(new Date(newDate)),
        type: newType,
      });
      setShowAddModal(false);
      setNewTitle('');
      setNewDesc('');
      setNewDate('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'add calendar event');
    }
  };

  const deleteEvent = async (id: string) => {
    if (confirm('Delete this event?')) {
      try {
        await deleteDoc(doc(db, 'calendarEvents', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `calendarEvents/${id}`);
      }
    }
  };

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const dayEvents = (day: Date) => {
    const evs = events.filter(e => {
      const d = getSafeDate(e.date);
      return d ? isSameDay(d, day) : false;
    });
    const asgs = assignments.filter(a => {
      const d = getSafeDate(a.deadline);
      return d ? isSameDay(d, day) : false;
    });
    return { events: evs, assignments: asgs };
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Academic Calendar</h2>
          <p className="text-slate-500">Track exams, deadlines, and class events.</p>
        </div>
        {profile?.role === 'teacher' && (
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all shadow-indigo-200"
          >
            <Plus size={20} />
            Create Event
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-7 gap-8">
        {/* Calendar Grid */}
        <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden shadow-slate-200/50">
          <header className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h3 className="text-xl font-black text-slate-900 tracking-tight underline decoration-indigo-200 underline-offset-4">
              {format(currentDate, 'MMMM yyyy')}
            </h3>
            <div className="flex gap-2">
              <button 
                onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                className="p-2 border border-slate-200 rounded-xl hover:bg-white transition-all shadow-sm active:scale-95"
              >
                <ChevronLeft size={18} />
              </button>
              <button 
                onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                className="p-2 border border-slate-200 rounded-xl hover:bg-white transition-all shadow-sm active:scale-95"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </header>
          
          <div className="grid grid-cols-7 border-b border-slate-50">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="p-4 text-center text-xs font-black text-slate-400 uppercase tracking-widest leading-none bg-slate-50/30">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 min-h-[600px]">
            {calendarDays.map((day, i) => {
              const { events: evs, assignments: asgs } = dayEvents(day);
              const isToday = isSameDay(day, new Date());
              const isSelected = isSameDay(day, selectedDay || new Date());
              const isThisMonth = isSameMonth(day, monthStart);

              return (
                <div 
                  key={i} 
                  onClick={() => setSelectedDay(day)}
                  className={`min-h-[100px] p-2 border-r border-b border-slate-50 cursor-pointer transition-all hover:bg-indigo-50/30 relative ${
                    isThisMonth ? 'bg-white' : 'bg-slate-50/30 grayscale opacity-40 hover:grayscale-0 hover:opacity-100'
                  } ${isSelected ? 'ring-2 ring-indigo-500 ring-inset z-10' : ''}`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-md ${
                      isToday ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-400'
                    }`}>
                      {format(day, 'd')}
                    </span>
                  </div>
                  
                  <div className="space-y-1">
                    {evs.map(e => (
                      <div key={e.id} className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded-md truncate font-bold border border-blue-100">
                        • {e.title}
                      </div>
                    ))}
                    {asgs.map(a => (
                      <div key={a.id} className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-700 rounded-md truncate font-bold border border-red-100">
                        ! {a.title}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar: Day Details */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm min-h-[300px]">
            <h4 className="font-bold text-slate-400 uppercase tracking-widest text-xs mb-4">Schedule for</h4>
            <h2 className="text-2xl font-black text-slate-900 mb-6">
              {selectedDay ? format(selectedDay, 'EEEE, MMM do') : 'Select a date'}
            </h2>
            
            <div className="space-y-4">
              {selectedDay && dayEvents(selectedDay).events.map(e => (
                <motion.div 
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={e.id} 
                  className="p-4 bg-blue-50 border border-blue-100 rounded-2xl group flex justify-between items-start"
                >
                  <div>
                    <h5 className="font-bold text-blue-900 text-sm mb-1">{e.title}</h5>
                    <p className="text-xs text-blue-600/80 mb-2">{e.description}</p>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-blue-500 bg-white/50 px-2 py-0.5 rounded-lg inline-flex">
                      <Clock size={10} /> {(() => {
                        const d = getSafeDate(e.date);
                        return d ? format(d, 'h:mm a') : 'TBA';
                      })()}
                    </div>
                  </div>
                  {profile?.role === 'teacher' && (
                    <button onClick={() => deleteEvent(e.id)} className="p-1 opacity-0 group-hover:opacity-100 text-blue-400 hover:text-red-500 transition-all">
                      <Trash2 size={16} />
                    </button>
                  )}
                </motion.div>
              ))}

              {selectedDay && dayEvents(selectedDay).assignments.map(a => (
                <motion.div 
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={a.id} 
                  className="p-4 bg-red-50 border border-red-100 rounded-2xl"
                >
                  <h5 className="font-bold text-red-900 text-sm mb-1">{a.title} (Deadline)</h5>
                  <p className="text-xs text-red-600/80 mb-2 leading-tight">Student submission deadline for this module.</p>
                  <div className="flex items-center gap-2 text-[10px] font-bold text-red-500 bg-white/50 px-2 py-0.5 rounded-lg inline-flex">
                    <Clock size={10} /> {(() => {
                      const d = getSafeDate(a.deadline);
                      return d ? format(d, 'h:mm a') : 'TBA';
                    })()}
                  </div>
                </motion.div>
              ))}

              {selectedDay && dayEvents(selectedDay).events.length === 0 && dayEvents(selectedDay).assignments.length === 0 && (
                <div className="py-12 text-center">
                  <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CalendarIcon className="text-slate-300" size={24} />
                  </div>
                  <p className="text-slate-400 text-sm italic font-medium tracking-tight">No events scheduled for this day.</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-xl shadow-slate-200">
            <h5 className="font-bold mb-2">Pro Tip</h5>
            <p className="text-slate-400 text-xs leading-relaxed">
              Assignment deadlines are automatically synced with your calendar. Red markers indicate critical deadlines.
            </p>
          </div>
        </div>
      </div>

      {/* Add Event Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-slate-900 tracking-tight">New Event</h3>
                <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-50 rounded-full text-slate-400"><X /></button>
              </div>
              
              <form onSubmit={handleAddEvent} className="space-y-4">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Event Type</label>
                  <select 
                    value={newType} 
                    onChange={e => setNewType(e.target.value)}
                    className="w-full p-3 bg-slate-50 border rounded-xl"
                  >
                    <option>Exam</option>
                    <option>Class Meeting</option>
                    <option>Live Session</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Title</label>
                  <input type="text" required value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Date & Time</label>
                  <input type="datetime-local" required value={newDate} onChange={e => setNewDate(e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Info</label>
                  <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl" />
                </div>
                <div className="pt-4 flex gap-3">
                  <button type="submit" className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95">Save Event</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
