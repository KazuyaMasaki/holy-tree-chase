import * as THREE from 'three';
import { buildChristmasTree } from './christmas-tree.js';
import { alpineChalets, miniaturePines, toyLandscape, woodLaneTexture } from './toy-model.js';
import {
  FUNNEL,
  MARBLE_RADIUS,
  START_BOWL,
  TRACK_LENGTH,
  buildCourseFeatures,
  funnelHeightAtRadius,
  gateCenterU,
  trackFrameAtS,
  trackToWorld,
} from './track.js';

// ============================================================
// Procedural Textures & Sprite Helpers (Zero External Assets!)
// ============================================================

function createGlowTexture(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,230,160,0.45)', outer = 'rgba(255,180,80,0)') {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.32, mid);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createStarFlareTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.translate(128, 128);

  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 124);
  g.addColorStop(0, 'rgba(255,252,225,1)');
  g.addColorStop(0.18, 'rgba(255,222,120,0.82)');
  g.addColorStop(0.5, 'rgba(255,184,70,0.22)');
  g.addColorStop(1, 'rgba(255,160,40,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 124, 0, Math.PI * 2);
  ctx.fill();

  // Crisp four-point starlight rays
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 4);
    const len = i % 2 === 0 ? 120 : 72;
    const rg = ctx.createLinearGradient(-len, 0, len, 0);
    rg.addColorStop(0, 'rgba(255,235,160,0)');
    rg.addColorStop(0.5, 'rgba(255,250,210,0.85)');
    rg.addColorStop(1, 'rgba(255,235,160,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(-len, -3.5, len * 2, 7);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createCandyCaneTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff9f2';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#d92638';
  for (let i = -128; i < 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 15, 0);
    ctx.lineTo(i + 15 + 128, 128);
    ctx.lineTo(i + 128, 128);
    ctx.closePath();
    ctx.fill();
  }
  // Delicate gold pinstripe
  ctx.strokeStyle = 'rgba(248, 200, 72, 0.7)';
  ctx.lineWidth = 2;
  for (let i = -128; i < 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i + 16, 0);
    ctx.lineTo(i + 16 + 128, 128);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createBoostPadTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');

  const g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, 'rgba(98, 55, 18, 0.25)');
  g.addColorStop(0.2, 'rgba(153, 77, 37, 0.78)');
  g.addColorStop(0.5, 'rgba(205, 153, 64, 0.92)');
  g.addColorStop(0.8, 'rgba(153, 77, 37, 0.78)');
  g.addColorStop(1, 'rgba(98, 55, 18, 0.25)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);

  // Bright gold/cyan chevrons pointing in +V (forward along track tangent!)
  for (let i = 0; i < 3; i++) {
    const y = 66 + i * 76;
    ctx.strokeStyle = i === 1 ? '#fff7b0' : '#e6c47a';
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(42, y);
    ctx.lineTo(128, y - 46);
    ctx.lineTo(214, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createOrnamentTexture(hexColor, accentColor, pattern) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');

  // Deep lustrous base gradient
  const bg = ctx.createLinearGradient(0, 0, 0, 128);
  bg.addColorStop(0, hexColor);
  bg.addColorStop(0.5, hexColor);
  bg.addColorStop(1, '#181825');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 128);

  // Equatorial festive band + pattern
  ctx.fillStyle = accentColor;
  ctx.strokeStyle = accentColor;

  if (pattern === 'stripe') {
    for (let x = -64; x < 320; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 12, 0);
      ctx.lineTo(x + 48, 128);
      ctx.lineTo(x + 36, 128);
      ctx.closePath();
      ctx.globalAlpha = 0.82;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (pattern === 'snowflake') {
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(0, 44, 256, 40);
    ctx.lineWidth = 2.5;
    for (let x = 32; x < 256; x += 64) {
      ctx.save();
      ctx.translate(x, 64);
      for (let k = 0; k < 6; k++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -16);
        ctx.stroke();
      }
      ctx.restore();
    }
  } else if (pattern === 'swirl') {
    ctx.lineWidth = 10;
    ctx.globalAlpha = 0.85;
    for (let yOff = 24; yOff <= 104; yOff += 40) {
      ctx.beginPath();
      for (let x = 0; x <= 256; x += 8) {
        const y = yOff + Math.sin((x / 256) * Math.PI * 6) * 9;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (pattern === 'stars') {
    const drawMiniStar = (cx, cy, r) => {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 === 0 ? r : r * 0.44;
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        const px = cx + Math.cos(a) * rad;
        const py = cy + Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    };
    for (let x = 24; x < 256; x += 48) {
      drawMiniStar(x, 64, 12);
      drawMiniStar(x + 24, 32, 6);
      drawMiniStar(x + 24, 96, 6);
    }
  } else {
    // Diamond argyle festive band
    ctx.globalAlpha = 0.85;
    for (let x = 16; x < 256; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 38);
      ctx.lineTo(x + 14, 64);
      ctx.lineTo(x, 90);
      ctx.lineTo(x - 14, 64);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Thin shimmering gold equator borders
  ctx.fillStyle = '#ffe599';
  ctx.fillRect(0, 22, 256, 3);
  ctx.fillRect(0, 103, 256, 3);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createStarShapeGeometry(outerR = 1.65, innerR = 0.68, depth = 0.42) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (i * Math.PI) / 5 + Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.18,
    bevelSize: 0.14,
    bevelSegments: 2,
  });
  geo.center();
  return geo;
}

// ============================================================
// Main 3D Stage Renderer
// ============================================================

export class ChristmasStage {
  constructor(canvas, labelLayer) {
    this.canvas = canvas;
    this.labelLayer = labelLayer;
    this.lowQuality = false;
    this.cameraMode = 'follow'; // 'follow' | 'overview'
    this.clockTime = 0;
    this.victoryCelebration = 0;
    this.winnerId = null;

    // Renderer tuned for cinematic holiday warmth & crisp performance
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .92;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2('#52695e', 0.0065);

    this.camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.25, 280);
    this.camPos = new THREE.Vector3(-4.5, 18.8, 52.0);
    this.camTarget = new THREE.Vector3(-3.4, 14.8, 4.5);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);

    // Reusable temp vectors
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._proj = new THREE.Vector3();

    // Shared procedural assets
    this.glowTex = createGlowTexture();
    this.cyanGlowTex = createGlowTexture('rgba(230,255,255,1)', 'rgba(100,235,255,0.55)', 'rgba(50,180,255,0)');
    this.starFlareTex = createStarFlareTexture();
    this.candyTex = createCandyCaneTexture();
    this.trackTex = woodLaneTexture();
    this.boostTex = createBoostPadTexture();

    this.features = buildCourseFeatures();
    this.marbleMeshes = new Map();
    this.labelEls = new Map();
    this.pinAnim = new Map();
    this.bellAnim = new Map();
    this.gateMeshes = [];
    this.boostMaterials = [];
    this.shockwaves = [];
    this.sparks = [];
    this.fireworks = [];
    this.confetti = null;

    this._buildEnvironmentMap();
    this._buildLighting();
    this._buildNightSky();
    this._buildSnowGroundAndVillage();
    toyLandscape(this.scene);
    this.tree = buildChristmasTree(this.scene, this.starFlareTex);
    this._buildSpiralTrack();
    this._buildCourseObstacles();
    this._buildStartBowl();
    this._buildSnowglobeFunnelAndChimney();
    this._buildSnowParticles();
    this._buildVictoryEffects();

    this.resize();
  }

  _buildEnvironmentMap() {
    // Procedural holiday studio reflection map so glass ornaments & gold rails shine realistically!
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color('#47534d');

    const panelGeo = new THREE.PlaneGeometry(14, 14);
    const warmMat = new THREE.MeshBasicMaterial({ color: '#ffd98a', side: THREE.DoubleSide });
    const coolMat = new THREE.MeshBasicMaterial({ color: '#e1e9d6', side: THREE.DoubleSide });
    const rubyMat = new THREE.MeshBasicMaterial({ color: '#ac7352', side: THREE.DoubleSide });

    const top = new THREE.Mesh(panelGeo, warmMat);
    top.position.set(0, 12, 0);
    top.rotation.x = Math.PI / 2;
    envScene.add(top);

    const left = new THREE.Mesh(panelGeo, coolMat);
    left.position.set(-14, 4, 4);
    left.rotation.y = Math.PI / 2;
    envScene.add(left);

    const right = new THREE.Mesh(panelGeo, warmMat);
    right.position.set(14, 5, 6);
    right.rotation.y = -Math.PI / 2;
    envScene.add(right);

    const back = new THREE.Mesh(panelGeo, rubyMat);
    back.position.set(0, 6, -14);
    envScene.add(back);

    const envRT = pmrem.fromScene(envScene, 0.04);
    this.scene.environment = envRT.texture;
    pmrem.dispose();
  }

  _buildLighting() {
    const hemi = new THREE.HemisphereLight('#c2d7d6', '#72604c', .76);
    this.scene.add(hemi);

    // Warm golden moonlight / key light casting soft shadows
    this.keyLight = new THREE.DirectionalLight('#ffe0ad', 2.1);
    this.keyLight.position.set(-27, 44, 32);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 10;
    this.keyLight.shadow.camera.far = 95;
    const d = 24;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = 34;
    this.keyLight.shadow.camera.bottom = -4;
    this.keyLight.shadow.bias = -0.0008;
    this.scene.add(this.keyLight);

    // Cool aurora rim light from behind-left to carve silhouettes crisply
    const rimLight = new THREE.DirectionalLight('#c1dbd9', .95);
    rimLight.position.set(-24, 24, -22);
    this.scene.add(rimLight);

    // Warm golden glow near the Top Star
    this.starLight = new THREE.PointLight('#ffd466', 34, 26, 1.5);
    this.starLight.position.set(0, 31.0, 0);
    this.scene.add(this.starLight);

    // Warm festive hearth light inside the Golden Chimney at the funnel center
    this.chimneyLight = new THREE.PointLight('#ffb84d', 36, 22, 1.4);
    this.chimneyLight.position.set(FUNNEL.cx, 2.2, FUNNEL.cz);
    this.scene.add(this.chimneyLight);

    // Soft tree core warm uplight
    const coreLight = new THREE.PointLight('#ff9e5e', 24, 28, 1.5);
    coreLight.position.set(0, 11, 6);
    this.scene.add(coreLight);
  }

  _buildNightSky() {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(145,32,20),new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      vertexShader: `varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `varying vec3 direction; void main(){
        float h=smoothstep(-.17,.55,normalize(direction).y);
        gl_FragColor=vec4(mix(vec3(.27,.36,.32),vec3(.038,.115,.108),h),1.);
      }`,
    }));
    this.scene.add(sky);

    // Crisp twinkling starfield
    const starCount = 220;
    const starPos = new Float32Array(starCount * 3);
    const starCol = new Float32Array(starCount * 3);
    const cWarm = new THREE.Color('#fff4d4');
    const cCool = new THREE.Color('#b6e6ff');
    const cGold = new THREE.Color('#ffd166');
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(0.12 + Math.random() * 0.88);
      const r = 126 + Math.random() * 10;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.cos(phi);
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const pick = i % 5 === 0 ? cGold : i % 2 === 0 ? cWarm : cCool;
      starCol[i * 3] = pick.r;
      starCol[i * 3 + 1] = pick.g;
      starCol[i * 3 + 2] = pick.b;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
    const starMat = new THREE.PointsMaterial({
      size: .70,
      map: this.glowTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.starField = new THREE.Points(starGeo, starMat);
    this.scene.add(this.starField);
  }

  _buildSnowGroundAndVillage() {
    miniaturePines(this.scene);

    // Warm Victorian Christmas lampposts ringing the snowy clearing!
    const postMat = new THREE.MeshStandardMaterial({ color: '#1f2937', metalness: 0.7, roughness: 0.35 });
    const lanternMat = new THREE.MeshBasicMaterial({ color: '#ffe599' });
    const lampAngles = [-1.03, .97, 2.35, -2.35];
    for (const a of lampAngles) {
      const lr = 16.8;
      const lx = Math.sin(a) * lr;
      const lz = Math.cos(a) * lr + 4.5;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 4.4, 8), postMat);
      post.position.set(lx, 2.2, lz);
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 10), lanternMat);
      lantern.position.set(lx, 4.55, lz);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex,
        color: '#ffcc66',
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      halo.position.set(lx, 4.55, lz);
      halo.scale.set(4.2, 4.2, 1);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(.49,.37,4),postMat);
      shade.position.set(lx,4.94,lz);
      halo.scale.set(1.9,1.9,1); halo.material.opacity = .35;
      this.scene.add(post,lantern,shade,halo);
    }

    // Cozy Nordic wooden chalets with warm glowing windows around the clearing
    const chaletCoords = [
      { x: -19, z: 6, ry: 0.65, s: 1.15 },
      { x: 20, z: 7, ry: -0.75, s: 1.1 },
      { x: -12, z: -12, ry: 0.35, s: 1.25 },
      { x: 14, z: -10, ry: -0.42, s: 1.2 },
    ];
    alpineChalets(this.scene, chaletCoords);

    // Festive decorative giant gift boxes nestled under the tree base
    const giftColors = ['#d92638', '#1d8a68', '#b99c67', '#ae5a32', '#723c32'];
    const ribbonMat = new THREE.MeshStandardMaterial({ color: '#ffd166', metalness: 0.65, roughness: 0.25 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.3;
      // Keep the funnel zone clear
      const px = Math.sin(a) * (7.2 + (i % 3) * 1.4);
      const pz = Math.cos(a) * (7.2 + (i % 3) * 1.4);
      if (pz > 8.5 && Math.abs(px) < 6.5) continue;

      const size = 1.05 + (i % 3) * 0.35;
      const boxGroup = new THREE.Group();
      const boxMat = new THREE.MeshStandardMaterial({
        color: giftColors[i % giftColors.length],
        roughness: 0.38,
        metalness: 0.12,
      });
      const cube = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.85, size), boxMat);
      cube.castShadow = true;
      cube.receiveShadow = true;
      boxGroup.add(cube);

      const rib1 = new THREE.Mesh(new THREE.BoxGeometry(size + 0.05, size * 0.88, size * 0.18), ribbonMat);
      const rib2 = new THREE.Mesh(new THREE.BoxGeometry(size * 0.18, size * 0.88, size + 0.05), ribbonMat);
      boxGroup.add(rib1, rib2);

      boxGroup.position.set(px, size * 0.425, pz);
      boxGroup.rotation.y = i * 0.9;
      this.scene.add(boxGroup);
    }
  }

  _buildSpiralTrack() {
    const segments = 340;
    const bedPositions = [];
    const bedNormals = [];
    const bedUvs = [];
    const bedIndices = [];

    const leftRailPts = [];
    const rightRailPts = [];
    const railLightPositions = [];

    for (let i = 0; i <= segments; i++) {
      const s = (i / segments) * TRACK_LENGTH;
      const f = trackFrameAtS(s);
      const hw = f.halfWidth;
      const vCoord = s / 4.8;

      // Cross-section with slightly raised outer lips (elegant shallow cradle)
      const offsets = [-hw, -hw * 0.55, 0, hw * 0.55, hw];
      const heights = [0.16, 0.02, 0, 0.02, 0.16];
      const uCoords = [0, 0.22, 0.5, 0.78, 1];

      for (let k = 0; k < offsets.length; k++) {
        const u = offsets[k];
        const h = heights[k];
        bedPositions.push(
          f.pos.x + f.right.x * u + f.up.x * h,
          f.pos.y + f.right.y * u + f.up.y * h,
          f.pos.z + f.right.z * u + f.up.z * h
        );
        bedNormals.push(f.up.x, f.up.y, f.up.z);
        bedUvs.push(uCoords[k], vCoord);
      }

      const railH = 0.58;
      leftRailPts.push(new THREE.Vector3(
        f.pos.x - f.right.x * hw + f.up.x * railH,
        f.pos.y - f.right.y * hw + f.up.y * railH,
        f.pos.z - f.right.z * hw + f.up.z * railH
      ));
      rightRailPts.push(new THREE.Vector3(
        f.pos.x + f.right.x * hw + f.up.x * railH,
        f.pos.y + f.right.y * hw + f.up.y * railH,
        f.pos.z + f.right.z * hw + f.up.z * railH
      ));

      if (i % 6 === 0) {
        railLightPositions.push(new THREE.Vector3(
          f.pos.x + f.right.x * (hw + 0.12) + f.up.x * (railH + 0.14),
          f.pos.y + f.right.y * (hw + 0.12) + f.up.y * (railH + 0.14),
          f.pos.z + f.right.z * (hw + 0.12) + f.up.z * (railH + 0.14)
        ));
      }

      if (i < segments) {
        const stride = offsets.length;
        const row0 = i * stride;
        const row1 = (i + 1) * stride;
        for (let k = 0; k < stride - 1; k++) {
          bedIndices.push(row0 + k, row0 + k + 1, row1 + k);
          bedIndices.push(row0 + k + 1, row1 + k + 1, row1 + k);
        }
      }
    }

    const bedGeo = new THREE.BufferGeometry();
    bedGeo.setAttribute('position', new THREE.Float32BufferAttribute(bedPositions, 3));
    bedGeo.setAttribute('normal', new THREE.Float32BufferAttribute(bedNormals, 3));
    bedGeo.setAttribute('uv', new THREE.Float32BufferAttribute(bedUvs, 2));
    bedGeo.setIndex(bedIndices);
    bedGeo.computeVertexNormals();

    const bedMat = new THREE.MeshStandardMaterial({
      map: this.trackTex,
      roughness: .6,
      metalness: .07,
      side: THREE.DoubleSide,
    });
    const bedMesh = new THREE.Mesh(bedGeo, bedMat);
    bedMesh.receiveShadow = true;
    this.scene.add(bedMesh);

    // Ornate brushed-gold guard rails along both sides of the spiral!
    const goldRailMat = new THREE.MeshStandardMaterial({
      color: '#c59a55',
      metalness: 0.85,
      roughness: 0.22,
      emissive: '#593b08',
      emissiveIntensity: 0.28,
    });

    const leftCurve = new THREE.CatmullRomCurve3(leftRailPts);
    const rightCurve = new THREE.CatmullRomCurve3(rightRailPts);
    const leftTube = new THREE.Mesh(new THREE.TubeGeometry(leftCurve, 260, 0.13, 8, false), goldRailMat);
    const rightTube = new THREE.Mesh(new THREE.TubeGeometry(rightCurve, 260, 0.13, 8, false), goldRailMat);
    this.scene.add(leftTube, rightTube);

    // Rail posts fix the brass wire to the outside of the wooden ramp.
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(.058,.082,.63,8),goldRailMat,57);
    const post = new THREE.Object3D();
    for (let i=0;i<posts.count;i++) {
      const s = TRACK_LENGTH * i / (posts.count - 1);
      const f = trackFrameAtS(s), p = trackToWorld(s,f.halfWidth,.31);
      post.position.set(p.x,p.y,p.z); post.updateMatrix(); posts.setMatrixAt(i,post.matrix);
    }
    this.scene.add(posts);

    // Solid edge of the timber ramp along rails so marbles visibly stay inside a crystal chute
    const createRailCurtain = (sign) => {
      const pts = [];
      const idx = [];
      for (let i = 0; i <= 180; i++) {
        const s = (i / 180) * TRACK_LENGTH;
        const f = trackFrameAtS(s);
        const u = sign * f.halfWidth;
        pts.push(
          f.pos.x + f.right.x * u + f.up.x * 0.12,
          f.pos.y + f.right.y * u + f.up.y * 0.12,
          f.pos.z + f.right.z * u + f.up.z * 0.12,
          f.pos.x + f.right.x * u + f.up.x * -.21,
          f.pos.y + f.right.y * u + f.up.y * -.21,
          f.pos.z + f.right.z * u + f.up.z * -.21
        );
        if (i < 180) {
          const b = i * 2;
          idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return new THREE.Mesh(
        g,
        new THREE.MeshStandardMaterial({
          color: '#ae814a',
          roughness: .61,
          side: THREE.DoubleSide,
        })
      );
    };
    this.scene.add(createRailCurtain(-1), createRailCurtain(1));

    // Glowing fairy-light string dotted along the outer golden rail!
    const rlGeo = new THREE.SphereGeometry(0.11, 7, 7);
    const rlMat = new THREE.MeshBasicMaterial({ color: '#fff3c4' });
    this.railLights = new THREE.InstancedMesh(rlGeo, rlMat, railLightPositions.length);
    const dummy = new THREE.Object3D();
    const c1 = new THREE.Color('#ffe89e');
    const c2 = new THREE.Color('#c3834d');
    const c3 = new THREE.Color('#f9dfac');
    railLightPositions.forEach((pt, idx) => {
      dummy.position.copy(pt);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.railLights.setMatrixAt(idx, dummy.matrix);
      this.railLights.setColorAt(idx, idx % 6 === 0 ? c2 : idx % 6 === 3 ? c3 : c1);
    });
    this.railLights.instanceColor.needsUpdate = true;
    this.scene.add(this.railLights);
  }

  _buildCourseObstacles() {
    const { pins, bells, gates, boosts, dividers } = this.features;

    // 1. Zone 1: Candy Cane Pins
    const pinMat = new THREE.MeshStandardMaterial({
      map: this.candyTex,
      roughness: 0.25,
      metalness: 0.08,
    });
    const pinGeo = new THREE.CylinderGeometry(0.17, 0.17, 1.05, 12);
    const pinCapGeo = new THREE.SphereGeometry(0.17, 10, 8);

    for (const pin of pins) {
      const w = trackToWorld(pin.s, pin.u, 0.02);
      const group = new THREE.Group();
      group.position.set(w.x, w.y, w.z);
      const stem = new THREE.Mesh(pinGeo, pinMat);
      stem.position.y = 0.52;
      stem.castShadow = true;
      const cap = new THREE.Mesh(pinCapGeo, pinMat);
      cap.position.y = 1.04;
      group.add(stem, cap);
      this.scene.add(group);
      this.pinAnim.set(pin.id, { group, shake: 0 });
    }

    // 2. Zone 2 & 3: Golden Jingle Bells & Festive Gift Bumpers
    const goldBellMat = new THREE.MeshStandardMaterial({
      color: '#ffd452',
      emissive: '#6e4700',
      emissiveIntensity: 0.35,
      metalness: 0.88,
      roughness: 0.16,
    });
    const bowRedMat = new THREE.MeshStandardMaterial({
      color: '#e62e45',
      roughness: 0.35,
      metalness: 0.1,
    });

    const bellLathePts = [
      new THREE.Vector2(0.02, 0.92),
      new THREE.Vector2(0.20, 0.86),
      new THREE.Vector2(0.28, 0.52),
      new THREE.Vector2(0.36, 0.18),
      new THREE.Vector2(0.39, 0.05),
      new THREE.Vector2(0.31, 0.02),
    ];
    const bellGeo = new THREE.LatheGeometry(bellLathePts, 18);

    for (const b of bells) {
      const w = trackToWorld(b.s, b.u, 0.04);
      const group = new THREE.Group();
      group.position.set(w.x, w.y, w.z);

      if (b.kind === 'gift') {
        const gMat = new THREE.MeshStandardMaterial({
          color: '#189e77',
          roughness: 0.32,
          metalness: 0.18,
          emissive: '#073b2c',
          emissiveIntensity: 0.3,
        });
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.68, 0.66), gMat);
        box.position.y = 0.35;
        box.castShadow = true;
        const r1 = new THREE.Mesh(new THREE.BoxGeometry(0.70, 0.70, 0.15), bowRedMat);
        r1.position.y = 0.35;
        const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.70, 0.70), bowRedMat);
        r2.position.y = 0.35;
        const topKnot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.14, 0.045, 24, 6), goldBellMat);
        topKnot.position.y = 0.78;
        group.add(box, r1, r2, topKnot);
      } else {
        const bellMesh = new THREE.Mesh(bellGeo, goldBellMat.clone());
        bellMesh.position.y = 0.08;
        bellMesh.castShadow = true;
        const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), goldBellMat);
        clapper.position.y = 0.1;
        const bowL = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), bowRedMat);
        bowL.scale.set(1.3, 0.7, 0.7);
        bowL.position.set(-0.14, 0.98, 0);
        const bowR = bowL.clone();
        bowR.position.x = 0.14;
        group.add(bellMesh, clapper, bowL, bowR);
      }
      this.scene.add(group);
      this.bellAnim.set(b.id, { group, pulse: 0, baseScale: 1 });
    }

    // 3. Zone 2: Oscillating Christmas Wreath Gates
    const wreathLeafMat = new THREE.MeshStandardMaterial({ color: '#1b8a4b', roughness: 0.65 });
    const berryMat = new THREE.MeshStandardMaterial({ color: '#ff2e4c', emissive: '#590816', emissiveIntensity: 0.5, roughness: 0.25 });

    for (const gate of gates) {
      const f = trackFrameAtS(gate.s);
      const group = new THREE.Group();

      // Festive holiday barrier bar topped with glowing holly wreaths!
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(gate.barHalfWidth * 2, 0.56, gate.thickness),
        new THREE.MeshStandardMaterial({ map: this.candyTex, roughness: 0.3 })
      );
      bar.position.y = 0.34;
      bar.castShadow = true;
      group.add(bar);

      // Ornate Christmas wreath emblem mounted prominently on top of the moving gate
      const wreath = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.12, 10, 20), wreathLeafMat);
      wreath.position.y = 0.92;
      group.add(wreath);

      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const berry = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), berryMat);
        berry.position.set(Math.cos(a) * 0.38, 0.92 + Math.sin(a) * 0.38, 0.08);
        group.add(berry);
      }
      const bow = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.16), bowRedMat);
      bow.position.set(0, 1.28, 0.06);
      group.add(bow);

      // Orient gate group to align X with track.right, Y with track.up, Z with track.tangent
      const mat = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(f.right.x, f.right.y, f.right.z),
        new THREE.Vector3(f.up.x, f.up.y, f.up.z),
        new THREE.Vector3(f.tangent.x, f.tangent.y, f.tangent.z)
      );
      group.quaternion.setFromRotationMatrix(mat);
      this.scene.add(group);
      this.gateMeshes.push({ gate, frame: f, group });
    }

    // 4. Zone 3: Split Shortcut Candy-Cane Divider Rail
    for (const div of dividers) {
      const pts = [];
      const steps = 42;
      for (let i = 0; i <= steps; i++) {
        const s = div.sStart + ((div.sEnd - div.sStart) * i) / steps;
        const w = trackToWorld(s, div.u, 0.36);
        pts.push(new THREE.Vector3(w.x, w.y, w.z));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const rail = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 48, 0.15, 10, false),
        new THREE.MeshStandardMaterial({ map: this.candyTex, roughness: 0.28 })
      );
      this.scene.add(rail);

      // Glowing golden nose-post at the split entrance
      const nosePos = trackToWorld(div.sStart, div.u, 0.55);
      const noseStar = new THREE.Mesh(
        createStarShapeGeometry(0.45, 0.2, 0.14),
        new THREE.MeshStandardMaterial({ color: '#ffd966', emissive: '#ff9f1c', emissiveIntensity: 0.85, metalness: 0.85, roughness: 0.2 })
      );
      noseStar.position.set(nosePos.x, nosePos.y + 0.5, nosePos.z);
      this.scene.add(noseStar);
    }

    // 5. Glowing Star Boost Pads
    for (const pad of boosts) {
      const f = trackFrameAtS(pad.s);
      const tex = this.boostTex.clone();
      tex.needsUpdate = true;
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.boostMaterials.push(mat);

      const plane = new THREE.Mesh(new THREE.PlaneGeometry(pad.halfU * 2, pad.halfS * 2), mat);
      const pos = trackToWorld(pad.s, pad.u, 0.08);
      plane.position.set(pos.x, pos.y, pos.z);
      // Plane default normal is +Z; orient so X=right, Y=tangent, Z=up
      const basis = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(f.right.x, f.right.y, f.right.z),
        new THREE.Vector3(f.tangent.x, f.tangent.y, f.tangent.z),
        new THREE.Vector3(f.up.x, f.up.y, f.up.z)
      );
      plane.quaternion.setFromRotationMatrix(basis);
      this.scene.add(plane);
    }
  }

  _buildStartBowl() {
    this.startBowlGroup = new THREE.Group();
    this.startBowlGroup.position.set(START_BOWL.cx, START_BOWL.cy, START_BOWL.cz);

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: '#dff4ff',
      transparent: true,
      opacity: 0.32,
      roughness: 0.08,
      metalness: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: '#ffd166',
      metalness: 0.88,
      roughness: 0.18,
    });

    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(START_BOWL.radius + 0.15, START_BOWL.radius - 0.1, 1.35, 28, 1, true),
      glassMat
    );
    wall.position.y = 0.52;
    this.startBowlGroup.add(wall);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(START_BOWL.radius + 0.15, 0.09, 10, 32), goldMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 1.18;
    this.startBowlGroup.add(rim);

    // Animated iris trapdoor that swings open on DROP!
    this.startTrapdoor = new THREE.Mesh(
      new THREE.CylinderGeometry(START_BOWL.radius - 0.08, START_BOWL.radius - 0.08, 0.12, 24),
      new THREE.MeshStandardMaterial({
        color: '#ffe599',
        emissive: '#b57b14',
        emissiveIntensity: 0.4,
        metalness: 0.7,
        roughness: 0.25,
        transparent: true,
        opacity: 0.85,
      })
    );
    this.startTrapdoor.position.y = -0.15;
    this.startBowlGroup.add(this.startTrapdoor);

    // Ornate golden support ring connecting the Star-Gate bowl down to the spiral start
    const chuteLip = new THREE.Mesh(
      new THREE.CylinderGeometry(START_BOWL.radius - 0.12, START_BOWL.radius * 0.72, 0.95, 24, 1, true),
      new THREE.MeshStandardMaterial({
        color: '#f5c249',
        metalness: 0.85,
        roughness: 0.2,
        side: THREE.DoubleSide,
      })
    );
    chuteLip.position.y = -0.62;
    this.startBowlGroup.add(chuteLip);

    this.scene.add(this.startBowlGroup);
  }

  _buildSnowglobeFunnelAndChimney() {
    const group = new THREE.Group();
    group.position.set(FUNNEL.cx, 0, FUNNEL.cz);

    // Build exact LatheGeometry matching funnelHeightAtRadius(r)
    const lathePts = [];
    const samples = 24;
    for (let i = 0; i <= samples; i++) {
      const r = FUNNEL.holeRadius + ((FUNNEL.rimRadius - FUNNEL.holeRadius) * i) / samples;
      const y = funnelHeightAtRadius(r);
      lathePts.push(new THREE.Vector2(r, y));
    }
    // Add short vertical crystal outer wall
    lathePts.push(new THREE.Vector2(FUNNEL.rimRadius, FUNNEL.rimY + FUNNEL.wallHeight));

    const funnelGeo = new THREE.LatheGeometry(lathePts, 52);
    const funnelMat = new THREE.MeshPhysicalMaterial({
      color: '#b18757',
      emissive: '#765430',
      emissiveIntensity: .03,
      roughness: .56,
      metalness: .24,
      clearcoat: 1.0,
      side: THREE.DoubleSide,
    });
    const funnelMesh = new THREE.Mesh(funnelGeo, funnelMat);
    funnelMesh.receiveShadow = true;
    group.add(funnelMesh);

    const profile = [
      [.95,.26],[1.38,.23],[1.57,.39],[1.62,.57],
      [2.15,.86],[3.08,1.50],[4.16,2.52],[5.06,3.62],[5.15,3.90],
    ];
    const shell = new THREE.Mesh(
      new THREE.LatheGeometry(profile.map(([r,y]) => new THREE.Vector2(r,y)),64),
      new THREE.MeshStandardMaterial({color:'#955734',roughness:.57,metalness:.09,side:THREE.DoubleSide})
    );
    group.add(shell);

    // Ornate glowing golden rim rings
    const goldMat = new THREE.MeshStandardMaterial({
      color: '#ffcf56',
      emissive: '#8f5a08',
      emissiveIntensity: 0.4,
      metalness: 0.88,
      roughness: 0.18,
    });
    const topRim = new THREE.Mesh(new THREE.TorusGeometry(FUNNEL.rimRadius, 0.16, 12, 56), goldMat);
    topRim.rotation.x = Math.PI / 2;
    topRim.position.y = FUNNEL.rimY + FUNNEL.wallHeight;
    group.add(topRim);

    const midRim = new THREE.Mesh(new THREE.TorusGeometry(FUNNEL.rimRadius, 0.11, 10, 56), goldMat);
    midRim.rotation.x = Math.PI / 2;
    midRim.position.y = FUNNEL.rimY;
    group.add(midRim);

    // Decorative glowing golden chimney collar around the center goal hole!
    const chimneyMat = new THREE.MeshStandardMaterial({
      color: '#b82534',
      roughness: 0.45,
      metalness: 0.15,
    });
    const chimneyBody = new THREE.Mesh(
      new THREE.CylinderGeometry(FUNNEL.holeRadius + 0.15, FUNNEL.holeRadius + 0.45, FUNNEL.holeY + 0.35, 24),
      chimneyMat
    );
    chimneyBody.position.y = (FUNNEL.holeY + 0.35) * 0.5;
    group.add(chimneyBody);

    const chimneyRing = new THREE.Mesh(new THREE.TorusGeometry(FUNNEL.holeRadius + 0.08, 0.14, 12, 32), goldMat);
    chimneyRing.rotation.x = Math.PI / 2;
    chimneyRing.position.y = FUNNEL.holeY + 0.04;
    group.add(chimneyRing);

    // Warm glowing vortex disc inside the Golden Chimney
    const vortexGeo = new THREE.CircleGeometry(FUNNEL.holeRadius + 0.02, 32);
    vortexGeo.rotateX(-Math.PI / 2);
    this.vortexMat = new THREE.MeshBasicMaterial({
      color: '#38281b',
    });
    this.vortexDisc = new THREE.Mesh(vortexGeo, this.vortexMat);
    this.vortexDisc.position.y = FUNNEL.holeY + 0.06;
    group.add(this.vortexDisc);

    // 3 miniature golden bell pegs inside the funnel for thrilling last-second deflections!
    for (const peg of FUNNEL.pegs) {
      const px = Math.cos(peg.angle) * peg.r;
      const pz = Math.sin(peg.angle) * peg.r;
      const py = funnelHeightAtRadius(peg.r);
      const pegGroup = new THREE.Group();
      pegGroup.position.set(px, py, pz);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(peg.radius * 0.85, peg.radius, 0.92, 14), goldMat);
      post.position.y = 0.46;
      const finial = new THREE.Mesh(new THREE.SphereGeometry(peg.radius * 0.95, 12, 12), new THREE.MeshStandardMaterial({
        color: '#b74e36',
        emissive: '#800f2f',
        emissiveIntensity: 0.45,
        metalness: 0.4,
        roughness: 0.2,
      }));
      finial.position.y = 0.96;
      pegGroup.add(post, finial);
      group.add(pegGroup);
      this.bellAnim.set(peg.id, { group: pegGroup, pulse: 0, baseScale: 1 });
    }

    // Victory Golden Spotlight Pillar (soft celestial cone, hidden until victory!)
    const beamGeo = new THREE.CylinderGeometry(3.2, 1.05, 24, 24, 1, true);
    this.victoryBeamMat = new THREE.MeshBasicMaterial({
      color: '#ffe484',
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.victoryBeam = new THREE.Mesh(beamGeo, this.victoryBeamMat);
    this.victoryBeam.position.set(0, 12.6, 0);
    group.add(this.victoryBeam);

    // Support plinth under the snowglobe funnel
    const basePlinth = new THREE.Mesh(
      new THREE.CylinderGeometry(2.34,2.65,.34,48),
      new THREE.MeshStandardMaterial({ color: '#845231', metalness: 0.45, roughness: 0.4 })
    );
    basePlinth.position.y = 0.17;
    group.add(basePlinth);

    this.scene.add(group);
  }

  _buildSnowParticles() {
    this.snowCountMax = 360;
    const pos = new Float32Array(this.snowCountMax * 3);
    this.snowMeta = new Float32Array(this.snowCountMax * 3); // [speed, phase, drift]

    for (let i = 0; i < this.snowCountMax; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 68;
      pos[i * 3 + 1] = Math.random() * 44;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 68 + 6;
      this.snowMeta[i * 3] = 1.6 + Math.random() * 2.2;
      this.snowMeta[i * 3 + 1] = Math.random() * Math.PI * 2;
      this.snowMeta[i * 3 + 2] = 0.4 + Math.random() * 0.8;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.17,
      map: this.glowTex,
      color: '#eef6ff',
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.snowPoints = new THREE.Points(geo, mat);
    this.scene.add(this.snowPoints);
  }

  _buildVictoryEffects() {
    // Shimmering festive confetti shower around the tree & funnel on victory
    const count = 115;
    const geo = new THREE.PlaneGeometry(.17,.09);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    this.confetti = new THREE.InstancedMesh(geo, mat, count);
    this.confetti.visible = false;
    this.confettiData = [];
    const colors = [
      new THREE.Color('#ffd166'),
      new THREE.Color('#b74e36'),
      new THREE.Color('#e2d6b6'),
      new THREE.Color('#bcc797'),
      new THREE.Color('#ffffff'),
    ];
    for (let i = 0; i < count; i++) {
      this.confetti.setColorAt(i, colors[i % colors.length]);
      this.confettiData.push({
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6,
      });
    }
    this.confetti.instanceColor.needsUpdate = true;
    this.scene.add(this.confetti);

    // Floating winner crown mesh (attached above winning ornament during celebration)
    this.winnerCrown = new THREE.Group();
    const crownGold = new THREE.MeshStandardMaterial({
      color: '#ffd966',
      emissive: '#ffaa00',
      emissiveIntensity: 0.75,
      metalness: 0.9,
      roughness: 0.14,
    });
    const crownBase = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.28, 12, 1, true), crownGold);
    this.winnerCrown.add(crownBase);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.28, 6), crownGold);
      spike.position.set(Math.cos(a) * 0.37, 0.24, Math.sin(a) * 0.37);
      this.winnerCrown.add(spike);
    }
    this.winnerCrown.visible = false;
    this.scene.add(this.winnerCrown);
  }

  // ============================================================
  // Participant Marbles & Crisp HTML Name Plates
  // ============================================================

  syncParticipants(marbles) {
    // Dispose previous marble meshes & labels
    const geometries = new Set();
    const materials = new Set();
    for (const entry of this.marbleMeshes.values()) {
      entry.group.traverse(part => {
        if (part.isMesh) geometries.add(part.geometry);
        if (part.material) materials.add(part.material);
      });
      geometries.add(entry.trailLine.geometry);
      materials.add(entry.trailLine.material);
      entry.sphereMat.map.dispose();
      this.scene.remove(entry.group,entry.trailLine);
    }
    for (const geo of geometries) geo.dispose();
    for (const mat of materials) mat.dispose();
    for (const {sprite} of this.sparks) {
      this.scene.remove(sprite);
      sprite.material.dispose();
    }
    for (const {mesh} of this.shockwaves) {
      this.scene.remove(mesh);
      mesh.material.dispose();
      mesh.geometry.dispose();
    }
    this.sparks.length = 0;
    this.shockwaves.length = 0;
    this.marbleMeshes.clear();
    this.labelLayer.innerHTML = '';
    this.labelEls.clear();
    this.winnerId = null;
    this.victoryCelebration = 0;
    this.confetti.visible = false;
    this.winnerCrown.visible = false;
    this.victoryBeamMat.opacity = 0;

    if (!marbles.length) return;
    const sphereGeo = new THREE.SphereGeometry(MARBLE_RADIUS, 24, 18);
    const capGeo = new THREE.CylinderGeometry(0.13, 0.16, 0.14, 10);
    const ringGeo = new THREE.TorusGeometry(0.085, 0.025, 6, 12);
    const capMat = new THREE.MeshStandardMaterial({ color: '#ffd966', metalness: 0.9, roughness: 0.15 });

    for (const m of marbles) {
      const group = new THREE.Group();
      const tex = createOrnamentTexture(m.color, m.accent, m.pattern);
      const sphereMat = new THREE.MeshPhysicalMaterial({
        map: tex,
        roughness: 0.16,
        metalness: 0.28,
        clearcoat: 1.0,
        clearcoatRoughness: 0.08,
        emissive: new THREE.Color(m.color),
        emissiveIntensity: 0.16,
      });

      const ball = new THREE.Mesh(sphereGeo, sphereMat);
      ball.castShadow = true;
      group.add(ball);

      // Miniature ornament crown cap sitting on top of the glass sphere
      const capGroup = new THREE.Group();
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = MARBLE_RADIUS + 0.03;
      const loop = new THREE.Mesh(ringGeo, capMat);
      loop.position.y = MARBLE_RADIUS + 0.14;
      capGroup.add(cap, loop);
      group.add(capGroup);

      // Subtle boost glow halo attached to marble
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.cyanGlowTex,
        color: m.color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      halo.scale.set(2.4, 2.4, 1);
      group.add(halo);

      group.position.set(m.x, m.y, m.z);
      this.scene.add(group);

      // Boost light trail line
      const trailPositions = new Float32Array(18 * 3);
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
      const trailMat = new THREE.LineBasicMaterial({
        color: '#ffe885',
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
      });
      const trailLine = new THREE.Line(trailGeo, trailMat);
      trailLine.frustumCulled = false;
      this.scene.add(trailLine);

      this.marbleMeshes.set(m.id, {
        group,
        ball,
        capGroup,
        halo,
        sphereMat,
        trailLine,
        trailHistory: [],
      });

      // Sharp HTML Name Plate projected cleanly above each marble
      const el = document.createElement('div');
      el.className = 'marble-tag';
      el.innerHTML = `<span class="tag-dot" style="background:${m.color}"></span><span class="tag-name"></span>`;
      el.querySelector('.tag-name').textContent = m.name;
      this.labelLayer.appendChild(el);
      this.labelEls.set(m.id, el);
    }
  }

  // ============================================================
  // Visual Event Triggers (Impacts, Fireworks, Confetti)
  // ============================================================

  handleSimEvent(ev) {
    if (ev.type === 'pin_hit') {
      const anim = this.pinAnim.get(ev.pinId);
      if (anim) anim.shake = 1.0;
      this._spawnSparks(ev.x, ev.y, ev.z, '#ffccd5', 6);
    } else if (ev.type === 'bell_hit') {
      const anim = this.bellAnim.get(ev.bellId);
      if (anim) anim.pulse = 1.0;
      this._spawnShockwave(ev.x, ev.y + 0.15, ev.z, ev.kind === 'gift' ? '#8eae86' : '#ffd966');
      this._spawnSparks(ev.x, ev.y + 0.2, ev.z, '#ffe588', 12);
    } else if (ev.type === 'boost_hit') {
      this._spawnShockwave(ev.x, ev.y + 0.1, ev.z, '#e6bc72');
      this._spawnSparks(ev.x, ev.y + 0.2, ev.z, '#fff0cb', 16);
    } else if (ev.type === 'marble_clink') {
      this._spawnSparks(ev.x, ev.y, ev.z, '#ffffff', 5);
    } else if (ev.type === 'winner') {
      this.winnerId = ev.marbleId;
      this.victoryCelebration = 0.01;
      this._triggerVictoryBurst();
    }
  }

  _spawnShockwave(x, y, z, color) {
    if (this.shockwaves.length > 14) return;
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.25, 0.42, 24),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    mesh.position.set(x, y, z);
    mesh.rotation.x = -Math.PI / 2;
    this.scene.add(mesh);
    this.shockwaves.push({ mesh, age: 0, maxAge: 0.5 });
  }

  _spawnSparks(x, y, z, color, count) {
    const budget = this.lowQuality ? Math.ceil(count * 0.5) : count;
    for (let i = 0; i < budget; i++) {
      if (this.sparks.length >= (this.lowQuality ? 20 : 52)) break;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex,
        color,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      sprite.position.set(x, y, z);
      sprite.scale.setScalar(0.42);
      this.scene.add(sprite);
      const a = Math.random() * Math.PI * 2;
      const spd = 2.2 + Math.random() * 4.5;
      this.sparks.push({
        sprite,
        vx: Math.cos(a) * spd,
        vy: 2.5 + Math.random() * 4.0,
        vz: Math.sin(a) * spd,
        age: 0,
        maxAge: 0.45 + Math.random() * 0.25,
      });
    }
  }

  _triggerVictoryBurst() {
    // Launch festive confetti from above the funnel & tree
    this.confetti.visible = true;
    for (const c of this.confettiData) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 4.2;
      c.x = FUNNEL.cx + Math.cos(a) * r;
      c.z = FUNNEL.cz + Math.sin(a) * r;
      c.y = 3.5 + Math.random() * 8;
      c.vx = Math.cos(a) * (2.5 + Math.random() * 5.5);
      c.vy = 5.5 + Math.random() * 7.5;
      c.vz = Math.sin(a) * (2.5 + Math.random() * 5.5);
    }

    // Spawn 5 radiant 3D firework bursts in the sky behind & around the tree
    const bursts = [
      { x: -10, y: 24, z: -2, color: '#ffd166' },
      { x: 11, y: 26, z: 0, color: '#ff5c8a' },
      { x: 0, y: 31, z: -4, color: '#e6bc72' },
      { x: -7, y: 18, z: 12, color: '#8eae86' },
      { x: 8, y: 19, z: 13, color: '#ffe599' },
    ];
    for (const b of bursts) {
      this._spawnSparks(b.x, b.y, b.z, b.color, 20);
      this._spawnShockwave(b.x, b.y, b.z, b.color);
    }
  }

  // ============================================================
  // Quality, Resize, Camera & Per-Frame Update
  // ============================================================

  setLowQuality(enabled) {
    this.lowQuality = Boolean(enabled);
    this.renderer.shadowMap.enabled = !this.lowQuality;
    this.tree.setLowQuality(this.lowQuality);
    this.snowPoints.geometry.setDrawRange(0, this.lowQuality ? 80 : this.snowCountMax);
    this.resize();
  }

  setCameraMode(mode) {
    this.cameraMode = mode === 'overview' ? 'overview' : 'follow';
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const maxDpr = this.lowQuality ? 1.0 : Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(maxDpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  update(dt, sim) {
    this.clockTime += dt;


    // 1. Animate Top Star, Boost Pads, and Tree Fairy Lights
    this.tree.star.rotation.y = Math.atan2(this.camera.position.x, this.camera.position.z) + .15 * Math.sin(this.clockTime * .5);
    const starPulse = 5.1 + Math.sin(this.clockTime * 2.2) * .3;
    this.tree.halo.scale.set(starPulse, starPulse, 1);

    for (const mat of this.boostMaterials) {
      if (mat.map) mat.map.offset.y = (this.clockTime * 1.65) % 1;
    }

    // Tree fairy-light holiday wave (accelerates into dazzling celebration on victory!)
    if (this.victoryCelebration > 0) {
      this.victoryCelebration = Math.min(1, this.victoryCelebration + dt * 0.9);

      this.victoryBeamMat.opacity = Math.min(.024,this.victoryCelebration*.024) * (0.85 + 0.15 * Math.sin(this.clockTime * 5));
    }

    const tmpCol = new THREE.Color();
    const goldCol = new THREE.Color('#fff1a6');
    const celebration = this.victoryCelebration;
    for (let i = 0; i < this.tree.bulbMeta.length; i++) {
      const meta = this.tree.bulbMeta[i];
      const wave = celebration > 0
        ? 0.55 + 0.45 * Math.sin(this.clockTime * 9.5 - meta.hFrac * 18 + meta.phase)
        : 0.85 + 0.15 * Math.sin(this.clockTime * 1.6 + meta.phase);
      tmpCol.copy(meta.baseCol);
      if (celebration > 0) tmpCol.lerp(goldCol, 0.45 * celebration);
      tmpCol.multiplyScalar(wave * (1 + celebration * 0.5));
      this.tree.bulbs.setColorAt(i, tmpCol);
    }
    this.tree.bulbs.instanceColor.needsUpdate = true;

    // Vortex & hearth glow pulse
    this.vortexDisc.rotation.y = this.clockTime * 1.8;
    this.chimneyLight.intensity = 10 + Math.sin(this.clockTime * 3.2) * 1.5 + celebration * 5;

    // 2. Animate Start Bowl Iris Trapdoor & Wreath Gates
    const gateOpen = sim ? sim.gateOpenProgress : 0;
    this.startTrapdoor.scale.setScalar(Math.max(0.01, 1 - gateOpen));
    this.startTrapdoor.visible = gateOpen < 0.96;

    const simTime = sim ? sim.simTime : this.clockTime * 0.65;
    for (const gm of this.gateMeshes) {
      const u = gateCenterU(gm.gate, simTime);
      const f = gm.frame;
      gm.group.position.set(
        f.pos.x + f.right.x * u,
        f.pos.y + f.right.y * u,
        f.pos.z + f.right.z * u
      );
    }

    // 3. Animate Obstacle Hit Feedback (Pins & Bells)
    for (const a of this.pinAnim.values()) {
      if (a.shake > 0) {
        a.shake = Math.max(0, a.shake - dt * 4.5);
        a.group.rotation.z = Math.sin(a.shake * 28) * 0.24 * a.shake;
      }
    }
    for (const a of this.bellAnim.values()) {
      if (a.pulse > 0) {
        a.pulse = Math.max(0, a.pulse - dt * 3.2);
        const s = 1 + Math.sin(a.pulse * Math.PI) * 0.28;
        a.group.scale.setScalar(s);
        a.group.rotation.z = Math.sin(a.pulse * 22) * 0.22 * a.pulse;
      }
    }

    // 4. Update Marbles & Boost Trails
    if (sim) {
      for (const m of sim.marbles) {
        const entry = this.marbleMeshes.get(m.id);
        if (!entry) continue;

        if (m.id === this.winnerId && sim.phase === 'finished') {
          // Winner rises triumphantly ABOVE the snowglobe rim with golden crown!
          const liftY = FUNNEL.rimY + FUNNEL.wallHeight + 1.45 + Math.sin(this.clockTime * 3.1) * 0.24;
          entry.group.position.set(FUNNEL.cx, liftY, FUNNEL.cz);
          entry.ball.rotation.y += dt * 1.4;
          entry.group.scale.setScalar(1.75);
          entry.halo.material.opacity = 0.85;
          entry.halo.scale.set(4.0, 4.0, 1);

          this.winnerCrown.visible = true;
          this.winnerCrown.position.set(FUNNEL.cx, liftY + MARBLE_RADIUS * 1.75 + 0.34, FUNNEL.cz);
          this.winnerCrown.rotation.y = this.clockTime * 1.8;
        } else {
          entry.group.position.set(m.x, m.y, m.z);
          entry.ball.quaternion.set(m.qx, m.qy, m.qz, m.qw);
          entry.group.scale.setScalar(1.0);

          const wind = m.windRemaining > 0 && sim.phase === 'racing';
          const isBoosted = m.boostTimer > 0 || wind;
          entry.halo.material.opacity = isBoosted ? 0.85 : m.rank === 1 && sim.phase === 'racing' ? 0.42 : 0;

          // Update stardust comet trail when boosting or leading in Zone 3/4
          if (isBoosted) {
            entry.trailLine.material.color.setHex(wind ? 0x98f5ed : 0xffe885);
            entry.trailHistory.unshift(m.x, m.y, m.z);
            if (entry.trailHistory.length > 18 * 3) entry.trailHistory.length = 18 * 3;
            const attr = entry.trailLine.geometry.attributes.position;
            for (let k = 0; k < 18; k++) {
              const srcIdx = Math.min(k * 3, Math.max(0, entry.trailHistory.length - 3));
              attr.array[k * 3] = entry.trailHistory[srcIdx] ?? m.x;
              attr.array[k * 3 + 1] = entry.trailHistory[srcIdx + 1] ?? m.y;
              attr.array[k * 3 + 2] = entry.trailHistory[srcIdx + 2] ?? m.z;
            }
            attr.needsUpdate = true;
            entry.trailLine.material.opacity = wind ? .96 : Math.min(0.85, m.boostTimer * 0.7);
          } else {
            entry.trailLine.material.opacity = Math.max(0, entry.trailLine.material.opacity - dt * 2.5);
            if (entry.trailLine.material.opacity <= 0.01) entry.trailHistory.length = 0;
          }
        }
      }
    }

    // 5. Update Snow, Shockwaves, Sparks, Confetti
    this._updateParticles(dt);

    // 6. Update Cinematic Camera
    this._updateCamera(dt, sim);

    // 7. Render & Project Crisp HTML Name Plates
    this.renderer.render(this.scene, this.camera);
    this._updateNamePlates(sim);
  }

  _updateParticles(dt) {
    // Snowflakes drifting down
    const snowAttr = this.snowPoints.geometry.attributes.position;
    const arr = snowAttr.array;
    const activeSnow = this.lowQuality ? 80 : this.snowCountMax;
    for (let i = 0; i < activeSnow; i++) {
      const spd = this.snowMeta[i * 3];
      const ph = this.snowMeta[i * 3 + 1];
      const dr = this.snowMeta[i * 3 + 2];
      arr[i * 3 + 1] -= spd * dt;
      arr[i * 3] += Math.sin(this.clockTime * 0.8 + ph) * dr * dt;
      if (arr[i * 3 + 1] < 0) {
        arr[i * 3 + 1] = 42 + Math.random() * 4;
      }
    }
    snowAttr.needsUpdate = true;

    // Shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.age += dt;
      if (sw.age >= sw.maxAge) {
        this.scene.remove(sw.mesh);
        sw.mesh.geometry.dispose();
        sw.mesh.material.dispose();
        this.shockwaves.splice(i, 1);
      } else {
        const p = sw.age / sw.maxAge;
        sw.mesh.scale.setScalar(1 + p * 4.6);
        sw.mesh.material.opacity = (1 - p) * 0.85;
      }
    }

    // Sparks
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const sp = this.sparks[i];
      sp.age += dt;
      if (sp.age >= sp.maxAge) {
        this.scene.remove(sp.sprite);
        sp.sprite.material.dispose();
        this.sparks.splice(i, 1);
      } else {
        sp.vy -= 11 * dt;
        sp.sprite.position.x += sp.vx * dt;
        sp.sprite.position.y += sp.vy * dt;
        sp.sprite.position.z += sp.vz * dt;
        const p = sp.age / sp.maxAge;
        sp.sprite.material.opacity = 1 - p;
        sp.sprite.scale.setScalar(0.45 * (1 - p * 0.5));
      }
    }

    // Victory confetti
    if (this.confetti.visible) {
      const dummy = new THREE.Object3D();
      for (let i = 0; i < this.confettiData.length; i++) {
        const c = this.confettiData[i];
        c.vy -= 7.2 * dt;
        c.vx *= 0.992;
        c.vz *= 0.992;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.z += c.vz * dt;
        c.rx += dt * 4.2;
        c.ry += dt * 3.1;
        if (c.y < 0.2) {
          c.y = 14 + Math.random() * 8;
          c.vy = -1.5 - Math.random() * 2;
        }
        dummy.position.set(c.x, c.y, c.z);
        dummy.rotation.set(c.rx, c.ry, c.rz);
        dummy.updateMatrix();
        this.confetti.setMatrixAt(i, dummy.matrix);
      }
      this.confetti.instanceMatrix.needsUpdate = true;
    }
  }

  _updateCamera(dt, sim) {
    const desiredPos = this._v1;
    const desiredTarget = this._v2;
    let lerpRate = 3.2;

    if (!sim) {
      // Majestic idle showcase framing BOTH the glowing Top Star and Snowglobe Funnel cleanly to the right of the setup card!
      const a = Math.sin(this.clockTime * 0.22) * 0.42;
      desiredPos.set(-4.5 + Math.sin(a) * 14, 18.8 + Math.sin(this.clockTime * 0.3) * 1.2, 48.5 + Math.cos(a) * 3.5);
      desiredTarget.set(-3.4, 14.8, 4.5);
      lerpRate = 2.5;
    } else if (sim.phase === 'countdown') {
      // Dramatic close-up on the crystalline Star-Gate & Top Star!
      const a = Math.sin(this.clockTime * 0.65) * 0.32;
      desiredPos.set(Math.sin(a) * 10.5, 31.6, START_BOWL.cz + Math.cos(a) * 10.5);
      desiredTarget.set(START_BOWL.cx, START_BOWL.cy + 0.1, START_BOWL.cz);
      lerpRate = 4.5;
    } else if (sim.phase === 'finished') {
      // Celebratory hero orbit framing the levitating crowned ornament ABOVE the rim + Giant Tree!
      const a = Math.sin(this.clockTime * 0.45) * 0.55;
      desiredPos.set(
        FUNNEL.cx + Math.sin(a) * 10.2,
        FUNNEL.rimY + FUNNEL.wallHeight + 2.6,
        FUNNEL.cz + Math.cos(a) * 10.2
      );
      desiredTarget.set(FUNNEL.cx, FUNNEL.rimY + FUNNEL.wallHeight + 0.9, FUNNEL.cz);
      lerpRate = 3.4;
    } else if (this.cameraMode === 'overview') {
      // Grand wide shot showing the ENTIRE Christmas Tree from Top Star down to Snowglobe Funnel
      desiredPos.set(-19, 21, 55);
      desiredTarget.set(0, 13.9, 3.5);
      lerpRate = 3.2;
    } else {
      // Smart Auto-Follow tracking the leading marble & chasing pack!
      const ranked = sim.getRankedMarbles();
      const leader = ranked[0];
      const runnerUp = ranked[1] || leader;

      if (!leader) return;

      if (leader.stage === 'funnel') {
        // Dramatic overhead-front snowglobe finale camera; zooms tighter on photo-finish slow-mo!
        const zoom = sim.slowMoActive ? 0.68 : 1.0;
        const sway = Math.sin(this.clockTime * 0.5) * 1.4;
        desiredPos.set(
          FUNNEL.cx + sway,
          FUNNEL.rimY + 7.2 * zoom,
          FUNNEL.cz + 11.2 * zoom
        );
        desiredTarget.set(
          FUNNEL.cx * 0.65 + leader.x * 0.35,
          FUNNEL.holeY + 1.4,
          FUNNEL.cz * 0.65 + leader.z * 0.35
        );
        lerpRate = sim.slowMoActive ? 5.0 : 3.6;
      } else {
        // Blend 75% leader + 25% runner-up so close battles stay framed cleanly!
        const focusS = Math.min(TRACK_LENGTH, leader.s * 0.78 + runnerUp.s * 0.22);
        const f = trackFrameAtS(focusS);

        // Position camera smoothly outside the spiral looking inward & slightly ahead along the track
        const camDistOut = 10.5 + f.t * 3.8;
        const camBehind = 5.2;
        const camHeight = 5.4;

        desiredPos.set(
          f.pos.x + f.right.x * camDistOut - f.tangent.x * camBehind,
          f.pos.y + camHeight,
          f.pos.z + f.right.z * camDistOut - f.tangent.z * camBehind
        );
        desiredTarget.set(
          f.pos.x + f.tangent.x * 2.6,
          f.pos.y - 0.35,
          f.pos.z + f.tangent.z * 2.6
        );
        lerpRate = 3.6;
      }
    }

    const alpha = 1 - Math.exp(-lerpRate * dt);
    this.camPos.lerp(desiredPos, alpha);
    this.camTarget.lerp(desiredTarget, alpha);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
  }

  _updateNamePlates(sim) {
    if (!sim || this.labelEls.size === 0) return;

    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const labelLimit = this.cameraMode === 'overview' || w < 480 ? 2 : 4;
    const visible = [];

    for (const m of sim.marbles) {
      const el = this.labelEls.get(m.id);
      if (!el) continue;

      if (sim.phase === 'countdown' || (sim.phase === 'finished' && m.id !== this.winnerId) || m.rank > labelLimit && m.id !== this.winnerId) {
        el.style.opacity = '0';
        continue;
      }

      const entry = this.marbleMeshes.get(m.id);
      const pos = entry ? entry.group.position : m;
      const yOffset = m.id === this.winnerId && sim.phase === 'finished' ? 1.55 : 0.92;

      this._proj.set(pos.x, pos.y + yOffset, pos.z);
      this._proj.project(this.camera);

      const inFront = this._proj.z >= -1 && this._proj.z <= 1;
      const sx = (this._proj.x * 0.5 + 0.5) * w;
      const sy = (-this._proj.y * 0.5 + 0.5) * h;
      const onScreen = inFront && sx > 10 && sx < w - 10 && sy > 23 && sy < h - 4;

      if (!onScreen) {
        el.style.opacity = '0';
        continue;
      }

      const isLeader = m.rank === 1 && sim.phase !== 'countdown';
      const dist = this.camera.position.distanceTo(this._v1.set(pos.x, pos.y, pos.z));
      const scale = Math.max(0.76, Math.min(1.12, 16 / Math.max(10, dist)));
      const farDim = isLeader ? 1 : .9;

      visible.push({ m, el, sx, sy, scale, isLeader, opacity: sim.phase === 'finished' ? 1 : farDim });
    }

    // Light screen-space vertical separation so clustered marbles stay crisp & legible on Google Meet!
    visible.sort((a, b) => a.m.rank - b.m.rank);
    const placed = [];
    for (const item of visible) {
      const half = Math.min(70,item.el.offsetWidth*.5) * item.scale;
      const sx = Math.min(w-half-2,Math.max(half+2,item.sx));
      const py = item.sy;
      if (placed.some(prev => Math.abs(sx-prev.sx) < half+prev.half+4 && Math.abs(py-prev.sy) < 24)) {
        item.el.style.opacity = '0';
        continue;
      }
      placed.push({sx, sy:py, half});
      item.el.classList.toggle('is-leader', item.isLeader);
      item.el.classList.toggle('is-boosted', item.m.boostTimer > 0);
      item.el.style.opacity = String(item.opacity);
      item.el.style.zIndex = String(item.isLeader ? 30 : Math.max(1, 25 - item.m.rank));
      item.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${py.toFixed(1)}px, 0) translate(-50%, -100%) scale(${item.scale.toFixed(2)})`;
    }
  }
}
