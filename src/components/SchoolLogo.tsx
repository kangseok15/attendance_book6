import React from 'react';

interface SchoolLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const SchoolLogo: React.FC<SchoolLogoProps> = ({ 
  className = '', 
  size = 'md' 
}) => {
  const sizeClasses = {
    sm: 'w-12 h-6',
    md: 'w-16 h-8',
    lg: 'w-24 h-12',
  };

  return (
    <div 
      className={`relative inline-flex items-center justify-center overflow-hidden rounded-md shadow-sm select-none shrink-0 ${sizeClasses[size]} ${className}`}
      style={{ backgroundColor: '#801424' }}
      title="숭신고등학교 교표"
    >
      <svg 
        viewBox="0 0 220 110" 
        className="w-full h-full" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Background Burgundy Rect */}
        <rect width="220" height="110" fill="#801424" />
        
        {/* Center Triangular Peak (산/화살표 지붕 모양) */}
        <polygon points="110,48 25,96 195,96" fill="#ffffff" />

        {/* Left Character: 崇 (전서/인장체 스타일 벡터) */}
        <g stroke="#ffffff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
          {/* 갓머리 / 산머리 외곽 프레임 */}
          <path d="M 22 22 L 40 22 L 40 16 M 31 16 L 31 22" />
          <path d="M 18 36 L 44 36" />
          <path d="M 16 28 L 16 68 L 46 68 L 46 28" />
          {/* 내부 중앙 기둥과 형태 */}
          <path d="M 31 28 L 31 46" />
          <path d="M 23 48 L 39 48" />
          <path d="M 24 48 L 24 64" />
          <path d="M 31 48 L 31 68" />
          <path d="M 38 48 L 38 64" />
        </g>

        {/* Right Character: 信 (전서/해서 스타일 벡터) */}
        <g stroke="#ffffff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
          {/* 人 변 (좌측) */}
          <path d="M 168 20 C 164 32 158 44 152 56" />
          <path d="M 162 42 L 162 68" />
          
          {/* 言 변 (우측) */}
          <path d="M 182 18 L 182 24" />
          <path d="M 174 27 L 202 27" />
          <path d="M 177 35 L 199 35" />
          <path d="M 177 43 L 199 43" />
          <path d="M 177 51 L 199 51" />
          {/* 口 부 */}
          <rect x="176" y="58" width="24" height="15" />
        </g>
      </svg>
    </div>
  );
};
