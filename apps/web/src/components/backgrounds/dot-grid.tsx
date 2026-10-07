// Adapted from React Bits "Dot Grid" (MIT + Commons Clause, Copyright (c) 2026 David Haz); see LICENSE-react-bits.md.
import { useEffect, useRef } from 'react';

import type { Rgb255 } from './css-color';

const DOT_RADIUS = 2.5;
const GAP = 11;
const PROXIMITY = 120;
const SPEED_TRIGGER = 100;
const MAX_SPEED = 5000;
const SHOCK_RADIUS = 180;
const SHOCK_STRENGTH = 12;
const STIFFNESS = 60;
const DAMPING = 4.7;
const REST_THRESHOLD = 0.05;
const MAX_STEP_SECONDS = 1 / 30;

interface Dot {
  readonly cx: number;
  readonly cy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Pointer {
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  lastTime: number;
}

function buildDots(width: number, height: number): Dot[] {
  const cell = DOT_RADIUS * 2 + GAP;
  const cols = Math.floor((width + GAP) / cell);
  const rows = Math.floor((height + GAP) / cell);
  const startX = (width - (cell * cols - GAP)) / 2 + DOT_RADIUS;
  const startY = (height - (cell * rows - GAP)) / 2 + DOT_RADIUS;
  const dots: Dot[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      dots.push({ cx: startX + col * cell, cy: startY + row * cell, x: 0, y: 0, vx: 0, vy: 0 });
    }
  }
  return dots;
}

// Damped spring pulling each offset back to 0; tuned to settle in about 1.7 s with a small overshoot.
function stepSprings(dots: readonly Dot[], seconds: number): boolean {
  let moving = false;
  for (const dot of dots) {
    dot.vx += (-STIFFNESS * dot.x - DAMPING * dot.vx) * seconds;
    dot.vy += (-STIFFNESS * dot.y - DAMPING * dot.vy) * seconds;
    dot.x += dot.vx * seconds;
    dot.y += dot.vy * seconds;
    const resting =
      Math.abs(dot.x) < REST_THRESHOLD &&
      Math.abs(dot.y) < REST_THRESHOLD &&
      Math.abs(dot.vx) < REST_THRESHOLD &&
      Math.abs(dot.vy) < REST_THRESHOLD;
    if (resting) {
      dot.x = dot.y = dot.vx = dot.vy = 0;
    } else {
      moving = true;
    }
  }
  return moving;
}

function rgb([red, green, blue]: Rgb255): string {
  return `rgb(${String(red)},${String(green)},${String(blue)})`;
}

function mix(from: Rgb255, to: Rgb255, amount: number): Rgb255 {
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * amount);
  return [lerp(from[0], to[0]), lerp(from[1], to[1]), lerp(from[2], to[2])];
}

function drawDots(
  context: CanvasRenderingContext2D,
  dots: readonly Dot[],
  pointer: Pointer,
  { base, active }: DotColors,
) {
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  const near: { dot: Dot; closeness: number }[] = [];
  context.beginPath();
  for (const dot of dots) {
    const distance = Math.hypot(dot.cx - pointer.x, dot.cy - pointer.y);
    if (distance <= PROXIMITY) {
      near.push({ dot, closeness: 1 - distance / PROXIMITY });
      continue;
    }
    context.moveTo(dot.cx + dot.x + DOT_RADIUS, dot.cy + dot.y);
    context.arc(dot.cx + dot.x, dot.cy + dot.y, DOT_RADIUS, 0, Math.PI * 2);
  }
  context.fillStyle = rgb(base);
  context.fill();
  for (const { dot, closeness } of near) {
    context.beginPath();
    context.arc(dot.cx + dot.x, dot.cy + dot.y, DOT_RADIUS, 0, Math.PI * 2);
    context.fillStyle = rgb(mix(base, active, closeness));
    context.fill();
  }
}

export interface DotColors {
  readonly base: Rgb255;
  readonly active: Rgb255;
}

interface DotGridProps {
  readonly readColors: () => DotColors;
}

export function DotGrid({ readColors }: DotGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const colors = readColors();

    let dots: Dot[] = [];
    const pointer: Pointer = { x: -PROXIMITY, y: -PROXIMITY, lastX: 0, lastY: 0, lastTime: 0 };
    let frame = 0;
    let lastFrameTime = 0;

    const render = (time: number) => {
      const seconds = Math.min((time - lastFrameTime) / 1000, MAX_STEP_SECONDS);
      lastFrameTime = time;
      const moving = stepSprings(dots, seconds);
      drawDots(context, dots, pointer, colors);
      frame = moving ? requestAnimationFrame(render) : 0;
    };
    const wake = () => {
      if (frame !== 0) return;
      lastFrameTime = performance.now();
      frame = requestAnimationFrame(render);
    };

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      dots = buildDots(width, height);
      wake();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const push = (dot: Dot, vx: number, vy: number) => {
      dot.vx += vx;
      dot.vy += vy;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const elapsed = pointer.lastTime ? event.timeStamp - pointer.lastTime : 16;
      let vx = ((event.clientX - pointer.lastX) / Math.max(elapsed, 1)) * 1000;
      let vy = ((event.clientY - pointer.lastY) / Math.max(elapsed, 1)) * 1000;
      const speed = Math.hypot(vx, vy);
      if (speed > MAX_SPEED) {
        vx *= MAX_SPEED / speed;
        vy *= MAX_SPEED / speed;
      }
      Object.assign(pointer, {
        x: event.clientX,
        y: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        lastTime: event.timeStamp,
      });
      if (speed > SPEED_TRIGGER) {
        for (const dot of dots) {
          const dx = dot.cx - pointer.x;
          const dy = dot.cy - pointer.y;
          if (Math.hypot(dx, dy) < PROXIMITY) push(dot, dx + vx * 0.005, dy + vy * 0.005);
        }
      }
      wake();
    };

    const onClick = (event: MouseEvent) => {
      for (const dot of dots) {
        const dx = dot.cx - event.clientX;
        const dy = dot.cy - event.clientY;
        const falloff = Math.max(0, 1 - Math.hypot(dx, dy) / SHOCK_RADIUS);
        if (falloff > 0) push(dot, dx * SHOCK_STRENGTH * falloff, dy * SHOCK_STRENGTH * falloff);
      }
      wake();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('click', onClick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('click', onClick);
    };
  }, [readColors]);

  return <canvas ref={canvasRef} className="size-full" />;
}
