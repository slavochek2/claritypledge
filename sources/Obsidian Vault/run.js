<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>PTYS Viz</title>
  <style>body{margin:0;overflow:hidden;font-family:sans-serif}</style>
</head>
<body>
<script src="https://cdn.jsdelivr.net/npm/three@0.161/build/three.min.js"></script>
<script>
/* ---------- boilerplate ---------- */
const scene=new THREE.Scene();
const camera=new THREE.OrthographicCamera(
  innerWidth/-2, innerWidth/2,
  innerHeight/2, innerHeight/-2, 0, 10);
camera.position.z=1;
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
window.addEventListener('resize',()=>renderer.setSize(innerWidth,innerHeight));

/* ---------- lane helpers ---------- */
const lanes={A:100,B:-100};                    // y-coords
const colours={A:0x3b82f6,B:0xf97316};         // Tailwind blue-500 / orange-500
let cursorX=-innerWidth/2+20;                  // timeline head

function bar(lane,len){
  const g=new THREE.PlaneGeometry(len,14);
  const m=new THREE.MeshBasicMaterial({color:colours[lane]});
  const mesh=new THREE.Mesh(g,m);
  mesh.position.set(cursorX+len/2,lanes[lane],0);
  scene.add(mesh);
  return mesh;
}

function arrow(lane,len){
  const dash=5; const totalSegs=len/dash|0;
  const g=new THREE.BufferGeometry();
  const verts=[];
  for(let i=0;i<totalSegs;i++){
    if(i%2===0){
      verts.push(cursorX+i*dash,lanes[lane]-20,0);
      verts.push(cursorX+i*dash+dash,lanes[lane]-20,0);
    }
  }
  g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
  const m=new THREE.LineBasicMaterial({color:0x666666});
  const line=new THREE.LineSegments(g,m);
  scene.add(line);
  return line;
}

function dot(x,y,filled){
  const g=new THREE.CircleGeometry(5,16);
  const m=new THREE.MeshBasicMaterial({
      color:filled?0x10b981:0x666666,
      transparent:true,
      opacity:filled?1:0});
  const mesh=new THREE.Mesh(g,m);
  mesh.position.set(x,y,0);
  scene.add(mesh);
  return mesh;
}

/* ---------- keyboard control ---------- */
/*
 S = start bar (A)
 D = end bar & spawn arrow (to B)
 F = close loop (dot filled)
 J,K,L same but roles reversed
*/
let active={lane:null,mesh:null,len:0,arrow:null};
document.addEventListener('keydown',e=>{
 switch(e.key){
  case 's': active={lane:'A',mesh:bar('A',0),len:0}; break;
  case 'd':
    if(active.mesh){arrow('B',60); active=null;cursorX+=80;}
    break;
  case 'f': dot(cursorX+60,lanes['A']-20,true); break;

  case 'j': active={lane:'B',mesh:bar('B',0),len:0}; break;
  case 'k':
    if(active.mesh){arrow('A',60); active=null;cursorX+=80;}
    break;
  case 'l': dot(cursorX+60,lanes['B']-20,true); break;
 }
});

function animate(){
  requestAnimationFrame(animate);
  if(active.mesh){active.len+=2;active.mesh.scale.x=active.len/100;}
  renderer.render(scene,camera);
}
animate();
</script>
</body>
</html>