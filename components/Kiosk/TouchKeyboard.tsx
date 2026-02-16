
import React, { useState } from 'react';

interface TouchKeyboardProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  type?: 'email' | 'text';
  submitLabel?: string;
  maxLength?: number;
}

const TouchKeyboard: React.FC<TouchKeyboardProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder = 'Enter email',
  type = 'email',
  submitLabel,
  maxLength,
}) => {
  const [showNumbers, setShowNumbers] = useState(false);
  const [uppercase, setUppercase] = useState(type === 'text');

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
    const char = uppercase ? key.toUpperCase() : key;
    const newValue = value + char;
    if (maxLength && newValue.length > maxLength) return;
    onChange(newValue);
    // Auto-lowercase after first letter in text mode (capitalize first letter only)
    if (uppercase && type === 'text') {
      setUppercase(false);
    }
  };

  const handleBackspace = () => {
    onChange(value.slice(0, -1));
  };

  const handleClear = () => {
    onChange('');
    if (type === 'text') setUppercase(true);
  };

  const handleSpace = () => {
    if (maxLength && value.length >= maxLength) return;
    onChange(value + ' ');
    // Capitalize after space in text mode (new word)
    if (type === 'text') setUppercase(true);
  };

  const handleQuickDomain = (domain: string) => {
    const atIndex = value.indexOf('@');
    if (atIndex !== -1) {
      onChange(value.substring(0, atIndex) + domain);
    } else {
      onChange(value + domain);
    }
  };

  const toggleCase = () => {
    setUppercase(!uppercase);
  };

  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const canSubmit = type === 'email' ? isValidEmail(value) : value.trim().length > 0;
  const defaultSubmitLabel = type === 'email' ? 'Continue →' : 'Continue →';

  return (
    <div className="w-full max-w-2xl">
      {/* Input Display */}
      <div className="bg-black/50 border-2 border-zinc-700 rounded-2xl p-5 mb-4">
        <input
          type="text"
          value={value}
          readOnly
          placeholder={placeholder}
          className="w-full bg-transparent text-2xl text-white text-center outline-none placeholder:text-zinc-600"
        />
      </div>

      {/* Quick Domain Buttons (email mode only) */}
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
              {type === 'email' && (
                <button
                  onClick={() => handleKeyPress('@')}
                  className="w-14 h-14 bg-zinc-800 hover:bg-zinc-700 text-gold text-xl font-medium rounded-xl transition-all active:scale-95"
                >
                  @
                </button>
              )}
            </div>
          </>
        ) : (
          /* Letter Keyboard */
          <>
            {letterRows.map((row, rowIndex) => (
              <div key={rowIndex} className="flex justify-center gap-1.5">
                {/* Shift key on left of bottom row */}
                {rowIndex === 2 && type === 'text' && (
                  <button
                    onClick={toggleCase}
                    className={`w-14 h-14 flex items-center justify-center rounded-xl transition-all active:scale-95 ${
                      uppercase ? 'bg-gold text-black' : 'bg-zinc-700 hover:bg-zinc-600 text-white'
                    }`}
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                )}
                {row.map((letter) => (
                  <button
                    key={letter}
                    onClick={() => handleKeyPress(letter)}
                    className="w-12 h-14 bg-zinc-800 hover:bg-zinc-700 text-white text-lg font-medium rounded-xl transition-all active:scale-95 active:bg-zinc-600"
                  >
                    {uppercase ? letter.toUpperCase() : letter}
                  </button>
                ))}
                {/* Backspace on right of bottom row for text mode */}
                {rowIndex === 2 && type === 'text' && (
                  <button
                    onClick={handleBackspace}
                    className="w-14 h-14 bg-zinc-700 hover:bg-zinc-600 text-white flex items-center justify-center rounded-xl transition-all active:scale-95"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414-6.414A2 2 0 0110.828 5H19a2 2 0 012 2v10a2 2 0 01-2 2h-8.172a2 2 0 01-1.414-.586L3 12z" />
                    </svg>
                  </button>
                )}
              </div>
            ))}

            {/* Bottom row: special keys */}
            {type === 'text' ? (
              /* Text mode: space bar */
              <div className="flex justify-center gap-1.5">
                <button
                  onClick={handleSpace}
                  className="flex-1 max-w-md h-14 bg-zinc-800 hover:bg-zinc-700 text-white text-lg font-medium rounded-xl transition-all active:scale-95 active:bg-zinc-600"
                >
                  space
                </button>
              </div>
            ) : (
              /* Email mode: special characters */
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
            )}
          </>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 mt-4">
        <button
          onClick={handleClear}
          className="flex-1 py-5 bg-zinc-800 hover:bg-zinc-700 text-white text-lg font-craft rounded-xl transition-all active:scale-95"
        >
          Clear
        </button>
        {type === 'email' && (
          <button
            onClick={handleBackspace}
            className="flex-1 py-5 bg-zinc-700 hover:bg-zinc-600 text-white text-lg font-craft rounded-xl transition-all active:scale-95"
          >
            ⌫ Delete
          </button>
        )}
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className={`flex-1 py-5 text-lg font-craft font-bold rounded-xl transition-all active:scale-95 ${
            canSubmit
              ? 'bg-gold text-black hover:bg-[#d8c19d]'
              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
          }`}
        >
          {submitLabel || defaultSubmitLabel}
        </button>
      </div>
    </div>
  );
};

export default TouchKeyboard;
