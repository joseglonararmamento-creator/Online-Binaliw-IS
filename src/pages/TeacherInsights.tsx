import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { QuizAttempt, Submission, UserProfile, Assignment } from '../types';
import { motion } from 'motion/react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, Legend 
} from 'recharts';
import { 
  Users, 
  Trophy, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  ArrowUpRight, 
  Search,
  Filter,
  Download,
  BarChart3 as BarChartIcon
} from 'lucide-react';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function TeacherInsights() {
  const { profile } = useAuth();
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch all students in the teacher's potential classes or just all students for now
        const studentsSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student')));
        const fetchedStudents = studentsSnap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
        setStudents(fetchedStudents);

        // Fetch all quiz attempts
        const attemptsSnap = await getDocs(collection(db, 'quizAttempts'));
        setAttempts(attemptsSnap.docs.map(d => ({ id: d.id, ...d.data() } as QuizAttempt)));

        // Fetch all submissions
        const submissionsSnap = await getDocs(collection(db, 'submissions'));
        setSubmissions(submissionsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Submission)));

        // Fetch assignments to link submissions
        const assignmentsSnap = await getDocs(collection(db, 'assignments'));
        setAssignments(assignmentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment)));

      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'teacher insights dashboard data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Performance Data for Bar Chart
  const classPerformance = [
    { name: 'Unit 1 Quiz', avg: 85 },
    { name: 'Algebra 101', avg: 72 },
    { name: 'Biology Intro', avg: 91 },
    { name: 'History Rev', avg: 65 },
    { name: 'Lit Analysis', avg: 78 },
  ];

  // Submission Status Data for Pie Chart
  const submissionStatusData = [
    { name: 'Graded', value: submissions.filter(s => s.status === 'graded').length },
    { name: 'Pending', value: submissions.filter(s => s.status === 'submitted').length },
    { name: 'Late', value: 3 }, // Mock late count or calculate if deadline exists
  ];

  const filteredStudents = students.filter(s => 
    s.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return (
    <div className="flex items-center justify-center h-[500px]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
    </div>
  );

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Classroom Insights</h2>
          <p className="text-slate-500">Real-time performance analytics and student activity monitor.</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm">
            <Download size={16} /> Export CSV
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
            <TrendingUp size={16} /> Generate Report
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard 
          icon={<Users className="text-indigo-600" />} 
          label="Active Students" 
          value={students.length.toString()} 
          change="+12% this month"
          color="bg-indigo-50"
        />
        <MetricCard 
          icon={<Trophy className="text-emerald-600" />} 
          label="Avg Quiz Score" 
          value="78%" 
          change="+4.2 pts"
          color="bg-emerald-50"
        />
        <MetricCard 
          icon={<CheckCircle2 className="text-blue-600" />} 
          label="Completion Rate" 
          value="92%" 
          change="+1.5%"
          color="bg-blue-50"
        />
        <MetricCard 
          icon={<Clock className="text-amber-600" />} 
          label="Pending Grades" 
          value={submissions.filter(s => s.status === 'submitted').length.toString()} 
          change="Action required"
          color="bg-amber-50"
          isUrgent={submissions.filter(s => s.status === 'submitted').length > 5}
        />
      </div>

      {/* Main Analytics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white rounded-[32px] border border-slate-100 shadow-sm p-8">
          <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <BarChartIcon className="text-indigo-600" size={20} />
            Quiz Performance by Module
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classPerformance}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar 
                  dataKey="avg" 
                  fill="#6366f1" 
                  radius={[6, 6, 0, 0]} 
                  barSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-8">
          <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <CheckCircle2 className="text-emerald-600" size={20} />
            Submission Status
          </h3>
          <div className="h-[300px] w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={submissionStatusData}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={8}
                  dataKey="value"
                >
                  {submissionStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend 
                  verticalAlign="bottom" 
                  align="center"
                  iconType="circle"
                  wrapperStyle={{ paddingTop: '20px' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-12">
              <span className="text-3xl font-black text-slate-900">{submissions.length}</span>
              <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Total</span>
            </div>
          </div>
        </div>
      </div>

      {/* Student Activity List */}
      <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h3 className="text-xl font-bold text-slate-900">Student Ranking & Progress</h3>
          <div className="flex gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Search students..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
              />
            </div>
            <button className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600 transition-all">
              <Filter size={18} />
            </button>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Student</th>
                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Class</th>
                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Avg Quiz</th>
                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Assignments</th>
                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Overall Progress</th>
                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredStudents.map((student) => {
                const studentAttempts = attempts.filter(a => a.studentId === student.uid);
                const avgQuiz = studentAttempts.length > 0 
                  ? Math.round(studentAttempts.reduce((acc, curr) => acc + (curr.score / curr.total), 0) / studentAttempts.length * 100) 
                  : 0;
                
                const studentSubmissions = submissions.filter(s => s.studentId === student.uid);
                const progress = studentSubmissions.length > 0 ? (studentSubmissions.filter(s => s.status === 'graded').length / studentSubmissions.length) * 100 : 0;

                return (
                  <tr key={student.uid} className="hover:bg-slate-50/30 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                        <img 
                          src={student.photoURL || `https://ui-avatars.com/api/?name=${student.displayName}`} 
                          className="w-10 h-10 rounded-2xl shadow-sm" 
                          alt="" 
                        />
                        <div>
                          <p className="font-bold text-slate-900">{student.displayName}</p>
                          <p className="text-xs text-slate-400">{student.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black uppercase italic tracking-tighter ring-1 ring-indigo-200/50">
                        {student.classNumber || 'Unassigned'}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <span className={`font-bold ${avgQuiz > 80 ? 'text-emerald-600' : 'text-slate-900'}`}>
                        {avgQuiz}%
                      </span>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <span className="text-sm font-bold text-slate-600">
                        {studentSubmissions.length} / 10
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          className="h-full bg-indigo-600"
                        />
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl transition-all shadow-none hover:shadow-sm">
                        <ArrowUpRight size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredStudents.length === 0 && (
            <div className="py-20 text-center text-slate-400">
              No students found matching your search.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, change, color, isUrgent }: any) {
  return (
    <motion.div 
      whileHover={{ y: -5 }}
      className={`p-6 bg-white rounded-[32px] border ${isUrgent ? 'border-amber-200 ring-4 ring-amber-50' : 'border-slate-100'} shadow-sm`}
    >
      <div className={`w-12 h-12 ${color} rounded-2xl flex items-center justify-center mb-4`}>
        {icon}
      </div>
      <p className="text-slate-500 text-sm font-medium mb-1">{label}</p>
      <div className="flex items-end justify-between">
        <h4 className="text-3xl font-black text-slate-900">{value}</h4>
        <span className={`text-[10px] font-black uppercase tracking-widest ${isUrgent ? 'text-amber-600' : 'text-emerald-500'}`}>
          {change}
        </span>
      </div>
    </motion.div>
  );
}
