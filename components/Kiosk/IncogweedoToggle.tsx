import React from 'react';

interface IncogweedoToggleProps {
  active: boolean;
  onToggle: () => void;
  displayNumber: string;
}

const IncogweedoToggle: React.FC<IncogweedoToggleProps> = ({ active, onToggle, displayNumber }) => {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center gap-4 rounded-2xl border-2 p-4 transition-all ${
        active
          ? 'bg-green-900/30 border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.25)]'
          : 'bg-zinc-900/60 border-zinc-700 hover:border-zinc-500'
      }`}
      aria-pressed={active}
    >
      <img
        src="./assets/incogweedo-logo.png"
        alt="Incogweedo Mode"
        className={`w-16 h-16 rounded-full transition-all ${active ? '' : 'grayscale opacity-60'}`}
      />
      <div className="flex-1 text-left">
        {active ? (
          <>
            <div className="text-green-400 font-craft font-bold uppercase tracking-wider text-sm">Incognito ON</div>
            <div className="text-white text-base mt-0.5">
              You'll be <span className="font-bold text-gold">#{displayNumber}</span> on the screen instead of your name.
            </div>
          </>
        ) : (
          <>
            <div className="text-gold font-craft font-bold uppercase tracking-wider text-sm">Incogweedo Mode</div>
            <div className="text-zinc-300 text-base mt-0.5">
              Don't like your name in lights? Get a number instead.
            </div>
          </>
        )}
      </div>
      <div
        className={`w-12 h-7 rounded-full p-1 transition-colors ${
          active ? 'bg-green-500' : 'bg-zinc-700'
        }`}
      >
        <div
          className={`w-5 h-5 rounded-full bg-white transition-transform ${
            active ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </div>
    </button>
  );
};

export default IncogweedoToggle;
