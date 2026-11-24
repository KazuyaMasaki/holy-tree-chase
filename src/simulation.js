import {
  FUNNEL,
  MARBLE_RADIUS,
  START_BOWL,
  TRACK_LENGTH,
  buildCourseFeatures,
  funnelHeightAtRadius,
  funnelSlopeAtRadius,
  gateCenterU,
  trackFrameAtS,
  trackToWorld,
} from './track.js';
import { ORNAMENT_PALETTE } from './roster.js';

// Measured along the rail, matching the live progress used for ranking.
const TAILWIND_MARKS = [0.47, 0.78];

// Seedable PRNG (Mulberry32) so tests can be reproducible while live games use crypto/Math.random
export function createRng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledIndices(count, rng) {
  const arr = Array.from({ length: count }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class MarbleSimulation {
  constructor(names, options = {}) {
    this.seed = options.seed ?? ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
    this.rng = createRng(this.seed);
    this.features = buildCourseFeatures();

    this.phase = 'countdown'; // 'countdown' | 'racing' | 'finished'
    this.countdownRemaining = options.countdownSeconds ?? 2.7;
    this.simTime = 0; // simulation time during racing (scaled by slow-mo)
    this.realElapsed = 0; // real elapsed seconds since racing began
    this.timeScale = 1.0;
    this.slowMoActive = false;
    this.slowMoRealTime = 0;
    this.gateOpenProgress = 0; // 0 = closed bowl, 1 = wide open

    this.winner = null;
    this.leaderId = null;
    this.leadChanges = 0;
    this.lastLeaderCalloutAt = -10;
    this.nextTailwind = 0;
    this.events = []; // drained each frame by renderer / audio / UI

    this.marbles = this._createMarbles(names);
    this.rankings = this.marbles.map((m) => m.id);
    this.leaderId = this.rankings[0] ?? null;
  }

  _createMarbles(names) {
    const count = names.length;
    const slotOrder = shuffledIndices(count, this.rng);
    const paletteOrder = shuffledIndices(ORNAMENT_PALETTE.length, this.rng);

    return names.map((name, i) => {
      const slot = slotOrder[i];
      const pal = ORNAMENT_PALETTE[paletteOrder[i % paletteOrder.length]];

      // Arrange evenly inside the circular glass Star-Gate bowl (in two neat concentric rings if > 8)
      let bowlR = 0;
      let bowlAngle = 0;
      if (count <= 8) {
        bowlR = count === 1 ? 0 : Math.min(1.15, 0.55 + count * 0.08);
        bowlAngle = (slot / count) * Math.PI * 2 + this.rng() * 0.15;
      } else {
        const innerCount = Math.min(6, Math.floor(count * 0.35));
        if (slot < innerCount) {
          bowlR = 0.58;
          bowlAngle = (slot / innerCount) * Math.PI * 2;
        } else {
          const outerIdx = slot - innerCount;
          const outerCount = count - innerCount;
          bowlR = 1.24;
          bowlAngle = (outerIdx / outerCount) * Math.PI * 2 + 0.25;
        }
      }

      // Randomized release u position & tiny jitter so starting slot has zero bias
      const spreadFrac = count > 1 ? slot / (count - 1) - 0.5 : 0;
      const startU = spreadFrac * 1.9 + (this.rng() - 0.5) * 0.22;
      const startDelay = (slot % 3) * 0.035 + this.rng() * 0.06;

      const x = START_BOWL.cx + Math.cos(bowlAngle) * bowlR;
      const z = START_BOWL.cz + Math.sin(bowlAngle) * bowlR;
      const y = START_BOWL.cy + 0.15;

      return {
        id: i,
        name,
        slot,
        color: pal.hex,
        accent: pal.accent,
        pattern: pal.pattern,

        stage: 'bowl', // 'bowl' | 'track' | 'funnel' | 'finished'
        bowlAngle,
        bowlRadius: bowlR,
        releaseDelay: startDelay,
        releaseU: startU,

        // Track coordinates
        s: 0,
        u: startU,
        h: 0,
        vs: 0,
        vu: 0,
        vh: 0,

        // World coordinates (always up to date for rendering & funnel)
        x,
        y,
        z,
        vx: 0,
        vy: 0,
        vz: 0,

        // Visual roll orientation (axis-angle incremental rotation stored as quaternion [x,y,z,w])
        qx: 0,
        qy: 0,
        qz: 0,
        qw: 1,

        // Gameplay state
        progress: 0, // 0..1.25 (0..1 on spiral track, 1..1.25 inside funnel)
        maxS: 0,
        boostTimer: 0,
        boostCooldown: 0,
        windRemaining: 0,
        windAcceleration: 0,
        windStartRank: 0,
        stuckTimer: 0,
        lastBumpTime: -10,
        funnelTime: 0,
        finishTime: null,
        rank: i + 1,
        trail: [],
      };
    });
  }

  emit(type, payload = {}) {
    this.events.push({ type, time: this.realElapsed, ...payload });
  }

  drainEvents() {
    if (this.events.length === 0) return [];
    const out = this.events;
    this.events = [];
    return out;
  }

  step(realDt) {
    const dt = Math.min(0.05, Math.max(0, realDt));
    if (dt === 0) return;

    if (this.phase === 'countdown') {
      const prevCeil = Math.ceil(this.countdownRemaining);
      this.countdownRemaining -= dt;
      const nextCeil = Math.ceil(this.countdownRemaining);
      if (nextCeil < prevCeil && nextCeil >= 1) {
        this.emit('countdown', { count: nextCeil });
      }
      // Swirl marbles playfully in the Star-Gate bowl during countdown
      for (const m of this.marbles) {
        m.bowlAngle += dt * (1.4 + (m.id % 3) * 0.15);
        m.x = START_BOWL.cx + Math.cos(m.bowlAngle) * m.bowlRadius;
        m.z = START_BOWL.cz + Math.sin(m.bowlAngle) * m.bowlRadius;
        m.y = START_BOWL.cy + 0.12 + Math.sin(m.bowlAngle * 2) * 0.06;
      }
      if (this.countdownRemaining <= 0) {
        this.phase = 'racing';
        this.countdownRemaining = 0;
        this.emit('gate_open', {});
      }
      return;
    }

    if (this.phase === 'finished') {
      // Keep animating winning marble settling gently in the Golden Chimney pedestal
      this.realElapsed += dt;
      for (const m of this.marbles) {
        if (m.stage === 'funnel') {
          this._stepFunnelMarble(m, dt * 0.35, true);
        }
      }
      return;
    }

    // Racing phase
    this.realElapsed += dt;
    this.gateOpenProgress = Math.min(1, this.gateOpenProgress + dt * 2.8);

    // Check photo-finish slow motion trigger
    let minFunnelDist = Infinity;
    for (const m of this.marbles) {
      if (m.stage === 'funnel') {
        const d = Math.hypot(m.x - FUNNEL.cx, m.z - FUNNEL.cz);
        if (d < minFunnelDist) minFunnelDist = d;
      }
    }

    if (!this.slowMoActive && minFunnelDist < 2.25) {
      this.slowMoActive = true;
      this.emit('slowmo_start', {});
    }

    if (this.slowMoActive) {
      this.slowMoRealTime += dt;
      // Keep slow-mo punchy (~3.2s max real time) so it always feels cinematic
      const targetScale = this.slowMoRealTime < 3.2 ? 0.38 : 0.78;
      this.timeScale += (targetScale - this.timeScale) * Math.min(1, dt * 7);
    } else {
      this.timeScale = 1.0;
    }

    const scaledDt = dt * this.timeScale;
    const subSteps = 4;
    const subDt = scaledDt / subSteps;

    for (let stepIdx = 0; stepIdx < subSteps; stepIdx++) {
      this.simTime += subDt;
      this._physicsSubStep(subDt);
      if (this.phase === 'finished') break;
    }

    this._updateRankings();
    if (this.phase === 'racing') this._checkTailwind();
  }

  _checkTailwind() {
    const leader = this.marbles[this.rankings[0]];
    if (this.nextTailwind >= TAILWIND_MARKS.length || leader.progress < TAILWIND_MARKS[this.nextTailwind]) return;
    this.nextTailwind++;

    const riders = [];
    // Take one snapshot before anybody accelerates. Marbles running side by
    // side with the leader do not need a gust, even in a two-player race.
    for (const id of this.rankings) {
      const m = this.marbles[id];
      const gap = leader.s - m.s;
      if (m.stage !== 'track' || gap < 7.5) continue;
      const strength = Math.min(1, (gap - 4) / 25);
      m.windStartRank = m.rank;
      m.windRemaining = 1.6 + strength * 1.65;
      m.windAcceleration = 2 + strength * 15.5;
      m.vs = Math.max(m.vs, 3.5) + strength * 2;
      m.vh = Math.max(m.vh, 3.5 + strength * 4);
      riders.push(m.id);
    }
    if (riders.length) this.emit('tailwind', { riders });
  }

  _physicsSubStep(dt) {
    // 1. Release bowl marbles onto the spiral track
    for (const m of this.marbles) {
      if (m.stage === 'bowl') {
        m.releaseDelay -= dt;
        if (m.releaseDelay <= 0) {
          m.stage = 'track';
          m.s = 0.2 + this.rng() * 0.35;
          m.u = m.releaseU;
          m.h = 1.15;
          m.vs = 3.2 + this.rng() * 1.1;
          m.vu = (this.rng() - 0.5) * 1.8;
          m.vh = -1.2;
          const w = trackToWorld(m.s, m.u, m.h + MARBLE_RADIUS);
          m.x = w.x;
          m.y = w.y;
          m.z = w.z;
        } else {
          m.bowlAngle += dt * 2.5;
          m.x = START_BOWL.cx + Math.cos(m.bowlAngle) * m.bowlRadius * 0.8;
          m.z = START_BOWL.cz + Math.sin(m.bowlAngle) * m.bowlRadius * 0.8;
          m.y = START_BOWL.cy - (1 - Math.max(0, m.releaseDelay * 6)) * 0.5;
        }
      }
    }

    // A close pack can send two marbles over the lip in one physics step.
    let firstFinisher = null;
    let firstCrossing = Infinity;
    for (const m of this.marbles) {
      if (m.stage === 'track') {
        this._stepTrackMarble(m, dt);
      } else if (m.stage === 'funnel') {
        const crossing = this._stepFunnelMarble(m, dt, false);
        if (crossing !== undefined && (crossing < firstCrossing || (crossing === firstCrossing && m.slot < firstFinisher.slot))) {
          firstFinisher = m;
          firstCrossing = crossing;
        }
      }
    }
    if (firstFinisher) this._finishRace(firstFinisher);

    // 3. Marble-to-marble 3D collisions
    this._resolveMarbleCollisions();

    // 4. Sync track world coords & check finish
    for (const m of this.marbles) {
      if (m.stage === 'track') {
        const w = trackToWorld(m.s, m.u, m.h + MARBLE_RADIUS);
        const dx = w.x - m.x;
        const dy = w.y - m.y;
        const dz = w.z - m.z;
        m.x = w.x;
        m.y = w.y;
        m.z = w.z;
        this._applyRoll(m, dx, dy, dz);
        m.progress = Math.min(0.999, m.s / TRACK_LENGTH);
      } else if (m.stage === 'funnel') {
        const r = Math.hypot(m.x - FUNNEL.cx, m.z - FUNNEL.cz);
        const norm = 1 - Math.max(0, Math.min(1, (r - FUNNEL.holeRadius) / (FUNNEL.rimRadius - FUNNEL.holeRadius)));
        m.progress = 1.0 + norm * 0.25;
      }
    }
  }

  _stepTrackMarble(m, dt) {
    const frame = trackFrameAtS(m.s);

    // Cooldowns
    if (m.boostTimer > 0) m.boostTimer = Math.max(0, m.boostTimer - dt);
    if (m.boostCooldown > 0) m.boostCooldown = Math.max(0, m.boostCooldown - dt);

    // Longitudinal gravity along spiral slope + subtle speed regulation so pack stays brisk & competitive
    const gravity = 33.5;
    let accelS = gravity * frame.slopeSin;
    if (m.windRemaining > 0) {
      accelS += m.windAcceleration * Math.min(1, m.windRemaining / .7);
      m.windRemaining = Math.max(0, m.windRemaining - dt);
    }

    // Slight inner-lane advantage in Zone 3 shortcut (tighter radius = faster cornering!)
    if (m.s > this.features.dividers[0].sStart && m.s < this.features.dividers[0].sEnd && m.u < -0.15) {
      accelS += 1.05;
    }

    // Aerodynamic + rolling drag tuned for crisp ~24-28s total race duration
    const dragS = 0.043 * m.vs * Math.abs(m.vs) + 0.11 * m.vs;
    accelS -= dragS;

    // Subtle organic turbulence & slight centrifugal outward pull on curves
    const centrifugal = (m.vs * m.vs) / Math.max(3.0, frame.radius) * 0.075;
    // Track banking gently pulls back toward center (shallow U-channel feel)
    const banking = -m.u * 1.15;
    const lateralDrag = -m.vu * 0.65;
    const accelU = centrifugal + banking + lateralDrag;

    m.vs += accelS * dt;
    m.vu += accelU * dt;

    // Clamp max speeds cleanly
    const maxVs = m.windRemaining > 0 ? 21 : m.boostTimer > 0 ? 15.8 : 12.2;
    if (m.vs > maxVs) m.vs = maxVs;
    if (m.vs < -2.2) m.vs = -2.2;
    if (m.vu > 6.5) m.vu = 6.5;
    if (m.vu < -6.5) m.vu = -6.5;

    // Vertical hop physics
    if (m.h > 0 || m.vh !== 0) {
      m.vh -= 26.0 * dt;
      m.h += m.vh * dt;
      if (m.h <= 0) {
        m.h = 0;
        if (m.vh < -2.2) {
          m.vh = -m.vh * 0.34;
        } else {
          m.vh = 0;
        }
      }
    }

    // Advance curvilinear position
    m.s += m.vs * dt;
    m.u += m.vu * dt;

    // Anti-stuck Snow Breeze guard: guarantees zero deadlocks or pogo loops on pins/bells/gates
    if (m.s > m.maxS + 0.35) {
      m.maxS = m.s;
      m.stuckTimer = 0;
    } else {
      m.stuckTimer += dt;
      if (m.stuckTimer > 1.0) {
        m.vs = Math.max(m.vs, 5.4);
        const sideDir = m.u > 0 ? -1 : 1;
        m.vu += sideDir * (2.4 + this.rng() * 1.4);
        m.vh = Math.max(m.vh, 7.6); // crisp magical snow-gust hop clears any obstacle
        m.stuckTimer = 0;
      }
    }

    // Clamp behind start
    if (m.s < 0.1) {
      m.s = 0.1;
      m.vs = Math.abs(m.vs) * 0.6 + 1.5;
    }

    // Track side guard rails
    const maxU = frame.halfWidth - MARBLE_RADIUS;
    if (m.u > maxU) {
      m.u = maxU;
      if (m.vu > 0) m.vu = -m.vu * 0.62;
    } else if (m.u < -maxU) {
      m.u = -maxU;
      if (m.vu < 0) m.vu = -m.vu * 0.62;
    }

    // Obstacle collisions (only when near track surface)
    if (m.h < 0.95) {
      this._collideTrackObstacles(m);
    }

    // Transition seamlessly into the Snowglobe Funnel at s >= TRACK_LENGTH
    if (m.s >= TRACK_LENGTH) {
      this._enterFunnel(m);
    }
  }

  _collideTrackObstacles(m) {
    const { pins, bells, gates, boosts, dividers } = this.features;

    // 1. Candy Cane Pins
    for (const pin of pins) {
      const ds = m.s - pin.s;
      if (Math.abs(ds) > 1.2) continue;
      const du = m.u - pin.u;
      const minDist = MARBLE_RADIUS + pin.radius;
      const distSq = ds * ds + du * du;
      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq) || 0.001;
        let ns = ds / dist;
        let nu = du / dist;
        // Break dead-center symmetry randomly so marbles never stall atop a pin
        if (Math.abs(nu) < 0.12) {
          nu = (this.rng() < 0.5 ? -1 : 1) * 0.55;
          const len = Math.hypot(ns, nu);
          ns /= len;
          nu /= len;
        }
        const overlap = minDist - dist + 0.005;
        m.s += ns * overlap;
        m.u += nu * overlap;

        const vn = m.vs * ns + m.vu * nu;
        if (vn < 0) {
          const bounce = 1.72;
          m.vs -= bounce * vn * ns;
          m.vu -= bounce * vn * nu;
          // Ensure forward momentum stays lively
          if (m.vs < 1.2) m.vs += 0.9;
          m.vh = Math.max(m.vh, 0.85);
          if (this.simTime - m.lastBumpTime > 0.11) {
            m.lastBumpTime = this.simTime;
            this.emit('pin_hit', { marbleId: m.id, pinId: pin.id, x: m.x, y: m.y, z: m.z });
          }
        }
      }
    }

    // 2. Golden Jingle Bells & Gift Bumpers
    for (const bell of bells) {
      const ds = m.s - bell.s;
      if (Math.abs(ds) > 1.4) continue;
      const du = m.u - bell.u;
      const minDist = MARBLE_RADIUS + bell.radius;
      const distSq = ds * ds + du * du;
      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq) || 0.001;
        let ns = ds / dist;
        let nu = du / dist;
        // Strong lateral bias so marbles glance dramatically around bells instead of pogo-bouncing uphill
        if (Math.abs(nu) < 0.65) {
          const side = du === 0 ? (this.rng() < 0.5 ? -1 : 1) : Math.sign(du);
          nu = side * 0.78;
          ns = Math.sign(ns || -1) * Math.sqrt(Math.max(0.05, 1 - nu * nu));
        }
        const overlap = minDist - dist + 0.01;
        m.s += ns * overlap;
        m.u += nu * overlap;

        const vn = m.vs * ns + m.vu * nu;
        if (vn < 0) {
          m.vs -= 1.45 * vn * ns;
          m.vu -= 1.85 * vn * nu;
        }
        // Energetic lateral festive bumper kick while preventing severe uphill stalls
        const kick = bell.kind === 'gift' ? 2.4 : 2.9;
        m.vs = Math.max(-0.6, m.vs + (ns > 0 ? ns * 1.2 : 0));
        m.vu += nu * kick;
        m.vh = Math.max(m.vh, 1.45);

        if (this.simTime - m.lastBumpTime > 0.14) {
          m.lastBumpTime = this.simTime;
          this.emit('bell_hit', {
            marbleId: m.id,
            marbleName: m.name,
            bellId: bell.id,
            kind: bell.kind || 'bell',
            note: bell.note,
            x: m.x,
            y: m.y,
            z: m.z,
          });
        }
      }
    }

    // 3. Rotating / Oscillating Christmas Wreath Gates
    for (const gate of gates) {
      const ds = m.s - gate.s;
      const halfThick = gate.thickness * 0.5 + MARBLE_RADIUS;
      if (Math.abs(ds) > halfThick) continue;

      const centerU = gateCenterU(gate, this.simTime);
      const du = m.u - centerU;
      const halfSpan = gate.barHalfWidth + MARBLE_RADIUS;
      if (Math.abs(du) < halfSpan) {
        const penS = halfThick - Math.abs(ds);
        const penU = halfSpan - Math.abs(du);
        const gateVelU = Math.cos(this.simTime * gate.speed + gate.phase) * gate.amp * gate.speed;

        if (penS < penU) {
          const signS = ds >= 0 ? 1 : -1;
          m.s += signS * (penS + 0.01);
          if (m.vs * signS < 0) {
            m.vs = Math.max(-0.55, -m.vs * 0.35 + signS * 0.45);
          }
          // Deflect briskly sideways around the wreath bar so traffic flows around it naturally
          const escapeSide = du === 0 ? (gateVelU >= 0 ? -1 : 1) : Math.sign(du);
          m.vu = escapeSide * Math.max(Math.abs(m.vu), 2.8) + gateVelU * 0.45;
        } else {
          const signU = du >= 0 ? 1 : -1;
          m.u += signU * (penU + 0.01);
          m.vu = signU * Math.max(Math.abs(m.vu) * 0.75, 2.6) + gateVelU * 0.5;
        }
        if (this.simTime - m.lastBumpTime > 0.16) {
          m.lastBumpTime = this.simTime;
          this.emit('wreath_hit', { marbleId: m.id, gateId: gate.id, x: m.x, y: m.y, z: m.z });
        }
      }
    }

    // 4. Zone 3 Split Shortcut Divider Rail
    for (const div of dividers) {
      if (m.s < div.sStart - MARBLE_RADIUS || m.s > div.sEnd + MARBLE_RADIUS) continue;
      // Rounded nose at the start of the divider so marbles cleanly pick inner or outer lane
      if (m.s < div.sStart) {
        const ds = m.s - div.sStart;
        const du = m.u - div.u;
        const minDist = MARBLE_RADIUS + div.halfThickness;
        const distSq = ds * ds + du * du;
        if (distSq < minDist * minDist) {
          const signU = du >= 0 ? 1 : -1;
          m.u = div.u + signU * (minDist + 0.02);
          m.vu += signU * 1.4;
        }
      } else if (m.s <= div.sEnd) {
        const du = m.u - div.u;
        const minU = MARBLE_RADIUS + div.halfThickness;
        if (Math.abs(du) < minU) {
          const signU = du >= 0 ? 1 : -1;
          m.u = div.u + signU * minU;
          if (m.vu * signU < 0) m.vu = -m.vu * 0.55;
        }
      }
    }

    // 5. Star Boost Pads
    if (m.boostCooldown <= 0) {
      for (const pad of boosts) {
        if (Math.abs(m.s - pad.s) <= pad.halfS && Math.abs(m.u - pad.u) <= pad.halfU) {
          m.vs = Math.min(14.0, Math.max(m.vs + pad.impulse, 9.8));
          m.vh = Math.max(m.vh, 2.15);
          m.boostTimer = 1.55;
          m.boostCooldown = 1.1;
          this.emit('boost_hit', {
            marbleId: m.id,
            marbleName: m.name,
            boostId: pad.id,
            label: pad.label,
            x: m.x,
            y: m.y,
            z: m.z,
          });
          break;
        }
      }
    }
  }

  _enterFunnel(m) {
    const frame = trackFrameAtS(TRACK_LENGTH);
    const w = trackToWorld(TRACK_LENGTH, m.u, m.h + MARBLE_RADIUS);
    m.stage = 'funnel';
    m.windRemaining = 0;
    m.funnelTime = 0;

    // Place cleanly along the back rim of the Snowglobe Funnel
    const entryX = w.x;
    const entryZ = Math.max(FUNNEL.cz - FUNNEL.rimRadius + MARBLE_RADIUS + 0.08, w.z);
    const dx = entryX - FUNNEL.cx;
    const dz = entryZ - FUNNEL.cz;
    const r = Math.hypot(dx, dz) || 1;
    const maxR = FUNNEL.rimRadius - MARBLE_RADIUS - 0.05;
    if (r > maxR) {
      m.x = FUNNEL.cx + (dx / r) * maxR;
      m.z = FUNNEL.cz + (dz / r) * maxR;
    } else {
      m.x = entryX;
      m.z = entryZ;
    }
    m.y = funnelHeightAtRadius(Math.hypot(m.x - FUNNEL.cx, m.z - FUNNEL.cz)) + MARBLE_RADIUS + m.h;

    // Convert track velocity (vs along +X tangent, vu along +Z outward) into energetic swirl velocity!
    const speed = Math.max(8.2, Math.min(12.2, m.vs * 1.12));
    m.vx = frame.tangent.x * speed + frame.right.x * m.vu * 0.35;
    m.vz = frame.tangent.z * speed + frame.right.z * m.vu * 0.35 + 0.45;
    m.vy = 0;

    this.emit('funnel_enter', { marbleId: m.id, marbleName: m.name, x: m.x, y: m.y, z: m.z });
  }

  _stepFunnelMarble(m, dt, passive) {
    m.funnelTime += dt;
    if (m.boostTimer > 0) m.boostTimer = Math.max(0, m.boostTimer - dt);

    const dx = m.x - FUNNEL.cx;
    const dz = m.z - FUNNEL.cz;
    const r = Math.hypot(dx, dz) || 0.0001;
    const rx = dx / r;
    const rz = dz / r;

    // Inward pull along the funnel slope — balanced for 1.5-2.5 thrilling orbital laps!
    const slope = funnelSlopeAtRadius(r);
    const gInward = 15.8 * (slope / Math.sqrt(1 + slope * slope));
    const timeAssist = 1.0 + Math.min(1.8, m.funnelTime * 0.24);

    const ax = -rx * gInward * timeAssist - m.vx * 0.22;
    const az = -rz * gInward * timeAssist - m.vz * 0.22;

    m.vx += ax * dt;
    m.vz += az * dt;

    // Slight tangential damping so orbital radius decays smoothly into the Golden Chimney
    const tx = -rz;
    const tz = rx;
    const vTan = m.vx * tx + m.vz * tz;
    m.vx -= tx * vTan * 0.16 * dt;
    m.vz -= tz * vTan * 0.16 * dt;

    const prevX = m.x;
    const prevY = m.y;
    const prevZ = m.z;

    m.x += m.vx * dt;
    m.z += m.vz * dt;

    // Collide with the 3 decorative golden guide pegs inside the funnel
    for (const peg of FUNNEL.pegs) {
      const px = FUNNEL.cx + Math.cos(peg.angle) * peg.r;
      const pz = FUNNEL.cz + Math.sin(peg.angle) * peg.r;
      const pdx = m.x - px;
      const pdz = m.z - pz;
      const minD = MARBLE_RADIUS + peg.radius;
      const dSq = pdx * pdx + pdz * pdz;
      if (dSq < minD * minD) {
        const d = Math.sqrt(dSq) || 0.001;
        const nx = pdx / d;
        const nz = pdz / d;
        m.x += nx * (minD - d + 0.01);
        m.z += nz * (minD - d + 0.01);
        const vn = m.vx * nx + m.vz * nz;
        if (vn < 0) {
          m.vx -= 1.78 * vn * nx;
          m.vz -= 1.78 * vn * nz;
          if (!passive && this.simTime - m.lastBumpTime > 0.14) {
            m.lastBumpTime = this.simTime;
            this.emit('bell_hit', {
              marbleId: m.id,
              marbleName: m.name,
              bellId: peg.id,
              kind: 'funnel_peg',
              note: 9,
              x: m.x,
              y: m.y,
              z: m.z,
            });
          }
        }
      }
    }

    // Clamp to outer snowglobe glass wall
    const newDx = m.x - FUNNEL.cx;
    const newDz = m.z - FUNNEL.cz;
    let newR = Math.hypot(newDx, newDz) || 0.0001;
    const maxR = FUNNEL.rimRadius - MARBLE_RADIUS;
    if (newR > maxR) {
      const nrx = newDx / newR;
      const nrz = newDz / newR;
      m.x = FUNNEL.cx + nrx * maxR;
      m.z = FUNNEL.cz + nrz * maxR;
      const vr = m.vx * nrx + m.vz * nrz;
      if (vr > 0) {
        m.vx -= 1.55 * vr * nrx;
        m.vz -= 1.55 * vr * nrz;
      }
      newR = maxR;
    }

    // Height follows the glass snowglobe funnel surface
    m.y = funnelHeightAtRadius(newR) + MARBLE_RADIUS;
    this._applyRoll(m, m.x - prevX, m.y - prevY, m.z - prevZ);

    if (!passive && newR <= FUNNEL.holeRadius) {
      // Fraction of this step at which the radius first reached the chimney.
      return Math.max(0, (r - FUNNEL.holeRadius) / Math.max(1e-9, r - newR));
    }
  }

  _finishRace(m) {
    m.stage = 'finished';
    m.x = FUNNEL.cx;
    m.z = FUNNEL.cz;
    m.y = FUNNEL.holeY + 0.35;
    m.finishTime = this.realElapsed;
    m.progress = 1.3;
    this.winner = m;
    this.phase = 'finished';
    this.timeScale = 1.0;
    this.emit('winner', {
      marbleId: m.id, marbleName: m.name, color: m.color, elapsed: this.realElapsed,
    });
  }

  _resolveMarbleCollisions() {
    const n = this.marbles.length;
    const minDist = MARBLE_RADIUS * 2;
    const minDistSq = minDist * minDist;

    for (let i = 0; i < n; i++) {
      const a = this.marbles[i];
      if (a.stage !== 'track' && a.stage !== 'funnel') continue;

      for (let j = i + 1; j < n; j++) {
        const b = this.marbles[j];
        if (a.stage !== b.stage) continue;

        if (a.stage === 'track') {
          const ds = b.s - a.s;
          if (Math.abs(ds) > minDist) continue;
          const du = b.u - a.u;
          const dh = b.h - a.h;
          const distSq = ds * ds + du * du + dh * dh;
          if (distSq < minDistSq && distSq > 1e-8) {
            const dist = Math.sqrt(distSq);
            const ns = ds / dist;
            const nu = du / dist;
            const overlap = (minDist - dist) * 0.5 + 0.002;
            a.s -= ns * overlap;
            a.u -= nu * overlap;
            b.s += ns * overlap;
            b.u += nu * overlap;

            const rvs = b.vs - a.vs;
            const rvu = b.vu - a.vu;
            const relNormal = rvs * ns + rvu * nu;
            if (relNormal < 0) {
              const imp = -0.88 * relNormal;
              a.vs -= imp * ns;
              a.vu -= imp * nu;
              b.vs += imp * ns;
              b.vu += imp * nu;
              if (Math.abs(relNormal) > 2.0 && this.simTime - a.lastBumpTime > 0.14) {
                a.lastBumpTime = this.simTime;
                b.lastBumpTime = this.simTime;
                this.emit('marble_clink', { x: a.x, y: a.y, z: a.z, intensity: Math.min(1, Math.abs(relNormal) / 7) });
              }
            }
          }
        } else if (a.stage === 'funnel') {
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const distSq = dx * dx + dz * dz;
          if (distSq < minDistSq && distSq > 1e-8) {
            const dist = Math.sqrt(distSq);
            const nx = dx / dist;
            const nz = dz / dist;
            const overlap = (minDist - dist) * 0.5 + 0.002;
            a.x -= nx * overlap;
            a.z -= nz * overlap;
            b.x += nx * overlap;
            b.z += nz * overlap;

            const rvx = b.vx - a.vx;
            const rvz = b.vz - a.vz;
            const relNormal = rvx * nx + rvz * nz;
            if (relNormal < 0) {
              const imp = -0.9 * relNormal;
              a.vx -= imp * nx;
              a.vz -= imp * nz;
              b.vx += imp * nx;
              b.vz += imp * nz;
              if (Math.abs(relNormal) > 1.8 && this.simTime - a.lastBumpTime > 0.14) {
                a.lastBumpTime = this.simTime;
                b.lastBumpTime = this.simTime;
                this.emit('marble_clink', { x: a.x, y: a.y, z: a.z, intensity: Math.min(1, Math.abs(relNormal) / 6) });
              }
            }
          }
        }
      }
    }
  }

  _applyRoll(m, dx, dy, dz) {
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-5) return;
    // Axis perpendicular to horizontal movement & up vector: cross((0,1,0), (dx,0,dz)) = (dz, 0, -dx)
    const ax = dz / dist;
    const az = -dx / dist;
    const angle = dist / MARBLE_RADIUS;
    const half = angle * 0.5;
    const s = Math.sin(half);
    const c = Math.cos(half);
    const rx = ax * s;
    const rz = az * s;
    const rw = c;

    // Multiply delta-quaternion (rx, 0, rz, rw) * current (qx, qy, qz, qw)
    const qx = m.qx;
    const qy = m.qy;
    const qz = m.qz;
    const qw = m.qw;

    const nx = rw * qx + rx * qw - rz * qy;
    const ny = rw * qy + rz * qx - rx * qz;
    const nz = rw * qz + rz * qw + rx * qy;
    const nw = rw * qw - rx * qx - rz * qz;

    const invLen = 1 / (Math.hypot(nx, ny, nz, nw) || 1);
    m.qx = nx * invLen;
    m.qy = ny * invLen;
    m.qz = nz * invLen;
    m.qw = nw * invLen;
  }

  _updateRankings() {
    const sorted = [...this.marbles].sort((a, b) => {
      if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
      if (a.finishTime !== null) return -1;
      if (b.finishTime !== null) return 1;
      return b.progress - a.progress;
    });
    this.rankings = sorted.map((m) => m.id);
    sorted.forEach((m, idx) => {
      m.rank = idx + 1;
    });

    const nextLeader = sorted[0];
    if (nextLeader && nextLeader.id !== this.leaderId && this.phase === 'racing') {
      const prevLeader = this.leaderId;
      this.leaderId = nextLeader.id;
      if (prevLeader !== null && this.realElapsed > 1.8) {
        this.leadChanges += 1;
        if (this.realElapsed - this.lastLeaderCalloutAt > 2.2) {
          this.lastLeaderCalloutAt = this.realElapsed;
          this.emit('lead_change', {
            marbleId: nextLeader.id,
            marbleName: nextLeader.name,
            progress: nextLeader.progress,
          });
        }
      }
    }
  }

  getRankedMarbles() {
    return this.rankings.map((id) => this.marbles[id]);
  }
}
