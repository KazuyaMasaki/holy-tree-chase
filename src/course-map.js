import { treeLayers } from './christmas-tree.js';
import { FUNNEL, spiralPositionAtT } from './track.js';

// Printed course view for browsers that cannot create a WebGL context.
export class CourseMap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.backdrop = document.createElement('canvas');
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || 600, h = this.canvas.clientHeight || 400;
    this.canvas.width = this.backdrop.width = w;
    this.canvas.height = this.backdrop.height = h;
    this.scale = Math.min(w / 30,h / 39);
    this.cx = w * .5; this.cy = h * .90;
    const ctx = this.backdrop.getContext('2d');
    ctx.fillStyle = '#1b3d32'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = '#cdb079'; ctx.lineWidth = 1; ctx.strokeRect(8,8,w-16,h-16);
    this.drawTree(ctx);
    ctx.lineJoin = 'round'; ctx.beginPath();
    for (let i=0;i<=200;i++) {
      const xy=this.project(spiralPositionAtT(i/200));
      if (!i) ctx.moveTo(...xy); else ctx.lineTo(...xy);
    }
    ctx.lineWidth = this.scale * 1.02; ctx.strokeStyle = '#96683f'; ctx.stroke();
    ctx.lineWidth = this.scale * .74; ctx.strokeStyle = '#d2b481'; ctx.stroke();
    const [x,y] = this.project({x:FUNNEL.cx,y:1,z:FUNNEL.cz});
    ctx.beginPath();ctx.ellipse(x,y,this.scale*4.3,this.scale*1.05,0,0,Math.PI*2);
    ctx.fillStyle='#b5965c'; ctx.fill(); ctx.lineWidth=2;ctx.strokeStyle='#e9ca8f';ctx.stroke();
    ctx.beginPath();ctx.ellipse(x,y,this.scale*1.1,this.scale*.42,0,0,Math.PI*2);ctx.fillStyle='#573d28';ctx.fill();
  }

  drawTree(ctx) {
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.scale(this.scale, -this.scale);
    ctx.fillStyle = '#896340';
    ctx.fillRect(-.5, 0, 1, 30);
    treeLayers.forEach(({y, r, rise}, level) => {
      // The three overlapping lobes read as a woodcut even on a narrow screen.
      const outline = new Path2D();
      outline.moveTo(0, y + rise);
      outline.quadraticCurveTo(-r*.31, y + rise*.48, -r, y + .2);
      outline.quadraticCurveTo(-r*.83, y - .22, -r*.57, y + .42);
      outline.quadraticCurveTo(-r*.34, y + .19, -r*.12, y - .45);
      outline.quadraticCurveTo(r*.16, y - .28, r*.42, y + .48);
      outline.quadraticCurveTo(r*.75, y + .02, r, y + .27);
      outline.quadraticCurveTo(r*.36, y + rise*.45, 0, y + rise);
      ctx.fillStyle = level%2 ? '#4b795f' : '#426c57';
      ctx.fill(outline);
      ctx.lineWidth = .10;
      ctx.strokeStyle = '#8b9c77';
      ctx.stroke(outline);
      ctx.strokeStyle = '#345645';
      for (const direction of [-1,1]) {
        ctx.beginPath();
        ctx.moveTo(0,y + rise*.86);
        ctx.quadraticCurveTo(direction*r*.18,y+rise*.42,direction*r*.73,y+.56);
        ctx.stroke();
      }
    });
    ctx.beginPath();
    for (let i=0; i<16; i++) {
      const angle = Math.PI/2 + i*Math.PI/8;
      const r = i%2 ? .58 : i%4 ? 1.36 : 1.83;
      const x = r * Math.cos(angle), y = 31.55 + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x,y);
      else ctx.lineTo(x,y);
    }
    ctx.closePath();
    ctx.fillStyle = '#e7bd72';
    ctx.fill();
    ctx.restore();
  }

  project(p) { return [this.cx + (p.x + p.z * .19)*this.scale, this.cy - (p.y - p.z * .12)*this.scale]; }

  update(_dt, sim) {
    if (!sim) return;
    const ctx=this.ctx;
    ctx.drawImage(this.backdrop,0,0);
    for (const marble of [...sim.marbles].sort((a,b)=>b.rank-a.rank)) {
      const [x,y] = this.project(marble);
      if (marble.windRemaining > 0 && sim.phase === 'racing') {
        ctx.beginPath();
        ctx.arc(x, y, Math.max(6, this.scale * .82), 0, Math.PI * 2);
        ctx.strokeStyle = '#a8f3df';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(x,y,Math.max(3.7,this.scale*.48),0,Math.PI*2);
      ctx.fillStyle=marble.color; ctx.strokeStyle='#fcf0c9'; ctx.lineWidth=1.4; ctx.fill(); ctx.stroke();
      if(marble.rank!==1) continue;
      ctx.font='bold 14px sans-serif';
      const text=marble.name, tw=Math.min(ctx.measureText(text).width,this.canvas.width*.6);
      const left=Math.max(4,Math.min(this.canvas.width-tw-16,x-tw*.5-6));
      ctx.fillStyle='#f5deb0';ctx.fillRect(left,y-29,tw+12,19);
      ctx.fillStyle='#283e30';ctx.fillText(text,left+6,y-15,tw);
    }
  }
}
