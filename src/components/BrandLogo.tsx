import React, { useState } from 'react';
import { GraduationCap } from 'lucide-react';

interface BrandLogoProps {
  className?: string;
  size?: number;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ className, size = 32 }) => {
  const [error, setError] = useState(false);
  const logoUrl = "/logo.png?v=2";

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-indigo-600 rounded-full text-white ${className}`} style={{ width: size, height: size }}>
        <GraduationCap size={size * 0.6} />
      </div>
    );
  }

  return (
    <img 
      src={logoUrl} 
      className={className} 
      style={{ width: size, height: size }}
      alt="School Logo" 
      onError={() => setError(true)}
    />
  );
};
