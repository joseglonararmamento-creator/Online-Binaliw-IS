export const getSafeDate = (createdAt: any): Date | null => {
  if (!createdAt) return null;
  if (createdAt instanceof Date) return createdAt;
  try {
    if (typeof createdAt.toDate === 'function') return createdAt.toDate();
    // Handle timestamp-like objects
    if (createdAt.seconds) return new Date(createdAt.seconds * 1000);
  } catch (e) {
    console.error("Date parse error", e);
  }
  return null;
};
