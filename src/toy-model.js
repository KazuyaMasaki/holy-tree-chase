import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import alpineNight from './art/alpine-night.webp';
import * as THREE from 'three';

export function woodLaneTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const ctx = c.getContext('2d');
  const stain = ctx.createLinearGradient(0,0,256,0);
  for (const [p,tone] of [[0,'#a57847'],[.08,'#d2ab70'],[.38,'#e9ca92'],[.7,'#dabc86'],[1,'#aa7b46']]) stain.addColorStop(p,tone);
  ctx.fillStyle = stain;
  ctx.fillRect(0,0,256,512);
  for (let i = 0; i < 132; i++) {
    ctx.strokeStyle = i % 4 ? '#67452324' : '#fff1bb55';
    ctx.lineWidth = (i%3 + 1) * .39; ctx.beginPath();
    for (let y = 0; y <= 512; y += 4) {
      const x = (i * 79) % 256 + Math.sin(y * Math.PI / 256 + i * .3) * (1.2 + i%4);
      if (y === 0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
  }
  ctx.fillStyle='#936739'; ctx.fillRect(9,0,2,512); ctx.fillRect(245,0,2,512);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

export function toyLandscape(scene) {
  const plinth = new THREE.Group();
  plinth.position.z = 4;
  for (const [top,bottom,height,y,color] of [
    [22.9,22.3,.55,-1.35,'#74452b'], [22.3,22.55,.57,-.85,'#945837'],
    [22.65,22.55,.11,-.55,'#c09751'], [22.85,22.65,.45,-.30,'#71442c'],
    [22.75,22.85,.12,-.035,'#e3dcc0'],
  ]) {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(top,bottom,height,88),new THREE.MeshStandardMaterial({color,roughness:.62}));
    disc.position.y = y; disc.receiveShadow = true; plinth.add(disc);
  }
  scene.add(plinth);
  const backdrop = new THREE.TextureLoader().load(alpineNight);
  backdrop.colorSpace = THREE.SRGBColorSpace;
  backdrop.wrapS = THREE.MirroredRepeatWrapping;
  const cyclorama = new THREE.CylinderGeometry(95,95,330,96,1,true);
  const uv = cyclorama.attributes.uv;
  for (let i=0; i<uv.count; i++) uv.setY(i, .5 + (uv.getY(i)-.5)*330/92);
  const alpineRing = new THREE.Mesh(
    cyclorama,
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        panorama: {value:backdrop},
        sky: {value:new THREE.Color('#103533')},
        floor: {value:new THREE.Color('#33443b')},
      },
      vertexShader: `varying vec2 vUv; void main() {
        vUv = uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }`,
      fragmentShader: `uniform sampler2D panorama; uniform vec3 sky,floor; varying vec2 vUv;
        void main() {
          vec3 ink = texture2D(panorama,vec2(vUv.x*2.,clamp(vUv.y,0.,1.))).rgb;
          ink=mix(floor,ink,smoothstep(0.,.15,vUv.y));
          ink=mix(ink,sky,smoothstep(.89,1.,vUv.y));
          gl_FragColor=vec4(ink,1.);
          #include <colorspace_fragment>
        }`,
    })
  );
  alpineRing.position.y = 8;
  scene.add(alpineRing);

  // Soft contact shadows tie the miniatures to the tabletop even in lightweight mode.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const ctx = shadowCanvas.getContext('2d');
  const shade = ctx.createRadialGradient(64,64,0,64,64,63);
  shade.addColorStop(0,'rgba(34,30,17,.59)');
  shade.addColorStop(.45,'rgba(40,33,24,.32)');
  shade.addColorStop(1,'rgba(45,40,30,0)');
  ctx.fillStyle=shade; ctx.fillRect(0,0,128,128);
  const shadowMat = new THREE.MeshBasicMaterial({
    map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false,
  });
  for (const [x,z,width,depth] of [[0,0,27,24],[0,16,15,13],[-17,6,9,8],[17,7,9,8],[-16,-14,9,8],[17,-13,9,8]]) {
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(width,depth),shadowMat);
    patch.rotation.x = -Math.PI/2;
    patch.position.set(x,.044,z);
    scene.add(patch);
  }
}

// A gabled chalet made from stained timber, a snow-covered pitched roof, and inset lit panes.
export function alpineChalets(scene, locations) {
  const group = new THREE.Group();
  const mat = color => new THREE.MeshStandardMaterial({color,roughness:.79});
  const plaster=mat('#cba371'), oak=mat('#654327'), tile=mat('#a6472d'), snow=mat('#dfd6b9');
  const gold = new THREE.MeshBasicMaterial({color:'#f8b858'});
  function box(w,h,d,x,y,z,material,tilt=0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
    mesh.position.set(x,y,z); mesh.rotation.z=tilt; group.add(mesh);
    return mesh;
  }
  box(3.55,2.65,3.05,0,1.34,0,plaster);
  const face = new THREE.Shape();
  face.moveTo(-1.77,0);face.lineTo(1.77,0);face.lineTo(0,1.32);face.closePath();
  const gable = new THREE.Mesh(new THREE.ExtrudeGeometry(face,{depth:3.05,bevelEnabled:false}),oak);
  gable.position.set(0,2.65,-1.53);group.add(gable);
  for(const side of [-1,1]) {
    box(2.62,.25,3.65,side,3.25,0,tile,-side*.63);
    box(2.62,.11,3.65,side,3.42,0,snow,-side*.63);
    box(.13,2.65,.12,side*1.64,1.34,1.54,oak);
    const x=side*1.08;
    box(.73,.89,.09,x,1.64,1.56,oak);
    box(.57,.72,.06,x,1.65,1.64,gold);
    box(.055,.75,.07,x,1.65,1.69,oak);
    box(.62,.055,.07,x,1.65,1.69,oak);
  }
  box(.78,1.78,.11,0,.9,1.57,oak);
  box(3.66,.12,.16,0,2.62,1.52,oak);
  box(.48,1.16,.54,.88,3.98,-.62,tile);
  box(.58,.15,.64,.88,4.55,-.62,snow);
  group.updateMatrixWorld(true);
  // Bake the fixed timbers into a single draw per finish for the whole village.
  for (const finish of [plaster, oak, tile, snow, gold]) {
    const parts = group.children.filter(part => part.material === finish);
    const transformed = parts.map(part => {
      const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
      return geometry.applyMatrix4(part.matrixWorld);
    });
    const joined = mergeGeometries(transformed);
    const cottages = new THREE.InstancedMesh(joined, finish, locations.length);
    const pose = new THREE.Object3D();
    locations.forEach((loc,i) => {
      pose.position.set(loc.x,0,loc.z);
      pose.rotation.y = loc.ry;
      pose.scale.setScalar(loc.s);
      pose.updateMatrix();
      cottages.setMatrixAt(i,pose.matrix);
    });
    cottages.castShadow = true;
    cottages.receiveShadow = true;
    scene.add(cottages);
    transformed.forEach(geometry => geometry.dispose());
  }
  group.children.forEach(part => part.geometry.dispose());
}

export function miniaturePines(scene) {
  const layout = [
    [-17,11,1.04],[-19,3,.76],[-16,-4,1.26],[-13,-9,.78],[-7,-14,1.10],
    [4,-16,1.17],[10,-13,.79],[17,-4,.96],[20,2,1.05],[17,12,.68],[-12,16,.64],
  ];
  const profile = [[.17,0],[.22,.68],[1.27,.73],[1.39,1.05],[.63,1.7],[1.23,1.50],
    [1.26,1.76],[.53,2.4],[.99,2.22],[.99,2.43],[.37,3.09],[.71,2.96],[.68,3.19],[.025,4.35]];
  const geometry = new THREE.LatheGeometry(profile.map(([r,y]) => new THREE.Vector2(r,y)),32);
  const pos = geometry.attributes.position;
  const colors = [];
  const pine = new THREE.Color('#355342'), snow = new THREE.Color('#c9ceb9'), bark = new THREE.Color('#74563c');
  for (let i=0; i<pos.count; i++) {
    const row=i%profile.length;
    const angle=Math.atan2(pos.getZ(i),pos.getX(i));
    const cut = (1+Math.cos(8*angle+row*.23))*.5;
    const radius = profile[row][0];
    pos.setXYZ(i,pos.getX(i)*(1-cut*.045),pos.getY(i)-cut*radius*.19,pos.getZ(i)*(1-cut*.045));
    const frost=[3,6,9,12,13].includes(row) ? .45+.38*cut : .025+.09*cut;
    const color = row<2 ? bark : pine.clone().lerp(snow,frost);
    colors.push(color.r,color.g,color.b);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals();
  const pines = new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.82}),layout.length);
  const pose = new THREE.Object3D();
  layout.forEach(([x,z,size],i) => {
    pose.position.set(x,0,z);
    pose.scale.setScalar(size*1.25);
    pose.rotation.y=i*.66;
    pose.updateMatrix();
    pines.setMatrixAt(i,pose.matrix);
  });
  pines.castShadow = true;
  pines.receiveShadow = true;
  scene.add(pines);
}
