import { motion } from 'motion/react';

export const Skeleton = ({ className }: { className?: string }) => {
  return (
    <motion.div
      animate={{
        opacity: [0.5, 1, 0.5],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      className={`bg-slate-200 rounded-lg ${className}`}
    />
  );
};

export const PostSkeleton = () => (
  <div className="glass-light rounded-2xl shadow-xl p-6 space-y-4 border-gradient-neo mb-6">
    <div className="flex items-center gap-3">
      <Skeleton className="w-10 h-10 rounded-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
    <div className="space-y-3 py-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-4/5" />
    </div>
    <Skeleton className="h-56 w-full rounded-2xl" />
    <div className="flex gap-4 pt-2">
      <Skeleton className="h-6 w-20" />
      <Skeleton className="h-6 w-20" />
    </div>
  </div>
);

export const ConfessionSkeleton = () => (
  <div className="glass-dark rounded-3xl border border-white/10 p-6 space-y-4 border-gradient-neo-dark mb-6">
    <div className="flex items-center gap-3">
      <Skeleton className="w-10 h-10 rounded-xl bg-white/5" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-32 bg-white/5" />
        <Skeleton className="h-3 w-20 bg-white/5" />
      </div>
    </div>
    <div className="space-y-3 py-2">
      <Skeleton className="h-4 w-full bg-white/5" />
      <Skeleton className="h-4 w-3/4 bg-white/5" />
    </div>
    <div className="flex gap-6 pt-2">
      <Skeleton className="h-6 w-24 bg-white/5" />
      <Skeleton className="h-6 w-24 bg-white/5" />
    </div>
  </div>
);
