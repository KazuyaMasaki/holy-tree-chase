// Shared mathematical definition of the 3D Christmas Tree Spiral Track & Snowglobe Funnel.
// Both the Three.js visual builder and the physics engine read from this single source of truth.

export const MARBLE_RADIUS = 0.44;
export const SPIRAL_TURNS = 3.0;
export const Y_START = 26.8;
export const Y_END = 4.05;
export const R_START = 2.85;
export const R_END = 11.2;

export const FUNNEL = {
  cx: 0,
  cz: 16.0,
  rimRadius: 5.15,
  holeRadius: 1.12,
  rimY: 3.92,
  holeY: 0.78,
  wallHeight: 1.55,
  pegs: [
    { id: 'fpeg-0', r: 2.65, angle: 0.45, radius: 0.30 },
    { id: 'fpeg-1', r: 2.65, angle: 0.45 + (Math.PI * 2) / 3, radius: 0.30 },
    { id: 'fpeg-2', r: 2.65, angle: 0.45 + (Math.PI * 4) / 3, radius: 0.30 },
  ],
};

export const START_BOWL = {
  cx: 0,
  cy: 28.05,
  cz: R_START,
  radius: 1.85,
};

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function trackWidthAtT(t) {
  // Generous width so up to 20 marbles can weave, bounce, and overtake cleanly without jamming
  const widen = smoothstep(0.0, 0.18, t);
  const splitExtra = smoothstep(0.55, 0.66, t) * (1 - smoothstep(0.86, 0.96, t)) * 0.65;
  return 3.45 + widen * 0.95 + splitExtra;
}

export function spiralPositionAtT(t) {
  const clamped = Math.max(0, Math.min(1, t));
  const theta = clamped * SPIRAL_TURNS * Math.PI * 2;
  // Subtle S-curve ease on vertical drop for graceful entry & dramatic finish
  const yDrop = clamped + 0.018 * Math.sin(clamped * Math.PI * 2);
  const y = Y_START + (Y_END - Y_START) * yDrop;
  // Slightly flared lower boughs follow a classic Christmas tree silhouette
  const rProgress = Math.pow(clamped, 0.92);
  const r = R_START + (R_END - R_START) * rProgress;
  // At t=1 (theta=6*PI), position is (0, Y_END, R_END) with tangent purely in +X
  // which aligns tangentially with the back edge of the Snowglobe Funnel!
  const x = r * Math.sin(theta);
  const z = r * Math.cos(theta);
  return { x, y, z, r, theta };
}

function normalize3(x, y, z) {
  const len = Math.hypot(x, y, z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

function cross3(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

// Build high-resolution arc-length table for exact speed & obstacle mapping
const SAMPLES = 720;
const sampleT = new Float64Array(SAMPLES + 1);
const sampleS = new Float64Array(SAMPLES + 1);
let totalLength = 0;

{
  let prev = spiralPositionAtT(0);
  sampleT[0] = 0;
  sampleS[0] = 0;
  for (let i = 1; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const cur = spiralPositionAtT(t);
    totalLength += Math.hypot(cur.x - prev.x, cur.y - prev.y, cur.z - prev.z);
    sampleT[i] = t;
    sampleS[i] = totalLength;
    prev = cur;
  }
}

export const TRACK_LENGTH = totalLength;

export function sToT(s) {
  if (s <= 0) return 0;
  if (s >= TRACK_LENGTH) return 1;
  let lo = 0;
  let hi = SAMPLES;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (sampleS[mid] <= s) lo = mid;
    else hi = mid;
  }
  const span = sampleS[hi] - sampleS[lo] || 1;
  const alpha = (s - sampleS[lo]) / span;
  return sampleT[lo] + (sampleT[hi] - sampleT[lo]) * alpha;
}

export function tToS(t) {
  const clamped = Math.max(0, Math.min(1, t));
  const f = clamped * SAMPLES;
  const idx = Math.min(SAMPLES - 1, Math.floor(f));
  const alpha = f - idx;
  return sampleS[idx] + (sampleS[idx + 1] - sampleS[idx]) * alpha;
}

export function trackFrameAtS(s) {
  const clampedS = Math.max(0, Math.min(TRACK_LENGTH, s));
  const t = sToT(clampedS);
  const eps = 0.0008;
  const p = spiralPositionAtT(t);
  const pPrev = spiralPositionAtT(Math.max(0, t - eps));
  const pNext = spiralPositionAtT(Math.min(1, t + eps));

  const tangent = normalize3(pNext.x - pPrev.x, pNext.y - pPrev.y, pNext.z - pPrev.z);
  const worldUp = { x: 0, y: 1, z: 0 };
  // Right vector points outward away from the tree center (since spiral runs clockwise from above: +X at +Z)
  // cross(worldUp, tangent): at +Z with tangent (+1,0,0), cross((0,1,0),(1,0,0)) = (0,0,-1) -> inward!
  // So outward = cross(tangent, worldUp) = (0,0,+1) at +Z!
  const rightRaw = cross3(tangent, worldUp);
  const right = normalize3(rightRaw.x, rightRaw.y, rightRaw.z);
  const upRaw = cross3(right, tangent);
  const up = normalize3(upRaw.x, upRaw.y, upRaw.z);

  const width = trackWidthAtT(t);
  return {
    s: clampedS,
    t,
    pos: { x: p.x, y: p.y, z: p.z },
    tangent,
    right, // +u = outward away from tree, -u = inward toward tree
    up,
    width,
    halfWidth: width * 0.5,
    slopeSin: Math.max(0.05, -tangent.y),
    radius: p.r,
    theta: p.theta,
  };
}

export function trackToWorld(s, u, h = 0) {
  const f = trackFrameAtS(s);
  return {
    x: f.pos.x + f.right.x * u + f.up.x * h,
    y: f.pos.y + f.right.y * u + f.up.y * h,
    z: f.pos.z + f.right.z * u + f.up.z * h,
    frame: f,
  };
}

export function funnelHeightAtRadius(r) {
  const clamped = Math.max(FUNNEL.holeRadius, Math.min(FUNNEL.rimRadius, r));
  const norm = (clamped - FUNNEL.holeRadius) / (FUNNEL.rimRadius - FUNNEL.holeRadius);
  return FUNNEL.holeY + (FUNNEL.rimY - FUNNEL.holeY) * Math.pow(norm, 0.84);
}

export function funnelSlopeAtRadius(r) {
  const dr = 0.05;
  const r0 = Math.max(FUNNEL.holeRadius, r - dr);
  const r1 = Math.min(FUNNEL.rimRadius, r + dr);
  return (funnelHeightAtRadius(r1) - funnelHeightAtRadius(r0)) / Math.max(0.001, r1 - r0);
}

// ============================================================
// Course Obstacles & Gimmicks (Shared by Physics & 3D Renderer)
// ============================================================

export function buildCourseFeatures() {
  const pins = [];
  const bells = [];
  const gates = [];
  const boosts = [];
  const dividers = [];

  // Zone 1: Candy Cane Pin Forest (t = 0.08 .. 0.27)
  // Every adjacent pair of pins has >= 1.50 gap (marble diameter 0.88 + 2*pinRadius 0.34 = 1.22 -> guaranteed smooth flow!)
  const pinRows = [
    { t: 0.082, us: [-0.82, 0.82] },
    { t: 0.114, us: [-1.42, 0.0, 1.42] },
    { t: 0.146, us: [-0.88, 0.88] },
    { t: 0.178, us: [-1.48, 0.0, 1.48] },
    { t: 0.212, us: [-0.90, 0.90] },
    { t: 0.246, us: [-1.52, 0.0, 1.52] },
  ];
  let pinIdx = 0;
  for (const row of pinRows) {
    const s = tToS(row.t);
    for (const u of row.us) {
      pins.push({
        id: `pin-${pinIdx++}`,
        s,
        t: row.t,
        u,
        radius: 0.17,
      });
    }
  }

  // Zone 2: Golden Jingle Bell Bumpers (t = 0.31 .. 0.59)
  // Positioned with generous clearance from side walls (>= 1.28 from wall center) so marbles never pinch
  const bellSpecs = [
    { t: 0.312, u: -0.68, note: 0 },
    { t: 0.344, u: 0.68, note: 2 },
    { t: 0.398, u: 0.0, note: 4 },
    { t: 0.440, u: -0.78, note: 5 },
    { t: 0.448, u: 0.78, note: 7 },
    { t: 0.512, u: -0.45, note: 4 },
    { t: 0.548, u: 0.62, note: 7 },
    { t: 0.585, u: -0.66, note: 9 },
  ];
  bellSpecs.forEach((spec, i) => {
    bells.push({
      id: `bell-${i}`,
      s: tToS(spec.t),
      t: spec.t,
      u: spec.u,
      radius: 0.34,
      note: spec.note,
    });
  });

  // Zone 2: Oscillating / Sweeping Christmas Wreath Gates (t = 0.37, 0.48, 0.57)
  const gateSpecs = [
    { t: 0.372, speed: 1.65, phase: 0.0, barHalfWidth: 0.56, amp: 1.15 },
    { t: 0.480, speed: 1.95, phase: 2.1, barHalfWidth: 0.58, amp: 1.18 },
    { t: 0.568, speed: 1.75, phase: 4.2, barHalfWidth: 0.56, amp: 1.15 },
  ];
  gateSpecs.forEach((spec, i) => {
    gates.push({
      id: `gate-${i}`,
      s: tToS(spec.t),
      t: spec.t,
      speed: spec.speed,
      phase: spec.phase,
      barHalfWidth: spec.barHalfWidth,
      amp: spec.amp,
      thickness: 0.24,
    });
  });

  // Zone 3: Split Shortcut Divider Rail (t = 0.635 .. 0.835)
  // Inner lane (u < -0.15) is narrower with Star Boosts; outer lane (u > -0.15) has gift bumpers + late boost.
  dividers.push({
    id: 'divider-main',
    sStart: tToS(0.635),
    sEnd: tToS(0.835),
    tStart: 0.635,
    tEnd: 0.835,
    u: -0.15,
    halfThickness: 0.13,
  });

  // Gift-box bumpers in Zone 3 Outer Lane (centered in outer lane with clean pass-by on both sides)
  const giftBumpers = [
    { t: 0.680, u: 0.95, note: 2 },
    { t: 0.735, u: 0.85, note: 5 },
    { t: 0.785, u: 1.00, note: 7 },
    { t: 0.875, u: 0.0, note: 9 },
  ];
  giftBumpers.forEach((spec, i) => {
    bells.push({
      id: `gift-${i}`,
      kind: 'gift',
      s: tToS(spec.t),
      t: spec.t,
      u: spec.u,
      radius: 0.34,
      note: spec.note,
    });
  });

  // Star Boost Pads (give speed burst + sparkle trail + small hop)
  const boostSpecs = [
    { t: 0.285, u: 0.0, halfU: 0.78, length: 2.5, impulse: 3.4, label: 'スターブースト' },
    { t: 0.695, u: -1.25, halfU: 0.72, length: 2.6, impulse: 4.3, label: 'ショートカット加速' },
    { t: 0.780, u: -1.22, halfU: 0.72, length: 2.6, impulse: 4.1, label: '星屑ダッシュ' },
    { t: 0.815, u: 1.05, halfU: 0.78, length: 2.6, impulse: 3.9, label: '追い上げブースト' },
    { t: 0.935, u: 0.0, halfU: 0.95, length: 2.8, impulse: 3.6, label: 'スノードーム突入加速' },
  ];
  boostSpecs.forEach((spec, i) => {
    boosts.push({
      id: `boost-${i}`,
      s: tToS(spec.t),
      t: spec.t,
      u: spec.u,
      halfU: spec.halfU,
      halfS: spec.length * 0.5,
      impulse: spec.impulse,
      label: spec.label,
    });
  });

  return { pins, bells, gates, boosts, dividers };
}

export function gateCenterU(gate, simTime) {
  return Math.sin(simTime * gate.speed + gate.phase) * gate.amp;
}

export function getZoneInfo(progress) {
  if (progress < 0.06) return { index: 0, title: 'トップスター・ゲート', short: 'START' };
  if (progress < 0.30) return { index: 1, title: 'キャンディケイン・ピン', short: 'ZONE 1' };
  if (progress < 0.62) return { index: 2, title: 'ジングルベル＆回転リース', short: 'ZONE 2' };
  if (progress < 0.88) return { index: 3, title: 'スターブースト分岐路', short: 'ZONE 3' };
  return { index: 4, title: 'スノードーム・ファンネル', short: 'FINAL' };
}
