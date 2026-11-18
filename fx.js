/* Motion layer. Everything here is decoration on top of a page that works without it:
   background particles, the hero intro, scroll-linked effects, tilting cards, magnetic buttons, the cursor ring.
   One animation loop (tick) drives all of it and only writes transform / opacity. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const html = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const outCubic = k => 1 - Math.pow(1 - k, 3);
  const TAU = Math.PI * 2;

  /* ---------- "Pause motion" button in the footer ---------- */
  let still = false;
  const toggle = $('#motionToggle');
  if (toggle) toggle.addEventListener('click', () => {
    still = !still;
    html.classList.toggle('still', still);
    toggle.setAttribute('aria-pressed', still);
    toggle.textContent = still ? 'Play motion' : 'Pause motion';
  });

  /* ---------- Split text into letters ---------- */
  const splitChars = (el, cls, startAt = 0) => {
    let n = startAt;
    const walk = node => [...node.childNodes].forEach(c => {
      if (c.nodeType !== 3) return walk(c);
      const frag = document.createDocumentFragment();
      [...c.textContent].forEach(ch => {
        if (ch === '\n') return;
        const s = document.createElement('span');
        s.className = cls; s.textContent = ch; s.style.setProperty('--c', n++); s.setAttribute('aria-hidden', 'true');
        frag.append(s);
      });
      c.replaceWith(frag);
    });
    walk(el);
    return n;
  };

  // Section titles rise letter by letter
  $$('[data-split]').forEach(h => { h.setAttribute('aria-label', h.textContent); splitChars(h, 'ch'); });
  $$('[data-split] .ch').forEach(s => { s.style.whiteSpace = 'pre'; });

  // Hero headline: letters sharpen out of a blur, one after another
  const rise = $('[data-rise]');
  if (rise) { let n = 0; $$('.line', rise).forEach(line => { [...line.childNodes].forEach(c => { if (c.nodeType === 3) c.textContent = c.textContent.trim(); }); n = splitChars(line, 'hc', n); }); }

  // "Hello, I'm Zackaryaa." — every letter spirals in from a vortex and lands in place
  const hello = $('[data-vortex]');
  if (hello && !reduce) {
    hello.setAttribute('aria-label', hello.textContent);
    splitChars(hello, 'vc');
    const play = () => $$('.vc', hello).forEach((s, i) => {
      const a0 = Math.random() * TAU, R = 150 + Math.random() * 190, turns = 1.5 + Math.random() * 0.9, frames = [], N = 18;
      for (let k = 0; k <= N; k++) {
        const u = k / N, e = outCubic(u), r = R * (1 - e), a = a0 + (1 - e) * turns * TAU;
        frames.push({ offset: u, opacity: Math.min(1, u * 2.4),
          transform: `translate(${(Math.cos(a) * r).toFixed(1)}px, ${(Math.sin(a) * r * 0.62).toFixed(1)}px) rotate(${((1 - e) * 260).toFixed(0)}deg) scale(${(0.25 + 0.75 * e).toFixed(3)})` });
      }
      s.animate(frames, { duration: 1700, delay: 150 + i * 48, easing: 'linear', fill: 'backwards' });
    });
    // start once the page has finished its first paint (main.js adds "loaded" to <body>)
    if (document.body.classList.contains('loaded')) play();
    else new MutationObserver((_, mo) => { if (document.body.classList.contains('loaded')) { mo.disconnect(); play(); } }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  /* ---------- Stagger: rows get a small delay, and every delay is cleared once the element has appeared ---------- */
  $$('.index li').forEach((li, i) => li.style.setProperty('--i', i % 5));
  const settleIO = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    settleIO.unobserve(e.target);
    setTimeout(() => e.target.style.setProperty('--i', 0), 2200);
  }));
  $$('[data-reveal]').forEach(el => { if (el.style.getPropertyValue('--i')) settleIO.observe(el); });

  /* ---------- Small interactions ---------- */
  // Big "copy my email" button
  const copyBig = $('#copyBig');
  if (copyBig) copyBig.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(copyBig.dataset.copy); } catch { return; }
    const label = $('span', copyBig);
    label.textContent = 'Copied to clipboard';
    setTimeout(() => { label.textContent = 'Copy my email'; }, 1800);
  });

  /* ==========================================================
     Pointer state shared by everything below
     ========================================================== */
  const ptr = { x: -9999, y: -9999, active: false, mouse: false };
  addEventListener('pointermove', e => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.active = true; ptr.mouse = e.pointerType === 'mouse'; }, { passive: true });
  addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') ptr.active = false; }, { passive: true });
  addEventListener('pointercancel', () => { ptr.active = false; }, { passive: true });
  document.addEventListener('mouseleave', () => { ptr.active = false; });

  /* ---------- Tilt cards: lean toward the pointer or finger ---------- */
  const tilts = reduce ? [] : $$('[data-tilt]').map(el => {
    const glare = document.createElement('span');
    glare.className = 'glare'; glare.innerHTML = '<i></i>'; glare.setAttribute('aria-hidden', 'true');
    el.appendChild(glare);
    const t = { el, light: glare.firstChild, max: +el.dataset.tilt || 6,
      rx: 0, ry: 0, vx: 0, vy: 0, tx: 0, ty: 0, s: 1, ts: 1, vs: 0, hot: false, down: false, str: '' };
    const lean = e => {
      const r = el.getBoundingClientRect();
      const nx = clamp((e.clientX - r.left) / r.width) - 0.5, ny = clamp((e.clientY - r.top) / r.height) - 0.5;
      t.ty = nx * 2 * t.max; t.tx = -ny * 2 * t.max; t.hot = true; el.classList.add('hot');
      t.light.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px)`;
    };
    const rest = () => { t.tx = t.ty = 0; t.ts = 1; t.hot = t.down = false; el.classList.remove('hot'); };
    el.addEventListener('pointerdown', e => { t.down = true; t.ts = 0.985; lean(e); });
    el.addEventListener('pointermove', e => { if (e.pointerType !== 'touch' || t.down) lean(e); });
    el.addEventListener('pointerup', e => { t.ts = 1; t.down = false; if (e.pointerType === 'touch') rest(); });
    el.addEventListener('pointerleave', rest);
    el.addEventListener('pointercancel', rest);
    return t;
  });

  /* ---------- Magnetic buttons (mouse only) ---------- */
  const magnets = (reduce || !fine) ? [] : $$('[data-magnet]').map(el => ({ el, x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, str: '' }));
  if (magnets.length) addEventListener('pointermove', e => {
    for (const m of magnets) {
      const r = m.el.getBoundingClientRect(), pad = 26;
      const inside = e.clientX > r.left - pad && e.clientX < r.right + pad && e.clientY > r.top - pad && e.clientY < r.bottom + pad;
      m.tx = inside ? (e.clientX - (r.left + r.width / 2) + m.x) * 0.3 : 0;
      m.ty = inside ? (e.clientY - (r.top + r.height / 2) + m.y) * 0.3 : 0;
    }
  }, { passive: true });

  /* ---------- Cursor ring (mouse only) ---------- */
  let cursor = null; const cur = { x: 0, y: 0, vx: 0, vy: 0, s: 1, ts: 1, vs: 0, seen: false };
  if (fine && !reduce) {
    cursor = document.createElement('div');
    cursor.className = 'cursor'; cursor.setAttribute('aria-hidden', 'true'); cursor.innerHTML = '<span></span>';
    document.body.appendChild(cursor);
    const label = cursor.firstChild;
    addEventListener('pointermove', e => {
      if (!cur.seen) { cur.seen = true; cur.x = e.clientX; cur.y = e.clientY; cursor.classList.add('on'); }
      const tag = e.target.closest && e.target.closest('[data-cursor]');
      const link = e.target.closest && e.target.closest('a, button');
      cursor.classList.toggle('label', !!tag); cursor.classList.toggle('link', !tag && !!link);
      if (tag) label.textContent = tag.dataset.cursor;
      cur.ts = tag ? 2.3 : link ? 1.55 : 1;
    }, { passive: true });
    document.addEventListener('mouseleave', () => cursor.classList.remove('on'));
    document.addEventListener('mouseenter', () => { if (cur.seen) cursor.classList.add('on'); });
  }

  /* ==========================================================
     Atmosphere: a deep field of points, links and maths symbols.
     - three depths: far points are soft and out of focus, near ones are crisp
     - points drift along a slow flow field, not in straight lines, and twinkle
     - small pulses of light travel along the links, like data moving through a graph
     - it parallaxes with the scroll, streaks when you scroll fast, and parts around
       the pointer or a finger
     - while the timeline fills, nearby points are pulled into its line
     ========================================================== */
  const atmos = $('#atmos'), ctx = atmos.getContext('2d');
  const GLYPHS = ['∑', 'π', '∀', '∃', '×', '÷', '√', '∞', '→', '∈', '{ }', '0', '1', 'λ', '≤', '∂'];
  const INK = '12,13,16', COBALT = '30,58,240';
  // pre-drawn soft discs: a cobalt halo and an out-of-focus ink blur
  const sprite = (rgb, stops) => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    stops.forEach(([o, a]) => grad.addColorStop(o, `rgba(${rgb},${a})`));
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return c;
  };
  const HALO = sprite(COBALT, [[0, 0.55], [0.25, 0.22], [1, 0]]);
  const BOKEH = sprite(INK, [[0, 0.5], [0.55, 0.38], [0.8, 0.08], [1, 0]]);

  let W = 0, H = 0, parts = [], links = [], pulses = [], feeders = [], motes = [], time = 0, pulseTimer = 0;
  const glow = { x: -9999, y: -9999 };
  const head = { x: 0, y: 0, on: false, flash: 0 };          // the tip of the timeline line, in screen space
  const build = () => {
    const d = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    atmos.width = W * d; atmos.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0);
    const n = Math.round(clamp(W * H / 11000, 30, 140));
    parts = Array.from({ length: n }, (_, i) => {
      const z = 0.25 + Math.random() * 0.75;
      return { x: Math.random() * W, y: Math.random() * (H + 120), z, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6,
        dx: 0, dy: 0, dvx: 0, dvy: 0, sx: 0, sy: 0, blue: i % 5 === 0, far: z < 0.45,
        tw: 0.6 + Math.random() * 1.6, ph: Math.random() * TAU,
        g: i % 8 === 3 ? GLYPHS[Math.floor(Math.random() * GLYPHS.length)] : null, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 0.3 };
    });
  };
  build();
  let resizeT; addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(build, 150); });
  // a click or tap pushes nearby points away (no rings)
  if (!reduce) addEventListener('pointerdown', e => {
    for (const p of parts) {
      const dx = p.sx - e.clientX, dy = p.sy - e.clientY, d = Math.hypot(dx, dy) || 1;
      if (d < 260) { const f = (1 - d / 260) * 480; p.dvx += dx / d * f; p.dvy += dy / d * f; }
    }
  }, { passive: true });

  const feed = n => {                                   // pull n points toward the timeline's tip
    for (let i = 0; i < n && feeders.length < 90; i++) {
      const src = parts[Math.floor(Math.random() * parts.length)];
      const near = Math.hypot(src.sx - head.x, src.sy - head.y) < 760 && src.sy > -20 && src.sy < H + 20;
      const a = Math.random() * TAU, r = 220 + Math.random() * 320;
      const x = near ? src.sx : head.x + Math.cos(a) * r, y = near ? src.sy : head.y + Math.sin(a) * r;
      const bend = (Math.random() - 0.5) * 260;
      feeders.push({ x, y, cx: (x + head.x) / 2 + bend, cy: (y + head.y) / 2 - Math.abs(bend) * 0.6, t: 0, dur: 0.55 + Math.random() * 0.5 });
    }
  };
  const bez = (f, k) => { const u = 1 - k; return [u * u * f.x + 2 * u * k * f.cx + k * k * head.x, u * u * f.y + 2 * u * k * f.cy + k * k * head.y]; };

  const drawAtmos = (dt, sy, vel) => {
    time += dt;
    ctx.clearRect(0, 0, W, H);
    // soft light under the mouse
    if (ptr.active && ptr.mouse) {
      glow.x += (ptr.x - glow.x) * (1 - Math.exp(-dt * 7)); glow.y += (ptr.y - glow.y) * (1 - Math.exp(-dt * 7));
      const g = ctx.createRadialGradient(glow.x, glow.y, 0, glow.x, glow.y, 320);
      g.addColorStop(0, `rgba(${COBALT},.07)`); g.addColorStop(1, `rgba(${COBALT},0)`);
      ctx.fillStyle = g; ctx.fillRect(glow.x - 320, glow.y - 320, 640, 640);
    }
    const span = H + 120, streak = clamp(Math.abs(vel) * 0.014, 0, 30), dir = Math.sign(vel);
    for (const p of parts) {
      // slow flow field: neighbours move in loosely the same direction, so the field feels like one body
      const ang = Math.sin(p.x * 0.0023 + time * 0.09) * Math.cos(p.y * 0.0019 - time * 0.07) * TAU;
      p.x += (p.vx + Math.cos(ang) * 9) * dt * p.z; p.y += (p.vy + Math.sin(ang) * 9) * dt * p.z; p.rot += p.spin * dt;
      if (p.x < -20) p.x += W + 40; else if (p.x > W + 20) p.x -= W + 40;
      p.dvx += (-p.dx * 7 - p.dvx * 3.2) * dt; p.dvy += (-p.dy * 7 - p.dvy * 3.2) * dt;
      p.dx += p.dvx * dt; p.dy += p.dvy * dt;
      p.sx = p.x + p.dx;
      p.sy = ((((p.y - sy * p.z * 0.26) % span) + span) % span) - 60 + p.dy;
      if (ptr.active) {
        const dx = p.sx - ptr.x, dy = p.sy - ptr.y, d = Math.hypot(dx, dy) || 1;
        if (d < 150) { const f = (1 - d / 150) * 1100 * dt * p.z; p.dvx += dx / d * f; p.dvy += dy / d * f; }
      }
    }
    // links between near neighbours (only the in-focus points), and from the mouse
    links = [];
    for (let i = 0; i < parts.length; i++) {
      const a = parts[i]; if (a.g || a.far) continue;
      for (let j = i + 1; j < parts.length; j++) {
        const b = parts[j]; if (b.g || b.far) continue;
        const dx = a.sx - b.sx, dy = a.sy - b.sy, d2 = dx * dx + dy * dy;
        if (d2 > 22500) continue;
        const k = 1 - Math.sqrt(d2) / 150;
        ctx.strokeStyle = `rgba(${COBALT},${k * 0.17})`; ctx.lineWidth = 0.6 + k * 0.6;
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
        if (links.length < 80) links.push(a, b);
      }
      if (ptr.active && ptr.mouse) {
        const dx = a.sx - ptr.x, dy = a.sy - ptr.y, d = Math.hypot(dx, dy);
        if (d < 190) { ctx.strokeStyle = `rgba(${COBALT},${(1 - d / 190) * 0.36})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(ptr.x, ptr.y); ctx.stroke(); }
      }
    }
    ctx.lineWidth = 1;
    // pulses of light running along the links
    pulseTimer -= dt;
    if (pulseTimer < 0 && links.length && dt > 0) { pulseTimer = 0.22 + Math.random() * 0.3; const i = Math.floor(Math.random() * (links.length / 2)) * 2; pulses.push({ a: links[i], b: links[i + 1], t: 0, dur: 0.7 + Math.random() * 0.5 }); }
    pulses = pulses.filter(p => (p.t += dt / p.dur) < 1);
    for (const p of pulses) {
      const k = p.t * p.t * (3 - 2 * p.t), x = p.a.sx + (p.b.sx - p.a.sx) * k, y = p.a.sy + (p.b.sy - p.a.sy) * k, fade = Math.sin(p.t * Math.PI);
      const k0 = Math.max(0, k - 0.22), x0 = p.a.sx + (p.b.sx - p.a.sx) * k0, y0 = p.a.sy + (p.b.sy - p.a.sy) * k0;
      ctx.strokeStyle = `rgba(${COBALT},${0.55 * fade})`; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke();
      ctx.globalAlpha = fade; ctx.drawImage(HALO, x - 9, y - 9, 18, 18); ctx.globalAlpha = 1;
    }
    ctx.lineWidth = 1;
    // points and symbols, far to near
    ctx.lineCap = 'round'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of parts) {
      const tw = 0.72 + 0.28 * Math.sin(time * p.tw + p.ph);
      if (p.g) {
        ctx.save(); ctx.translate(p.sx, p.sy); ctx.rotate(p.rot * 0.25);
        ctx.font = `${Math.round(11 + p.z * 15)}px "Geist Mono", ui-monospace, monospace`;
        ctx.fillStyle = `rgba(${p.blue ? COBALT : INK},${(0.08 + p.z * 0.13) * tw})`;
        ctx.fillText(p.g, 0, 0); ctx.restore();
        continue;
      }
      if (p.far) {                                      // out of focus: a soft disc
        const s = 7 + (0.45 - p.z) * 34;
        ctx.globalAlpha = (p.blue ? 0.5 : 0.22) * tw; ctx.drawImage(p.blue ? HALO : BOKEH, p.sx - s / 2, p.sy - s / 2, s, s); ctx.globalAlpha = 1;
        continue;
      }
      const r = 0.7 + p.z * 1.5, col = p.blue ? `rgba(${COBALT},${(0.4 + p.z * 0.5) * tw})` : `rgba(${INK},${(0.12 + p.z * 0.24) * tw})`;
      const len = streak * p.z;
      if (p.blue) { ctx.globalAlpha = 0.5 * tw; ctx.drawImage(HALO, p.sx - 9, p.sy - 9, 18, 18); ctx.globalAlpha = 1; }
      if (len > 1.5) { ctx.strokeStyle = col; ctx.lineWidth = r * 1.6; ctx.beginPath(); ctx.moveTo(p.sx, p.sy); ctx.lineTo(p.sx, p.sy + dir * len); ctx.stroke(); ctx.lineWidth = 1; }
      else { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.sx, p.sy, r, 0, TAU); ctx.fill(); }
    }
    // very faint streaks falling toward the bottom edge while you scroll down, feeding what is about to appear
    motes = motes.filter(m => m.y < H + 30);
    for (const m of motes) {
      m.vy += 1100 * dt; m.y += m.vy * dt; m.x += m.drift * dt; m.life += dt;
      ctx.strokeStyle = `rgba(${COBALT},${m.a * Math.min(1, m.life * 7)})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(m.x, m.y - Math.min(34, m.vy * 0.035)); ctx.lineTo(m.x, m.y); ctx.stroke();
    }
    // points rushing into the timeline
    feeders = feeders.filter(f => (f.t += dt / f.dur) < 1 && head.on);
    for (const f of feeders) {
      const k = f.t * f.t, [x, y] = bez(f, k), [x0, y0] = bez(f, Math.max(0, k - 0.1));
      ctx.strokeStyle = `rgba(${COBALT},${(0.25 + 0.6 * f.t) * 0.5})`; ctx.lineWidth = 1 + f.t * 1.4;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke();
      ctx.globalAlpha = (0.4 + 0.6 * f.t) * 0.5; ctx.drawImage(HALO, x - 7, y - 7, 14, 14); ctx.globalAlpha = 1;
      if (f.t + dt / f.dur >= 1) head.flash = 1;
    }
    ctx.lineWidth = 1;
    if (head.on && head.flash > 0.02) { const s = 60 + head.flash * 70; ctx.globalAlpha = head.flash * 0.45; ctx.drawImage(HALO, head.x - s / 2, head.y - s / 2, s, s); ctx.globalAlpha = 1; head.flash *= Math.exp(-dt * 6); }
  };
  if (reduce) { drawAtmos(0.016, scrollY, 0); return; }

  /* ==========================================================
     The loop
     ========================================================== */
  const heroCopy = $('.hero-copy'), heroStage = $('.hero-stage'), orbit = $('.orbit');
  const tlWrap = $('.tl-wrap'), tlLine = $('.tl-line'), tlFill = $('.tl-line b'), tlItems = $$('.tl li');
  let tlHead = null, tlP = 0, tlT0 = null;
  if (tlLine) { tlHead = document.createElement('i'); tlHead.className = 'tl-head'; tlLine.appendChild(tlHead); }
  let last = performance.now(), lastY = scrollY, sy = scrollY, vel = 0, raf = 0;
  const spring = (o, pos, velKey, target, k, d, dt) => { o[velKey] += ((target - o[pos]) * k - o[velKey] * d) * dt; o[pos] += o[velKey] * dt; };

  const tick = now => {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    const y = scrollY, vh = innerHeight;
    const rawVel = (y - lastY) / Math.max(dt, 0.001); lastY = y;
    vel += (rawVel - vel) * (1 - Math.exp(-dt * 9));
    sy += (y - sy) * (1 - Math.exp(-dt * 12));
    if (vel > 140 && !still && motes.length < 60) {            // scrolling down: a few faint streaks head for the bottom edge
      for (let i = Math.min(3, 1 + Math.floor(vel / 700)); i > 0; i--) {
        const x = Math.random() * innerWidth;
        motes.push({ x, y: vh * (0.2 + Math.random() * 0.65), vy: 240 + Math.random() * 320, life: 0, a: 0.05 + Math.random() * 0.1, drift: (innerWidth / 2 - x) * 0.12 });
      }
    }

    // hero drifts apart as you leave it
    if (y < vh * 1.3) {
      const k = y / vh;
      heroCopy.style.translate = `0 ${(-y * 0.14).toFixed(1)}px`;
      heroCopy.style.opacity = clamp(1 - k * 1.45).toFixed(3);
      heroStage.style.transform = `translateY(${(y * 0.2).toFixed(1)}px) scale(${(1 - k * 0.16).toFixed(4)})`;
      orbit.style.rotate = `${(y * 0.14).toFixed(2)}deg`;
    }

    // timeline: the line fills, its tip glows, and points from the field rush into it
    head.on = false;
    if (tlWrap) {
      const r = tlWrap.getBoundingClientRect();
      if (r.height === 0) tlT0 = null;                            // the Experience tab is not showing
      else if (r.top < vh && r.bottom > 0) {
        if (tlT0 === null) tlT0 = now;                            // it just opened: the line grows by itself first, then follows the scroll
        const grow = outCubic(clamp((now - tlT0) / 1500));
        const lr = tlLine.getBoundingClientRect(), p = Math.min(clamp((vh * 0.62 - r.top) / r.height), grow);
        tlFill.style.transform = `scaleY(${p.toFixed(4)})`;
        tlHead.style.transform = `translateY(${(p * lr.height).toFixed(1)}px)`;
        tlHead.style.opacity = p > 0.002 && p < 0.998 ? 1 : 0;
        head.x = lr.left + lr.width / 2; head.y = lr.top + p * lr.height; head.on = p > 0.002 && p < 0.998;
        const grown = (p - tlP) * lr.height; tlP = p;
        if (head.on && grown > 0.3 && !still) feed(Math.min(5, Math.ceil(grown / 5)));
        for (const li of tlItems) li.classList.toggle('on', li.offsetTop + 24 <= p * r.height + 1);
      }
    }

    // tilt cards: lean toward the pointer or finger, then settle
    for (const t of tilts) {
      spring(t, 'rx', 'vx', t.tx, 190, 21, dt); spring(t, 'ry', 'vy', t.ty, 190, 21, dt); spring(t, 's', 'vs', t.ts, 260, 24, dt);
      const rest = !t.hot && Math.abs(t.rx) < 0.01 && Math.abs(t.ry) < 0.01 && Math.abs(t.s - 1) < 0.0005;
      const str = rest ? '' : `perspective(1100px) rotateX(${t.rx.toFixed(2)}deg) rotateY(${t.ry.toFixed(2)}deg) scale(${t.s.toFixed(4)})`;
      if (str !== t.str) { t.el.style.transform = str; t.str = str; }
    }

    // magnets
    for (const m of magnets) {
      spring(m, 'x', 'vx', m.tx, 210, 17, dt); spring(m, 'y', 'vy', m.ty, 210, 17, dt);
      const str = Math.abs(m.x) < 0.05 && Math.abs(m.y) < 0.05 && !m.tx && !m.ty ? '' : `translate(${m.x.toFixed(2)}px, ${m.y.toFixed(2)}px)`;
      if (str !== m.str) { m.el.style.transform = str; m.str = str; }
    }

    // cursor ring trails the pointer
    if (cursor && cur.seen) {
      spring(cur, 'x', 'vx', ptr.x, 260, 26, dt); spring(cur, 'y', 'vy', ptr.y, 260, 26, dt); spring(cur, 's', 'vs', cur.ts, 240, 22, dt);
      cursor.style.transform = `translate(${cur.x.toFixed(1)}px, ${cur.y.toFixed(1)}px) scale(${cur.s.toFixed(3)})`;
    }

    drawAtmos(still ? 0 : dt, sy, still ? 0 : vel);
    raf = requestAnimationFrame(tick);
  };
  const run = () => { if (!raf) { last = performance.now(); lastY = scrollY; raf = requestAnimationFrame(tick); } };
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else run(); });
  run();
  // Safety net: if the browser withholds animation frames (a background tab), keep scroll-linked things in step anyway
  setInterval(() => { if (!document.hidden && performance.now() - last > 500) { cancelAnimationFrame(raf); tick(performance.now()); } }, 500);
})();
