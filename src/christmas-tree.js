import * as THREE from 'three';
import { SPIRAL_TURNS, spiralPositionAtT, trackWidthAtT } from './track.js';

// Bottom to top. Height is measured at the tip of each branch.
export const treeLayers = [
  { y: 1.62, r: 10.05, rise: 7.2, count: 15 },
  { y: 4.38, r: 9.20, rise: 6.8, count: 16 },
  { y: 7.18, r: 8.22, rise: 6.6, count: 15 },
  { y: 10.08, r: 7.31, rise: 6.2, count: 14 },
  { y: 12.91, r: 6.31, rise: 5.9, count: 14 },
  { y: 15.68, r: 5.40, rise: 5.6, count: 13 },
  { y: 18.35, r: 4.50, rise: 5.2, count: 12 },
  { y: 20.93, r: 3.58, rise: 4.8, count: 12 },
  { y: 23.45, r: 2.71, rise: 4.4, count: 11 },
  { y: 25.68, r: 1.87, rise: 3.6, count: 10 },
  { y: 27.33, r: 1.06, rise: 2.7, count: 9 },
];
const tau = Math.PI * 2;

// A small tile of engraved needles follows each individual cut of the branch.
function needleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');
  // Leave little notches in the alpha channel at the outer ends of the needles.
  // The solid middle still reads as one carved shoot at a distance.
  ctx.fillStyle = '#ced6c8';
  ctx.fillRect(45, 0, 102, 384);
  for (let i = -4; i < 37; i++) {
    for (const side of [-1, 1]) {
      const y = i * 12 + 3.5 * Math.sin(i * 3.6 + side);
      const tip = 96 + side * (85 + 10 * Math.sin(i * 1.7 + side));
      const shoulder = 96 + side * 38;
      ctx.beginPath();
      ctx.moveTo(96, y + 37);
      ctx.quadraticCurveTo(shoulder, y + 31, tip, y - 20);
      ctx.quadraticCurveTo(shoulder, y + 16, 96, y + 22);
      ctx.fillStyle = i % 3 ? '#edf0dc' : '#dae2d2';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(99 + side * 5, y + 29);
      ctx.quadraticCurveTo(shoulder, y + 26, tip - side * 4, y - 17);
      ctx.strokeStyle = i % 4 ? '#b2c2b1' : '#94a997';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(shoulder, y + 17);
      ctx.lineTo(tip, y - 20);
      ctx.strokeStyle = '#fcf9e9';
      ctx.lineWidth = 2.3;
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#c5c8a5';
  ctx.fillRect(94, 0, 3, 384);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// One branch, sized in normalized crown coordinates. Each side shoot has a raised
// central rib, two beveled flanks and a darker underside, all in the same mesh.
function firBranchGeometry(simple = false) {
  const positions = [], colors = [], uvs = [], indices = [];
  const dark = new THREE.Color('#19493f');
  const green = new THREE.Color('#468777');
  const sage = new THREE.Color('#cbd8c6');
  const color = new THREE.Color();
  const sections = simple
    ? [[0, .045], [.44, 1], [.78, .7], [1, .018]]
    : [[0, .045], [.18, .66], [.43, 1], [.70, .84], [.89, .43], [1, .018]];
  const edges = simple
    ? [[-1, 0], [0, 1], [1, 0], [0, -.48]]
    : [[-1, 0], [-.55, .54], [0, 1], [.55, .50], [1, 0], [0, -.48]];

  function shoot(start, end, initialX, finalX, breadth, ridge) {
    const first = positions.length / 3;
    for (let row = 0; row < sections.length; row++) {
      const [t, fullness] = sections[row];
      const z = start + (end - start) * t;
      const x = THREE.MathUtils.lerp(initialX, finalX, t * (.7 + .3 * t));
      const centerY = (1 - z) ** 1.24 + .035 * z ** 8;
      for (let col = 0; col < edges.length; col++) {
        const [side, bevel] = edges[col];
        positions.push(x + side * breadth * fullness, centerY + ridge * fullness * bevel, z);
        const faceLight = bevel > 0 ? .28 + .45 * bevel : .1;
        color.copy(dark).lerp(green, faceLight + .20 * t);
        color.lerp(sage, (.23 + .40 * Math.max(0, bevel)) * t ** 3);
        if (bevel < 0) color.multiplyScalar(.68);
        colors.push(color.r, color.g, color.b);
        uvs.push(.5 + side * .5, t);
        if (row === 0) continue;
        const a = first + (row - 1) * edges.length + col;
        const b = first + (row - 1) * edges.length + (col + 1) % edges.length;
        indices.push(a, a + edges.length, b, b, a + edges.length, b + edges.length);
      }
    }
  }

  shoot(.015, 1, 0, 0, .39, .058);
  for (const i of simple ? [0, 1.66, 3.33, 5] : [0, 1, 2, 3, 4, 5]) {
    const start = .06 + i * .127;
    const end = .40 + i * .106;
    const spread = .40 + .57 * Math.sin((i + 1) * Math.PI / 8);
    for (const side of [-1, 1]) {
      const stagger = side < 0 ? .018 : 0;
      shoot(start + stagger, end + stagger, side * .05, side * spread, .34 - i * .022, .046);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// The crown can spread between turns; along the track the branch ends just inside
// the guard rail. Also allow room for the small ornaments hanging below the tips.
function branchReach(angle, layer, reach) {
  const halfAngle = Math.PI / layer.count;
  // The side shoots fan out more widely than the terminal tip.
  for (let offset = -2; offset <= 2; offset++) {
    const sector = ((angle + halfAngle * offset) / tau + 1) % 1;
    for (let turn = 0; turn < SPIRAL_TURNS; turn++) {
      const t = (turn + sector) / SPIRAL_TURNS;
      const track = spiralPositionAtT(t);
      if (track.y >= layer.y - 1.8 && track.y <= layer.y + 2.6) {
        reach = Math.min(reach, track.r - trackWidthAtT(t) / 2 - .65);
      }
    }
  }
  return reach;
}

function brassStar() {
  const positions = [], colors = [];
  const gold = ['#ffdc83', '#c28735', '#f0be62', '#ac702c'].map(c => new THREE.Color(c));
  const middle = [0, 0, .47];
  function point(i) {
    const a = i * Math.PI / 8 + Math.PI / 2;
    const radius = i % 2 ? .77 : i % 4 ? 1.77 : 2.35;
    return [Math.cos(a) * radius, Math.sin(a) * radius, 0];
  }
  for (let i = 0; i < 16; i++) {
    const a = point(i), b = point(i + 1);
    positions.push(...middle, ...a, ...b, 0, 0, -.38, ...b, ...a);
    const c = gold[i % 4];
    for (let k = 0; k < 6; k++) colors.push(c.r, c.g, c.b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const star = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    vertexColors: true, metalness: .58, roughness: .28, emissive: '#694219', emissiveIntensity: .24,
  }));
  const hub = new THREE.Mesh(new THREE.IcosahedronGeometry(.31, 1),
    new THREE.MeshStandardMaterial({color: '#ffe6a3', metalness: .67, roughness: .24}));
  hub.position.z = .39;
  hub.scale.z = .55;
  star.add(hub);
  star.position.y = 31.54;
  return star;
}

export function buildChristmasTree(scene, flareMap) {
  const group = new THREE.Group();
  scene.add(group);
  const profile = [[.08, .02], [1.65, .02], [1.73, .22], [1.51, .40], [1.38, 2.5],
    [.99, 8], [.64, 17], [.22, 26.7], [.16, 29.4], [.35, 29.50], [.26, 29.73], [.11, 29.95]];
  const trunk = new THREE.Mesh(
    new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 32),
    new THREE.MeshStandardMaterial({color: '#775134', roughness: .71})
  );
  group.add(trunk);

  const bronze = new THREE.MeshStandardMaterial({color: '#cc9c55', metalness: .67, roughness: .37});
  const ferrule = new THREE.Mesh(new THREE.LatheGeometry([
    [.16, 29.32], [.37, 29.43], [.38, 29.51], [.23, 29.59], [.19, 29.90], [.12, 30.08],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 24), bronze);
  group.add(ferrule);

  const count = treeLayers.reduce((sum, layer) => sum + layer.count, 0);
  const detailedBranch = firBranchGeometry();
  const lightBranch = firBranchGeometry(true);
  const sprigs = new THREE.InstancedMesh(detailedBranch, new THREE.MeshStandardMaterial({
    map: needleTexture(), alphaTest: .44, vertexColors: true, roughness: .78, side: THREE.DoubleSide,
  }), count);
  const pose = new THREE.Object3D();
  const shade = new THREE.Color();
  const shadeA = new THREE.Color('#aec5b3'), shadeB = new THREE.Color('#fff5cf');
  const lamps = [], pendants = [], garlandRings = [];
  let slot = 0;
  treeLayers.forEach((layer, level) => {
    const tips = [];
    for (let j = 0; j < layer.count; j++) {
      const offset = Math.sin(level * 3.7 + j * 5.3);
      const angle = (j * tau / layer.count + level * 2.39996 + .033 * offset) % tau;
      const radius = branchReach(angle, layer, layer.r * (1 + .043 * offset));
      const rise = layer.rise * (.97 + .045 * Math.cos(j * 2.7));
      const y = layer.y + offset * .13;
      pose.position.set(0, y, 0);
      pose.rotation.set(0, angle, 0);
      pose.scale.set(radius * Math.sin(Math.PI / layer.count) * 1.24, rise, radius);
      pose.updateMatrix();
      sprigs.setMatrixAt(slot, pose.matrix);
      shade.copy(shadeA).lerp(shadeB, .46 + .38 * Math.sin(j * 1.7 + level * 2.3));
      sprigs.setColorAt(slot++, shade);
      // Use the same instance transform as the carved terminal shoot.
      const tip = new THREE.Vector3(0, .035, 1).applyMatrix4(pose.matrix);
      tips.push(tip);
      if (j % 2 === 0) lamps.push(tip);
      else if ((j + level) % 3 !== 1) pendants.push(tip);
    }
    if ([1, 4, 7].includes(level)) garlandRings.push(tips);
  });
  sprigs.castShadow = true;
  sprigs.receiveShadow = true;
  group.add(sprigs);

  // A fine swag between the actual branch tips, with one brass bead at each dip.
  const wirePositions = [], dips = [];
  for (const tips of garlandRings) {
    tips.forEach((left, i) => {
      const right = tips[(i + 1) % tips.length];
      const sag = left.distanceTo(right) * .20;
      let previous = left;
      for (let step = 1; step <= 8; step++) {
        const t = step / 8;
        const point = left.clone().lerp(right, t);
        point.y -= 4 * t * (1 - t) * sag;
        wirePositions.push(previous.x, previous.y, previous.z, point.x, point.y, point.z);
        if (step === 4) dips.push(point);
        previous = point;
      }
    });
  }
  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wirePositions, 3));
  const wire = new THREE.LineSegments(wireGeometry, new THREE.LineBasicMaterial({color: '#be975c'}));
  const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(.09, 8, 6), bronze, dips.length);
  pose.scale.setScalar(1);
  dips.forEach((dip, i) => {
    pose.position.copy(dip);
    pose.updateMatrix();
    beads.setMatrixAt(i, pose.matrix);
  });
  group.add(wire, beads);

  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6),
    new THREE.MeshBasicMaterial({color: '#ffffff'}), lamps.length);
  const bulbMeta = [];
  const glowColors = ['#ffdda0', '#fff0bf', '#f5c076'].map(c => new THREE.Color(c));
  pose.rotation.set(0, 0, 0);
  lamps.forEach((tip, i) => {
    const size = .105 + (1 - tip.y / 30) * .07;
    pose.position.copy(tip);
    pose.position.y -= size * .52;
    pose.scale.set(size, size * 1.17, size);
    pose.updateMatrix();
    bulbs.setMatrixAt(i, pose.matrix);
    const baseCol = glowColors[i % glowColors.length];
    bulbs.setColorAt(i, baseCol);
    bulbMeta.push({ baseCol, phase: i * 2.4, hFrac: tip.y / 30 });
  });
  group.add(bulbs);

  const enamel = new THREE.MeshPhysicalMaterial({
    metalness: .25, roughness: .26, clearcoat: .76, clearcoatRoughness: .19,
  });
  const baubles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), enamel, pendants.length);
  const caps = new THREE.InstancedMesh(new THREE.CylinderGeometry(.62, .91, 1, 10), bronze, pendants.length);
  const lacquer = ['#aa2b22', '#c79649', '#ad382a', '#dbc593'].map(c => new THREE.Color(c));
  pendants.forEach((tip, i) => {
    const r = .18 + (1 - tip.y / 29) * .22;
    const length = r * (i % 3 === 0 ? 1.4 : 1.05);
    pose.position.copy(tip);
    pose.position.y -= r * .24;
    pose.scale.set(r * .39, r * .56, r * .39);
    pose.updateMatrix();
    caps.setMatrixAt(i, pose.matrix);
    pose.position.y = tip.y - r * .49 - length;
    pose.scale.set(r, length, r);
    pose.updateMatrix();
    baubles.setMatrixAt(i, pose.matrix);
    baubles.setColorAt(i, lacquer[i % lacquer.length]);
  });
  group.add(caps, baubles);

  const star = brassStar();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: flareMap, color: '#ffdf94', transparent: true, opacity: .24,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  halo.position.copy(star.position);
  halo.scale.setScalar(5.1);
  group.add(star, halo);
  return {
    star, halo, bulbs, bulbMeta,
    setLowQuality(enabled) {
      sprigs.geometry = enabled ? lightBranch : detailedBranch;
    },
  };
}
