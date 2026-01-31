
import React, { useEffect, useState } from 'react';
import { Customer } from '../../types';
import { Logo } from '../Branding';

interface QueueDisplayProps {
  queue: Customer[];
}

const QueueDisplay: React.FC<QueueDisplayProps> = ({ queue }) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const calculateWait = (checkIn: Date) => {
    const diff = Math.floor((currentTime.getTime() - checkIn.getTime()) / 60000);
    return `${diff}m`;
  };

  const getTierColor = (tier?: string) => {
    switch(tier) {
      case 'Platinum': return 'border-indigo-500 bg-indigo-500/10 text-indigo-300';
      case 'Gold': return 'border-gold bg-gold/10 text-gold';
      default: return 'border-zinc-700 bg-zinc-800/50 text-zinc-300';
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-black text-white h-full">
      {/* Header */}
      <header className="flex items-center justify-between p-8 border-b border-zinc-900 bg-zinc-950">
        <div className="flex items-center gap-8">
          <Logo size="sm" />
          <h1 className="text-4xl font-craft font-bold tracking-widest text-gold uppercase border-l border-zinc-800 pl-8">
            Waitlist
          </h1>
        </div>
        <div className="flex items-center gap-12 text-zinc-400">
          <div className="text-right">
            <div className="text-sm font-craft uppercase tracking-widest text-zinc-600">Now Serving</div>
            <div className="text-2xl font-bold text-white">4 Stations Open</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-craft uppercase tracking-widest text-zinc-600">Local Time</div>
            <div className="text-2xl font-bold text-white">{formatTime(currentTime)}</div>
          </div>
        </div>
      </header>

      {/* Queue Body */}
      <div className="flex-1 overflow-hidden p-8">
        <div className="flex flex-wrap gap-6 items-start h-full content-start justify-center">
          {queue.slice(0, 24).map((c, i) => (
            <div 
              key={c.id}
              className={`
                w-[280px] p-6 rounded-2xl border-2 shadow-2xl transition-all duration-500 animate-in fade-in slide-in-from-bottom-5
                ${getTierColor(c.loyaltyStatus)}
              `}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex justify-between items-start mb-4">
                <span className="text-xs font-craft uppercase tracking-tighter opacity-60">Pos #{(i + 1).toString().padStart(2, '0')}</span>
                <span className="text-sm font-mono opacity-80">{calculateWait(c.checkInTime)} wait</span>
              </div>
              
              <div className="flex items-baseline gap-2 mb-2">
                <h3 className="text-3xl font-bold tracking-tight truncate">{c.name}</h3>
                {c.lastNameInitial && (
                  <span className="text-2xl font-light opacity-50">{c.lastNameInitial}.</span>
                )}
              </div>

              <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                <div className="text-xs font-craft uppercase tracking-widest opacity-80">
                  {c.loyaltyStatus || 'Guest'}
                </div>
                <div className={`
                  text-[10px] px-2 py-0.5 rounded uppercase font-bold tracking-widest
                  ${c.status === 'Waiting' ? 'bg-zinc-700 text-zinc-300' : 'bg-gold text-black'}
                `}>
                  {c.status}
                </div>
              </div>
            </div>
          ))}

          {queue.length === 0 && (
            <div className="flex-1 flex items-center justify-center h-full opacity-20">
              <div className="text-center">
                <Logo size="lg" />
                <p className="mt-8 text-2xl font-craft tracking-widest">No customers in queue</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Info Bar */}
      <footer className="h-16 bg-zinc-950 flex items-center px-10 border-t border-zinc-900 justify-between">
        <div className="flex items-center gap-4 text-zinc-500 text-sm font-craft tracking-widest">
          <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
          System Live • Auto-Refresh Enabled
        </div>
        <div className="text-zinc-600 text-xs uppercase tracking-widest">
          Visit craftcannabis.com to join our VIP club
        </div>
      </footer>
    </div>
  );
};

export default QueueDisplay;
