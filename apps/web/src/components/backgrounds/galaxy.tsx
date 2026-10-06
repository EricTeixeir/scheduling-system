// Adapted from React Bits "Galaxy" (MIT + Commons Clause, Copyright (c) 2026 David Haz); see LICENSE-react-bits.md.
import { Color, Mesh, Program, Renderer, Triangle } from 'ogl';
import { useEffect, useRef } from 'react';

import { logger } from '@/lib/logger';

const VERTEX_SHADER = `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform float uTime;
uniform vec3 uResolution;
uniform float uStarSpeed;
uniform vec3 uStarColor;
uniform vec2 uMouse;
uniform float uMouseActiveFactor;

varying vec2 vUv;

#define NUM_LAYER 4.0
#define MAT45 mat2(0.7071, -0.7071, 0.7071, 0.7071)
#define PERIOD 3.0
#define GLOW 0.3
#define TWINKLE 0.3
#define ROTATION_SPEED 0.08
#define REPULSION 2.0

float Hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float tri(float x) { return abs(fract(x) * 2.0 - 1.0); }

float tris(float x) {
  float t = fract(x);
  return 1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0));
}

float trisn(float x) {
  float t = fract(x);
  return 2.0 * (1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0))) - 1.0;
}

float Star(vec2 uv, float flare) {
  float d = length(uv);
  float m = (0.05 * GLOW) / d;
  float rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * flare * GLOW;
  uv *= MAT45;
  rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * 0.3 * flare * GLOW;
  m *= smoothstep(1.0, 0.2, d);
  return m;
}

vec3 StarLayer(vec2 uv) {
  vec3 col = vec3(0.0);
  vec2 gv = fract(uv) - 0.5;
  vec2 id = floor(uv);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 si = id + offset;
      float seed = Hash21(si);
      float size = fract(seed * 345.32);
      float flareSize = smoothstep(0.9, 1.0, size) * tri(uStarSpeed / (PERIOD * seed + 1.0));
      vec2 pad = vec2(tris(seed * 34.0 + uTime / 10.0), tris(seed * 38.0 + uTime / 30.0)) - 0.5;
      float star = Star(gv - offset - pad, flareSize);
      star *= mix(1.0, trisn(uTime + seed * 6.2831) * 0.5 + 1.0, TWINKLE);
      col += star * size * mix(uStarColor, vec3(1.0), 0.25 * seed);
    }
  }
  return col;
}

void main() {
  vec2 focalPx = vec2(0.5) * uResolution.xy;
  vec2 uv = (vUv * uResolution.xy - focalPx) / uResolution.y;
  vec2 mousePosUV = (uMouse * uResolution.xy - focalPx) / uResolution.y;
  vec2 repulsion = normalize(uv - mousePosUV) * (REPULSION / (length(uv - mousePosUV) + 0.1));
  uv += repulsion * 0.05 * uMouseActiveFactor;
  float angle = uTime * ROTATION_SPEED;
  uv = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * uv;

  vec3 col = vec3(0.0);
  for (float i = 0.0; i < 1.0; i += 1.0 / NUM_LAYER) {
    float depth = fract(i + uStarSpeed);
    float scale = mix(20.0, 0.5, depth);
    float fade = depth * smoothstep(1.0, 0.9, depth);
    col += StarLayer(uv * scale + i * 453.32) * fade;
  }
  gl_FragColor = vec4(col, smoothstep(0.0, 0.3, length(col)));
}
`;

const STAR_SPEED = 0.5;
const MOUSE_EASING = 0.05;

export type Rgb = readonly [number, number, number];

interface GalaxyProps {
  readonly readStarColor: () => Rgb;
  readonly animated: boolean;
  readonly interactive: boolean;
}

export function Galaxy({ readStarColor, animated, interactive }: GalaxyProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: Renderer;
    try {
      renderer = new Renderer({ alpha: true, premultipliedAlpha: false });
    } catch (error) {
      logger.warn('Galaxy background disabled: WebGL is unavailable', { error });
      return;
    }
    const { gl } = renderer;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    const uniforms = {
      uTime: { value: 0 },
      uResolution: { value: new Color(1, 1, 1) },
      uStarSpeed: { value: 0 },
      uStarColor: { value: new Color(...readStarColor()) },
      uMouse: { value: new Float32Array([0.5, 0.5]) },
      uMouseActiveFactor: { value: 0 },
    };
    const program = new Program(gl, {
      vertex: VERTEX_SHADER,
      fragment: FRAGMENT_SHADER,
      uniforms,
    });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    const resize = () => {
      renderer.setSize(container.offsetWidth, container.offsetHeight);
      uniforms.uResolution.value = new Color(
        gl.canvas.width,
        gl.canvas.height,
        gl.canvas.width / gl.canvas.height,
      );
    };
    resize();
    window.addEventListener('resize', resize);
    container.appendChild(gl.canvas);

    const target = { x: 0.5, y: 0.5, active: 0 };
    const smooth = { x: 0.5, y: 0.5, active: 0 };
    const onPointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      target.x = (event.clientX - rect.left) / rect.width;
      target.y = 1 - (event.clientY - rect.top) / rect.height;
      target.active = 1;
    };
    const onPointerLeave = () => {
      target.active = 0;
    };
    if (interactive) {
      window.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerleave', onPointerLeave);
    }

    let frame = 0;
    const render = (time: number) => {
      if (animated) {
        uniforms.uTime.value = time * 0.001;
        uniforms.uStarSpeed.value = (time * 0.001 * STAR_SPEED) / 10;
        frame = requestAnimationFrame(render);
      }
      smooth.x += (target.x - smooth.x) * MOUSE_EASING;
      smooth.y += (target.y - smooth.y) * MOUSE_EASING;
      smooth.active += (target.active - smooth.active) * MOUSE_EASING;
      const mouse = uniforms.uMouse.value;
      mouse[0] = smooth.x;
      mouse[1] = smooth.y;
      uniforms.uMouseActiveFactor.value = smooth.active;
      renderer.render({ scene: mesh });
    };
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onPointerLeave);
      container.removeChild(gl.canvas);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [readStarColor, animated, interactive]);

  return <div ref={containerRef} className="size-full" />;
}
