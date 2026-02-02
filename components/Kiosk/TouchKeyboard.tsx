
import React, { useState } from 'react';

interface TouchKeyboardProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  type?: 'email' | 'text';
}

const TouchKeyboard: React.FC<TouchKeyboardProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder = 'Enter email',
  type = 'email',
}) => {
  const [showNumbers, setShowNumbers] = useState(false);

  const letterRows = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
  ];

  const numberRow = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  const quickDomains = [
    '@gmail.com',
    '@yahoo.com',
    '@outlook.com',
    '@icloud.com',
  ];

  const handleKeyPress = (key: string) => {
    onChange(value + key);
  };

  const handleBackspace = () => {
    onChange(value.slice(0, -1));
  };

  const handleClear = () => {
    onChange('');
  };

  const handleQuickDomain = (domain: string) => {
    // If there's already an @, replace everything after it
    const atIndex = value.indexOf('@');
    if (atIndex !== -1) {
      onChange(value.substring(0, atIndex) + domain);
    } else {
      onChange(value + domain);
    }
  };

  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const canSubmit = type === 'email' ? isValidEmail(value) : value.length > 0;

  return (
    <div className="w-full max-w-2xl">
      {/* Input Display */}
      <div className="bg-black/50 border-2 border-zinc-700 rounded-2xl p-5 mb-6">
        <input
          type="text"
          value={value}
          readOnly
          placeholder={placeholder}
          className="w-full bg-transparent text-2xl text-white text-center outline-none placeholder:text-zinc-600"
        />
      </div>

      {/* Quick Domain Buttons */}
      {type === 'email' && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          {quickDomains.map((domain) => (
            <button
              key={domain}
              onClick={() => handleQuickDomain(domain)}
              className="py-3 px-2 bg-zinc-800 hover:bg-zinc-700 text-gold text-sm font-medium rounded-xl transition-all active:scale-95"
            >
              {domain}
            </button>
          ))}
        </div>
      )}

      {/* Number/Letter Toggle */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setShowNumbers(false)}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
            !showNumbers ? 'bg-gold text-black' : 'bg-zinc-800 text-white'
          }`}
        >
          ABC
        </button>
        <button
          onClick={() => setShowNumbers(true)}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
            showNumbers ? 'bg-gold text-black' : 'bg-zinc-800 text-white'
          }`}
        >
          123
        </button>
      </div>

      {/* Keyboard */}
      <div className="space-y-2">
        {showNumbers ? (
          /* Number Keyboard */
          <>
            <div className="flex justify-center gap-2">
              {numberRow.map((num) => (
                <button
                  key={num}
                  onClick={() => handleKeyPress(num)}
                  className="w-14 h-14 bg-zinc-800 hover:bg-zinc-700 text-white text-xl font-medium rounded-xl transition-all active:scale-95 active:bg-zinc-600"
                >
                  {num}
                </button>
              ))}
            </div>
            <div className="flex justify-center gap-2">
              <button
                onClick={() => handleKeyPress('-')}
                className="w-14 h-14 bg-zinc-800 hover:bg-zinc-700 text-white text-xl font-medium rounded-xl transition-all active:scale-95"
              >
                -
              </button>
              <button
                onClick={() => handleKeyPress('_')}
                className="w-14 h-14 bg-zinc-800 hover:bg-zinc-700 text-white text-xl font-medium rounded-xl transition-all active:scale-95"
              >
                _
              </button>
              <button
                onClick={() => handleKeyPress('.')}
                className="w-14 h-14 bg-zinc-800 hover:bg-zinc-700 text-white text-xl font-medium rounded-xl transition-all active:scale-95"
              >
                .
              </button>
              <button
                onClick={() => handleKeyPress('@')}
                className="w-14 h-14 bg-zinc-800 hover:bg-zinc-700 text-gold text-xl font-medium rounded-xl transition-all active:scale-95"
              >
                @
              </button>
            </div>
          </>
        ) : (
          /* Letter Keyboard */
          <>
            {letterRows.map((row, rowIndex) => (
              <div key={rowIndex} className="flex justify-center gap-1.5">
                {row.map((letter) => (
                  <button
                    key={letter}
                    onClick={() => handleKeyPress(letter)}
                    className="w-12 h-14 bg-zinc-800 hover:bg-zinc-700 text-white text-lg font-medium rounded-xl transition-all active:scale-95 active:bg-zinc-600"
                  >
                    {letter}
                  </button>
                ))}
              </div>
            ))}
            {/* Special keys row */}
            <div className="flex justify-center gap-1.5">
              <button
                onClick={() => handleKeyPress('@')}
                className="w-14 h-14 bg-zinc-700 hover:bg-zinc-600 text-gold text-xl font-medium rounded-xl transition-all active:scale-95"
              >
                @
              </button>
              <button
                onClick={() => handleKeyPress('.')}
                className="w-14 h-14 bg-zinc-700 hover:bg-zinc-600 text-white text-xl font-medium rounded-xl transition-all active:scale-95"
              >
                .
              </button>
              <button
                onClick={() => handleKeyPress('-')}
                className="w-14 h-14 bg-zinc-700 hover:bg-zinc-600 text-white text-xl font-medium rounded-xl transition-all active:scale-95"
              >
                -
              </button>
              <button
                onClick={() => handleKeyPress('_')}
                className="w-14 h-14 bg-zinc-700 hover:bg-zinc-600 text-white text-xl font-medium rounded-xl transition-all active:scale-95"
              >
                _
              </button>
            </div>
          </>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 mt-6">
        <button
          onClick={handleClear}
          className="flex-1 py-5 bg-zinc-800 hover:bg-zinc-700 text-white text-lg font-craft rounded-xl transition-all active:scale-95"
        >
          Clear
        </button>
        <button
          onClick={handleBackspace}
          className="flex-1 py-5 bg-zinc-700 hover:bg-zinc-600 text-white text-lg font-craft rounded-xl transition-all active:scale-95"
        >
          ⌫ Delete
        </button>
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className={`flex-1 py-5 text-lg font-craft font-bold rounded-xl transition-all active:scale-95 ${
            canSubmit
              ? 'bg-gold text-black hover:bg-[#d8c19d]'
              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
          }`}
        >
          Continue →
        </button>
      </div>
    </div>
  );
};

export default TouchKeyboard;
