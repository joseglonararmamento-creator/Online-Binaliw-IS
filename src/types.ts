export type UserRole = 'teacher' | 'student';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole;
  classNumber?: string; // Legacy
  classId?: string; // Legacy (single class)
  classIds?: string[]; // New: Multiple classes
  isOnline?: boolean;
  lastActive?: any;
  subjectHandled?: string;
  yearsOfTeaching?: string;
  gender?: string;
  bio?: string;
  createdAt: any;
}

export interface Class {
  id: string;
  name: string;
  description: string;
  teacherId: string;
  inviteCode: string;
  createdAt: any;
}

export interface Reminder {
  id: string;
  teacherId: string;
  classId: string;
  text: string;
  type: 'status' | 'reminder';
  createdAt: any;
}

export interface Lesson {
  id: string;
  title: string;
  content: string;
  mediaUrls: string[];
  fileUrl?: string;
  fileName?: string;
  teacherId: string;
  createdAt: any;
}

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  photoURL: string | null;
  text: string;
  createdAt: any;
  likes?: number;
  youtubeId?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'file';
  fileName?: string;
  fileSize?: number;
}

export interface Comment {
  id: string;
  parentId: string;
  parentType: 'post' | 'confession';
  authorId: string;
  authorName: string;
  authorPhoto: string;
  text: string;
  isAnonymous?: boolean;
  createdAt: any;
  youtubeId?: string;
}

export interface Confession {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  text: string;
  imageUrl?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'file';
  fileName?: string;
  fileSize?: number;
  youtubeId?: string;
  isAnonymous: boolean;
  likesCount?: number;
  createdAt: any;
}

export interface Assignment {
  id: string;
  lessonId: string;
  title: string;
  description: string;
  deadline: any;
  teacherId: string;
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  content: string;
  fileUrl?: string;
  fileName?: string;
  grade?: number;
  feedback?: string;
  status: 'submitted' | 'graded';
  submittedAt: any;
}

export interface Quiz {
  id: string;
  lessonId: string;
  title: string;
  questions: QuizQuestion[];
  teacherId: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  studentId: string;
  score: number;
  total: number;
  completedAt: any;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId?: string; // Optional for group/class chats
  classId?: string; // New: Link to a specific Class
  classNumber?: string; // Legacy: For class-based chats
  text?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'audio' | 'emoji' | 'file';
  fileName?: string;
  fileSize?: number;
  youtubeMetadata?: {
    videoId: string;
    title: string;
    thumbnailUrl: string;
  };
  createdAt: any;
  reactions?: Record<string, string[]>; // emoji -> list of userIds
  readBy?: string[]; // list of userIds
}

export interface Friendship {
  id: string;
  user1: string;
  user2: string;
  status: 'pending' | 'accepted';
  createdAt: any;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'friend_request' | 'new_post' | 'post_liked' | 'class_join_request' | 'post_comment' | 'class_accepted' | 'confession_liked' | 'confession_comment';
  authorId: string;
  authorName: string;
  authorPhoto: string;
  text: string;
  link?: string;
  isRead: boolean;
  createdAt: any;
  postId?: string;
  classId?: string;
  className?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  date: any;
  type: string;
}

export interface PostLike {
  id: string;
  postId: string;
  userId: string;
  createdAt: any;
}
