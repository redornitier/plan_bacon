/** Decorative only: the native range and CSS remain usable without canvas/WebGL. */
interface Spark {
  x: number; y: number; vx: number; vy: number; life: number; duration: number;
  size: number; angle: number; spin: number; herb: boolean;
}
interface Steam { x: number; y: number; life: number; duration: number; phase: number; width: number }

const fragmentShader = `precision mediump float;
uniform vec2 size; uniform float value; uniform float time;
void main() {
  vec2 uv=gl_FragCoord.xy/size; float x=uv.x; float y=uv.y;
  float swirl=sin(x*19.-time*2.+sin(y*6.+time))*.5+.5;
  float ribbon=exp(-pow((y-.5-sin(x*13.-time*1.8)*.18)*4.,2.));
  float glint=exp(-pow((x-value+.018)*14.,2.));
  vec3 base=mix(vec3(.48,.19,.10),vec3(.96,.43,.16),clamp(x/max(value,.01),0.,1.));
  float bubbles=0.;
  for(int i=0;i<11;i++) {
    float n=float(i); vec2 c=vec2(fract(n*.173+.07),.2+fract(n*.317+time*(.12+n*.003))*.66);
    vec2 d=(uv-c)*vec2(7.,1.); float r=.06+.025*sin(n*3.+time*2.);
    bubbles+=exp(-pow((length(d)-r)*60.,2.))*.20;
  }
  vec3 col=base+vec3(.38,.24,.09)*(swirl*.34+ribbon*.7+glint*.8+bubbles);
  gl_FragColor=vec4(col,1.-smoothstep(value-.012,value+.003,x));
}`;

function createLiquid(canvas: HTMLCanvasElement) {
  let gl: WebGLRenderingContext | null = null;
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  const shaders: WebGLShader[] = [];
  let lost = false;
  const dispose = () => {
    canvas.removeEventListener('webglcontextlost', onLost);
    if (gl) {
      shaders.forEach(shader => gl!.deleteShader(shader));
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      // React StrictMode can immediately mount another effect on this same canvas.
      // Free our GPU objects without invalidating the reusable context.
    }
  };
  function onLost() { lost = true; canvas.style.display = 'none'; }
  try {
    gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false });
    if (!gl) throw new Error('WebGL unavailable');
    const compile = (type: number, source: string) => {
      const shader = gl!.createShader(type);
      if (!shader) throw new Error('Shader unavailable');
      shaders.push(shader); gl!.shaderSource(shader, source); gl!.compileShader(shader);
      if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) throw new Error('Shader compilation failed');
      return shader;
    };
    program = gl.createProgram();
    if (!program) throw new Error('Program unavailable');
    gl.attachShader(program, compile(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentShader));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Program linking failed');
    gl.useProgram(program);
    buffer = gl.createBuffer();
    if (!buffer) throw new Error('Buffer unavailable');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const size = gl.getUniformLocation(program, 'size');
    const value = gl.getUniformLocation(program, 'value');
    const time = gl.getUniformLocation(program, 'time');
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.style.display = '';
    return {
      draw(now: number, fraction: number) {
        if (lost || gl!.isContextLost()) return;
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(1, Math.round(rect.width * dpr)), h = Math.max(1, Math.round(rect.height * dpr));
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl!.viewport(0, 0, w, h); }
        gl!.uniform2f(size, w, h);
        gl!.uniform1f(value, (20 + fraction * Math.max(0, rect.width - 40)) / Math.max(1, rect.width));
        gl!.uniform1f(time, now / 1000); gl!.drawArrays(gl!.TRIANGLES, 0, 6);
      }, dispose,
    };
  } catch {
    dispose(); canvas.style.display = 'none';
    return { draw() {}, dispose() {} };
  }
}

export function createRatingEffects(card: HTMLElement) {
  // Nonvisual environments and older browsers need no animation polyfills.
  if (!window.matchMedia || !window.requestAnimationFrame || !window.ResizeObserver) {
    return { update(_value: number | null, _band: number, _react: boolean) {}, dispose() {} };
  }
  const range = card.querySelector<HTMLInputElement>('input[type=range]')!;
  const canvas = card.querySelector<HTMLCanvasElement>('.bacon-cooking')!;
  const liquid = createLiquid(card.querySelector<HTMLCanvasElement>('.bacon-liquid')!);
  const context = canvas.getContext('2d');
  const plate = card.querySelector<HTMLElement>('.bacon-plate')!;
  const score = card.querySelector<HTMLElement>('.bacon-score')!;
  const output = card.querySelector<HTMLOutputElement>('output')!;
  const phrase = card.querySelector<HTMLElement>('.bacon-phrase')!;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let rating: number | null = null, previousBand = -1;
  let sparks: Spark[] = [], steam: Steam[] = [];
  let frame = 0, endTime = 0, effectsUntil = 0, previousFrame = 0, lastSteam = 0, lastSpark = 0;
  let disposed = false;
  let phraseAnimation: Animation | undefined, scoreAnimation: Animation | undefined, plateAnimation: Animation | undefined;
  const colors = { steam: '#9b7655', spark: '#b85e20', herb: '#637247' };

  function geometry() {
    const r = card.getBoundingClientRect(), s = range.getBoundingClientRect(), p = score.getBoundingClientRect();
    return { w: r.width, h: r.height, thumbX: s.left - r.left + 20 + ((Number(range.value) - 1) / 99) * (s.width - 40),
      trackY: s.top - r.top + s.height / 2, plateX: p.left - r.left + p.width / 2, plateY: p.top - r.top + 70 };
  }
  function particle(x: number, y: number, burst = false) {
    sparks.push({ x, y, vx: (Math.random() - .5) * (burst ? 150 : 40), vy: -(burst ? 70 + Math.random() * 120 : 30 + Math.random() * 50),
      life: 0, duration: burst ? 1400 + Math.random() * 900 : 700 + Math.random() * 600,
      size: burst ? 2 + Math.random() * 3 : 1 + Math.random() * 1.6, angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - .5) * 6, herb: burst && Math.random() > .6 });
  }
  function drawCooking(now: number) {
    if (!context) { sparks = []; steam = []; return; }
    const g = geometry(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(g.w * dpr), h = Math.round(g.h * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = context;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, g.w, g.h);
    if (reduced.matches) { sparks = []; steam = []; return; }
    const dt = Math.min(40, previousFrame ? now - previousFrame : 16); previousFrame = now;
    if (now < effectsUntil && rating !== null && rating > 35 && now - lastSteam > 190) {
      lastSteam = now;
      steam.push({ x: g.thumbX + (Math.random() - .5) * 16, y: g.trackY - 20, life: 0,
        duration: 950 + rating * 8, phase: Math.random() * Math.PI * 2, width: 1.4 + Math.random() * 2 });
    }
    if (now < effectsUntil && rating !== null && rating > 75 && now - lastSpark > 120) {
      lastSpark = now; particle(g.thumbX + (Math.random() - .5) * 25, g.trackY - 15);
    }
    steam = steam.filter(p => p.life < p.duration).slice(-18);
    sparks = sparks.filter(p => p.life < p.duration).slice(-85);
    for (const p of steam) {
      p.life += dt; const t = Math.min(1, p.life / p.duration);
      ctx.save(); ctx.globalAlpha = Math.sin(Math.PI * t) * .34; ctx.strokeStyle = colors.steam;
      ctx.lineWidth = p.width * (1 + t * .8); ctx.lineCap = 'round'; ctx.shadowBlur = 8; ctx.shadowColor = colors.steam;
      ctx.beginPath();
      for (let j = 0; j <= 18; j++) {
        const v = j / 18, x = p.x + Math.sin(v * 5.5 + t * 4 + p.phase) * (7 + 15 * t) * v, y = p.y - t * 70 - v * (18 + 34 * t);
        if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke(); ctx.restore();
    }
    for (const p of sparks) {
      p.life += dt; p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000; p.vy += (p.herb ? 75 : 12) * dt / 1000; p.angle += p.spin * dt / 1000;
      const t = Math.min(1, p.life / p.duration);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle); ctx.globalAlpha = Math.min(1, (1 - t) * 2);
      ctx.fillStyle = p.herb ? colors.herb : colors.spark; ctx.shadowBlur = p.herb ? 0 : 9; ctx.shadowColor = colors.spark;
      ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.herb ? p.size * .38 : p.size * .68, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
  function tick(now: number) {
    if (disposed) return;
    liquid.draw(reduced.matches ? 0 : now, ((rating ?? 50) - 1) / 99);
    drawCooking(now);
    if (!reduced.matches && !document.hidden && (now < endTime || sparks.length || steam.length)) frame = window.requestAnimationFrame(tick);
    else { frame = 0; previousFrame = 0; }
  }
  function redraw() {
    if (!disposed && !document.hidden && !frame) frame = window.requestAnimationFrame(tick);
  }
  function stop() {
    window.cancelAnimationFrame(frame); frame = 0; previousFrame = 0; endTime = 0; effectsUntil = 0; sparks = []; steam = [];
    phraseAnimation?.cancel(); scoreAnimation?.cancel(); plateAnimation?.cancel();
    context?.clearRect(0, 0, canvas.width, canvas.height);
  }
  function visibility() { stop(); if (!document.hidden) redraw(); }
  function motion() { stop(); redraw(); }
  const resize = new window.ResizeObserver(redraw);
  resize.observe(card);
  reduced.addEventListener('change', motion);
  document.addEventListener('visibilitychange', visibility);

  return {
    update(value: number | null, band: number, react: boolean) {
      const previous = rating, changedBand = band !== previousBand || react && value === rating;
      rating = value; previousBand = band;
      if (react && !reduced.matches && !document.hidden && value !== null) {
        const now = performance.now(), g = geometry();
        endTime = now + 3200; effectsUntil = now + 1100 + value * 8;
        if (changedBand) {
          phraseAnimation?.cancel(); scoreAnimation?.cancel();
          phraseAnimation = phrase.animate?.([
            { transform: `translateY(${value >= (previous ?? 0) ? 16 : -16}px) rotate(-2deg) scale(.92)`, opacity: .1 },
            { transform: 'translateY(-3px) rotate(1deg) scale(1.04)', opacity: 1, offset: .65 },
            { transform: 'translateY(0) rotate(0) scale(1)', opacity: 1 },
          ], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
          scoreAnimation = output.animate?.([{ transform: 'scale(.93)' }, { transform: 'scale(1.06)', offset: .5 }, { transform: 'scale(1)' }], { duration: 310 });
        }
        if (value === 100 && previous !== 100) {
          for (let i = 0; i < 38; i++) particle(g.plateX + (Math.random() - .5) * 110, g.plateY + 35, true);
          plateAnimation?.cancel();
          plateAnimation = plate.animate?.([{ transform: 'rotate(-8deg) scale(1)' }, { transform: 'rotate(2deg) scale(1.06)', offset: .4 }, { transform: 'rotate(-8deg) scale(1)' }], { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' });
        } else if (changedBand && value >= 76) for (let i = 0; i < 9; i++) particle(g.thumbX, g.trackY - 15);
        if (value > (previous ?? 0) && changedBand) for (let i = 0; i < 3; i++) steam.push({ x: g.plateX + (i - 1) * 34, y: g.plateY - 45, life: i * 80, duration: 1600, phase: Math.random() * Math.PI * 2, width: 2.8 });
      } else stop();
      redraw();
    },
    dispose() {
      disposed = true; stop(); resize.disconnect(); reduced.removeEventListener('change', motion);
      document.removeEventListener('visibilitychange', visibility); liquid.dispose();
    },
  };
}
