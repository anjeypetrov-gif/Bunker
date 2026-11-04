import React, { useEffect, useRef } from 'react';

/**
 * Эффект старой киноплёнки поверх фона: зерно, мерцание, царапины, пыль, виньетка.
 * Чисто декоративный слой (pointer-events: none). Зерно и царапины не мигают, поэтому
 * работают всегда (в Windows с выключенными «эффектами анимации» браузер сообщает
 * prefers-reduced-motion, и раньше из-за этого эффект пропадал). При reduced-motion
 * отключаются только мерцание и дрожание кадра.
 */
export const FilmEffect: React.FC = () => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0, h = 0, img: ImageData | null = null;
    const resize = () => {
      // Низкое разрешение = крупное «плёночное» зерно и дёшево по CPU.
      w = Math.max(160, Math.round(window.innerWidth / 3));
      h = Math.max(90, Math.round(window.innerHeight / 3));
      canvas.width = w; canvas.height = h;
      img = ctx.createImageData(w, h);
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0, last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 70 || !img) return; // ~14 кадров/с, как у старой камеры
      last = t;
      const px = new Uint32Array(img.data.buffer);
      for (let i = 0; i < px.length; i++) {
        const v = (Math.random() * 255) | 0;
        px[i] = (((v > 200 ? 90 : 40) << 24) | (v << 16) | (v << 8) | v) >>> 0;
      }
      ctx.putImageData(img, 0, 0);
      // Редкие пылинки и волоски
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      for (let k = 0; k < 3; k++) {
        if (Math.random() < 0.35) {
          const x = Math.random() * w, y = Math.random() * h;
          ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
        }
      }
      if (Math.random() < 0.08) {
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1;
        ctx.beginPath();
        const x = Math.random() * w, y = Math.random() * h;
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 6, y + 4, x + 3 + Math.random() * 8, y + 10);
        ctx.stroke();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return (
    <div className="film-fx" aria-hidden="true">
      <style>{`
        .film-fx{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:5}
        .film-fx canvas{position:absolute;inset:0;width:100%;height:100%;opacity:.22;mix-blend-mode:overlay}
        .film-fx .flick{position:absolute;inset:0;background:#000;animation:film-flick 1.7s steps(1,end) infinite}
        .film-fx .vig{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 45%,rgba(0,0,0,.65) 100%)}
        .film-fx .scr{position:absolute;top:0;bottom:0;width:1px;background:rgba(255,255,255,.35);opacity:0}
        .film-fx .s1{left:23%;animation:film-scr 4.3s steps(1,end) infinite}
        .film-fx .s2{left:71%;animation:film-scr 6.1s steps(1,end) 1.2s infinite}
        .film-fx .s3{left:48%;animation:film-scr 9s steps(1,end) 3s infinite}
        .film-fx .weave{position:absolute;inset:0;animation:film-weave 0.9s steps(1,end) infinite}
        @keyframes film-flick{0%{opacity:.05}8%{opacity:.14}15%{opacity:.03}31%{opacity:.1}44%{opacity:.04}57%{opacity:.16}70%{opacity:.05}84%{opacity:.11}100%{opacity:.05}}
        @keyframes film-scr{0%{opacity:.7;transform:translateX(0)}6%{opacity:.4;transform:translateX(3px)}12%{opacity:0}100%{opacity:0}}
        @keyframes film-weave{0%{transform:translate(0,0)}25%{transform:translate(1px,-1px)}50%{transform:translate(-1px,0)}75%{transform:translate(0,1px)}100%{transform:translate(0,0)}}
        @media (prefers-reduced-motion:reduce){.film-fx .flick,.film-fx .weave{animation:none;opacity:0}}
      `}</style>
      <canvas ref={ref} />
      <div className="flick" />
      <div className="scr s1" /><div className="scr s2" /><div className="scr s3" />
      <div className="vig" />
    </div>
  );
};
