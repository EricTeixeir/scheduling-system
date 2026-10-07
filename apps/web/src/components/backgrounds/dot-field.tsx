// Adapted from React Bits "Dot Field" (MIT + Commons Clause, Copyright (c) 2026 David Haz); see LICENSE-react-bits.md.
import { useEffect, useRef } from 'react';

import type { Rgb255 } from './css-color';

const DOT_RADIUS = 0.75;
const DOT_STEP = 15.5;
const CURSOR_RADIUS = 500;
const BULGE_STRENGTH = 67;
const GLOW_RADIUS = 160;
const ACCENT_ALPHA = 0.3;
const BASE_ALPHA = 0.08;
const GLOW_ALPHA = 0.18;
const SPEED_SAMPLE_MS = 20;
const REST_DISTANCE = 0.05;

export interface DotFieldColors {
  readonly accent: Rgb255;
  readonly base: Rgb255;
}

interface Dot {
  readonly ax: number;
  readonly ay: number;
  x: number;
  y: number;
}

interface Mouse {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  speed: number;
}

function rgba([red, green, blue]: Rgb255, alpha: number): string {
  return `rgba(${String(red)},${String(green)},${String(blue)},${String(alpha)})`;
}

function buildDots(width: number, height: number): Dot[] {
  const cols = Math.floor(width / DOT_STEP);
  const rows = Math.floor(height / DOT_STEP);
  const padX = (width % DOT_STEP) / 2 + DOT_STEP / 2;
  const padY = (height % DOT_STEP) / 2 + DOT_STEP / 2;
  const dots: Dot[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const ax = padX + col * DOT_STEP;
      const ay = padY + row * DOT_STEP;
      dots.push({ ax, ay, x: ax, y: ay });
    }
  }
  return dots;
}

function moveDots(dots: readonly Dot[], mouse: Mouse, engagement: number): boolean {
  let moving = false;
  for (const dot of dots) {
    const dx = mouse.x - dot.ax;
    const dy = mouse.y - dot.ay;
    const distance = Math.hypot(dx, dy);
    let targetX = dot.ax;
    let targetY = dot.ay;
    let easing = 0.1;
    if (distance < CURSOR_RADIUS && engagement > 0.01) {
      const closeness = 1 - distance / CURSOR_RADIUS;
      const push = closeness * closeness * BULGE_STRENGTH * engagement;
      const angle = Math.atan2(dy, dx);
      targetX -= Math.cos(angle) * push;
      targetY -= Math.sin(angle) * push;
      easing = 0.15;
    }
    dot.x += (targetX - dot.x) * easing;
    dot.y += (targetY - dot.y) * easing;
    if (Math.abs(dot.x - dot.ax) > REST_DISTANCE || Math.abs(dot.y - dot.ay) > REST_DISTANCE) {
      moving = true;
    }
  }
  return moving;
}

function drawField(
  context: CanvasRenderingContext2D,
  dots: readonly Dot[],
  mouse: Mouse,
  glow: number,
  { accent, base }: DotFieldColors,
  width: number,
  height: number,
) {
  context.clearRect(0, 0, width, height);
  if (glow > 0.01) {
    const halo = context.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, GLOW_RADIUS);
    halo.addColorStop(0, rgba(accent, GLOW_ALPHA * glow));
    halo.addColorStop(1, rgba(accent, 0));
    context.fillStyle = halo;
    context.fillRect(
      mouse.x - GLOW_RADIUS,
      mouse.y - GLOW_RADIUS,
      GLOW_RADIUS * 2,
      GLOW_RADIUS * 2,
    );
  }
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, rgba(accent, ACCENT_ALPHA));
  gradient.addColorStop(1, rgba(base, BASE_ALPHA));
  context.fillStyle = gradient;
  context.beginPath();
  for (const dot of dots) {
    context.moveTo(dot.x + DOT_RADIUS, dot.y);
    context.arc(dot.x, dot.y, DOT_RADIUS, 0, Math.PI * 2);
  }
  context.fill();
}

interface DotFieldProps {
  readonly readColors: () => DotFieldColors;
}

export function DotField({ readColors }: DotFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const colors = readColors();

    let dots: Dot[] = [];
    let width = 0;
    let height = 0;
    const mouse: Mouse = { x: -9999, y: -9999, prevX: -9999, prevY: -9999, speed: 0 };
    let engagement = 0;
    let glow = 0;
    let frame = 0;

    const render = () => {
      engagement += (Math.min(mouse.speed / 5, 1) - engagement) * 0.06;
      if (engagement < 0.001) engagement = 0;
      glow += (engagement - glow) * 0.08;
      if (glow < 0.001) glow = 0;
      const moving = moveDots(dots, mouse, engagement);
      drawField(context, dots, mouse, glow, colors, width, height);
      frame = moving || engagement > 0 || glow > 0 ? requestAnimationFrame(render) : 0;
    };
    const wake = () => {
      if (frame === 0) frame = requestAnimationFrame(render);
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      ({ width, height } = canvas.getBoundingClientRect());
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      dots = buildDots(width, height);
      drawField(context, dots, mouse, glow, colors, width, height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const sampleSpeed = setInterval(() => {
      const distance = Math.hypot(mouse.prevX - mouse.x, mouse.prevY - mouse.y);
      mouse.speed += (distance - mouse.speed) * 0.5;
      if (mouse.speed < 0.001) mouse.speed = 0;
      mouse.prevX = mouse.x;
      mouse.prevY = mouse.y;
    }, SPEED_SAMPLE_MS);

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      mouse.x = event.clientX;
      mouse.y = event.clientY;
      wake();
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      clearInterval(sampleSpeed);
      observer.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, [readColors]);

  return <canvas ref={canvasRef} className="size-full" />;
}
