import React from 'react';
import { AttendanceStatus } from '../types/attendance';

interface StatusIconProps {
  status: AttendanceStatus;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

export const StatusIcon: React.FC<StatusIconProps> = ({ 
  status, 
  className = '',
  size = 'md' 
}) => {
  const sizeMap = {
    xs: 'w-3 h-3 text-xs',
    sm: 'w-3.5 h-3.5 text-xs',
    md: 'w-4.5 h-4.5 text-sm',
    lg: 'w-6 h-6 text-base',
  };

  if (status === 'EARLY_LEAVE') {
    // 동그라미(○)를 사선(/)이 위아래 바깥으로 시원하게 관통하는 조퇴 기호
    return (
      <svg 
        viewBox="0 0 24 24" 
        className={`inline-block shrink-0 ${sizeMap[size]} ${className}`} 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2.8" 
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-label="조퇴"
      >
        {/* 원형 테두리 */}
        <circle cx="12" cy="12" r="6.2" />
        {/* 원형 바깥으로 뻗어나가는 대각선 슬래시 */}
        <line x1="3.8" y1="20.2" x2="20.2" y2="3.8" />
      </svg>
    );
  }

  if (status === 'PRESENT') {
    return <span className={`font-black select-none ${className}`}>○</span>;
  }

  if (status === 'LATE') {
    return <span className={`font-black select-none ${className}`}>△</span>;
  }

  if (status === 'EXCUSED') {
    return <span className={`font-bold select-none ${className}`}>인</span>;
  }

  if (status === 'ABSENT') {
    return <span className={`font-black select-none ${className}`}>X</span>;
  }

  return null;
};
