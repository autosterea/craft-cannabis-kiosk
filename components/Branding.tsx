
import React from 'react';

export const Logo: React.FC<{ size?: 'sm' | 'md' | 'lg' | 'xl' }> = ({ size = 'md' }) => {
  const sizes = {
    sm: 'h-12',
    md: 'h-24',
    lg: 'h-32',
    xl: 'h-48'
  };

  // User provided working logo URL
  const logoUrl = "https://b2613746.smushcdn.com/2613746/wp-content/uploads/elementor/thumbs/cropped-CRAFT-CANNABIS-Logo-Color-pjk7a5brveotmw7673tynrdtqt062cbbmatgc2nu0k.webp?lossy=0&strip=1&webp=1";

  return (
    <img 
      src={logoUrl}
      alt="Craft Cannabis" 
      className={`${sizes[size]} object-contain mx-auto`}
    />
  );
};

export const GoldButton: React.FC<{ 
  label: string; 
  onClick: () => void; 
  icon?: React.ReactNode;
  secondary?: boolean;
}> = ({ label, onClick, icon, secondary }) => (
  <button
    onClick={onClick}
    className={`
      flex flex-col items-center justify-center p-8 rounded-2xl transition-all active:scale-95
      ${secondary 
        ? 'bg-zinc-800 border-2 border-gold text-gold hover:bg-zinc-700' 
        : 'bg-gold text-black font-bold hover:bg-[#d8c19d]'
      }
    `}
  >
    {icon && <div className="mb-4 text-4xl">{icon}</div>}
    <span className="text-xl font-craft font-bold text-center leading-tight uppercase tracking-widest">{label}</span>
  </button>
);
