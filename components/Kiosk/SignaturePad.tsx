import React, { useRef, useEffect, useState } from 'react';

interface SignaturePadProps {
  // Fires after each completed stroke with a PNG data URL, or null when cleared/empty.
  onChange: (dataUrl: string | null) => void;
  height?: number;
}

// Lightweight finger/mouse signature canvas. No external dependencies.
const SignaturePad: React.FC<SignaturePadProps> = ({ onChange, height = 200 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  // Size the backing store to the element for crisp lines on high-DPI kiosk screens.
  // Uses a ResizeObserver so it works even when the canvas mounts inside a
  // conditionally-rendered step (where the rect can be 0×0 on the first effect tick).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const applySize = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      // Absolute transform (not cumulative scale) so re-sizing doesn't compound.
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111111';
    };
    applySize();
    const ro = new ResizeObserver(() => applySize());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  const getPoint = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const src = 'touches' in e ? e.touches[0] : (e as React.MouseEvent);
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    if (e.cancelable) e.preventDefault();
    drawing.current = true;
    const p = getPoint(e);
    last.current = p;
    // Draw a dot so even a single tap (no movement) registers as ink and emits onChange.
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    if (!hasInk.current) {
      hasInk.current = true;
      setEmpty(false);
    }
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return;
    if (e.cancelable) e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !last.current) return;
    const p = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!hasInk.current) {
      hasInk.current = true;
      setEmpty(false);
    }
  };

  const end = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return;
    if (e.cancelable) e.preventDefault();
    drawing.current = false;
    last.current = null;
    if (hasInk.current && canvasRef.current) {
      onChange(canvasRef.current.toDataURL('image/png'));
    }
  };

  const clearPad = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
    setEmpty(true);
    onChange(null);
  };

  return (
    <div className="w-full">
      <div className="relative rounded-2xl border-2 border-zinc-700 bg-white overflow-hidden" style={{ height }}>
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-crosshair touch-none select-none"
          style={{ touchAction: 'none' }}
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
        {empty && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-zinc-400 text-lg">
            Sign here with your finger
          </span>
        )}
      </div>
      <div className="flex justify-end mt-2">
        <button
          onClick={clearPad}
          className="text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
        >
          Clear signature
        </button>
      </div>
    </div>
  );
};

export default SignaturePad;
