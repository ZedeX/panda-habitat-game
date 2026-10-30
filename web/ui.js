/* 大熊猫国家公园 - 渲染与交互层 */
"use strict";

let cv, ctx;
const CAM = { x: 0, y: 0, zoom: 1 };
let hoverCell = null;      // {x,y} for placement preview
let dragStart = null;
let placingTile = null;    // {tile, rot}
let pendingResolves = [];  // habitat trigger queue
let lastPlaced = { x: 0, y: 0 };
let rotateBtn;

function initRender() {
  cv = document.getElementById("board");
  ctx = cv.getContext("2d");
  cv.addEventListener("pointerdown", onPointerDown);
  cv.addEventListener("pointermove", onPointerMove);
  cv.addEventListener("pointerup", onPointerUp);
  cv.addEventListener("pointercancel", onPointerCancel);
  cv.addEventListener("wheel", onWheel, { passive: false });
  cv.addEventListener("contextmenu", onContextMenu);
  cv.style.touchAction = "none"; // 阻止浏览器默认手势（滚动/缩放），交由画布处理
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", fitCanvas);
  fitCanvas();
  requestAnimationFrame(loop);
}

/* 键盘：R=旋转选中板块（Shift+R 反向），Esc=取消选择 */
function onKeyDown(ev) {
  if (ev.repeat) return;
  // 输入控件聚焦时不拦截
  const tag = (document.activeElement && document.activeElement.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  const k = ev.key.toLowerCase();
  if (k === "r") {
    // Shift+R 反向旋转（-1 → 3 → 2 …）
    ev.preventDefault();
    rotateSel(ev.shiftKey ? 3 : 1);
  } else if (k === "escape") {
    if (placingTile) { placingTile = null; hoverCell = null; G.selected = -1; G.selRot = 0; render(); updateHUD(); }
  }
}

/* 右键（画布上）= 旋转选中板块，并阻止浏览器菜单 */
function onContextMenu(ev) {
  ev.preventDefault();
  rotateSel(1);
}

function fitCanvas() {
  const wrap = document.getElementById("boardwrap");
  cv.width = wrap.clientWidth;
  cv.height = wrap.clientHeight;
}

function loop() {
  render();
  requestAnimationFrame(loop);
}

function w2b(px, py) { // window(px) -> board(cell coords float)
  return [ (px - cv.width/2) / (CELL*CAM.zoom) - CAM.x,
           (py - cv.height/2) / (CELL*CAM.zoom) - CAM.y ];
}
function b2w(bx, by) {
  return [ (bx + CAM.x) * CELL * CAM.zoom + cv.width/2,
           (by + CAM.y) * CELL * CAM.zoom + cv.height/2 ];
}

/* ------------------------------ drawing ------------------------------ */
function render() {
  if (!ctx) return;
  ctx.clearRect(0, 0, cv.width, cv.height);
  // desk background
  ctx.fillStyle = "#2E4636";
  ctx.fillRect(0, 0, cv.width, cv.height);

  if (G.phase === "menu" || !G.players.length) return;

  // board cells
  for (const [key, c] of G.board) {
    const [x, y] = key.split(",").map(Number);
    drawCell(x, y, c);
  }

  // placement preview
  if (placingTile && hoverCell) {
    const [wx, wy] = b2w(hoverCell.x, hoverCell.y);
    const ok = canPlaceAt(hoverCell.x, hoverCell.y);
    ctx.globalAlpha = 0.55;
    drawTileFace(placingTile.tile, placingTile.rot, wx, wy, CELL*CAM.zoom, ok);
    ctx.globalAlpha = 1;
    if (ok) {
      // show same-edge indicator
      const { same } = matchingEdges(placingTile.tile, placingTile.rot, hoverCell.x, hoverCell.y);
      ctx.fillStyle = same > 0 ? "#FFD84D" : "#999";
      ctx.font = `${16*CAM.zoom}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(same > 0 ? `同色边 ×${same} → 摸${Math.min(same, G.players[G.cur].deck.length)}块` : "无异色边，不摸牌", wx, wy - CELL*CAM.zoom*0.62);
    }
  }

  // highlight legal cells when placing
  if (placingTile) {
    for (const [key] of G.board) {
      const [x, y] = key.split(",").map(Number);
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        if (canPlaceAt(nx, ny)) {
          const [wx, wy] = b2w(nx, ny);
          const s = CELL*CAM.zoom;
          ctx.strokeStyle = "rgba(255,255,255,0.25)";
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(wx, wy, s, s);
          ctx.setLineDash([]);
        }
      }
    }
  }

  // habitat candidate highlight: all candidate tiles of the current trigger
  if (G.phase === "habitatResolve" && pendingResolves.length) {
    const trig = pendingResolves[0];
    const s = CELL*CAM.zoom;
    for (const r of trig.candidates) {
      const [wx, wy] = b2w(r.x, r.y);
      ctx.strokeStyle = "#FF5A5A"; ctx.lineWidth = 5;
      ctx.strokeRect(wx + 3, wy + 3, s - 6, s - 6);
    }
    ctx.lineWidth = 1;
  }
}

function drawCell(x, y, c) {
  const [wx, wy] = b2w(x, y);
  const s = CELL * CAM.zoom;
  if (c.start) drawStartTile(wx, wy, s, c);
  else drawTileFace(c.tile, c.rot, wx, wy, s, true, c);
}

/* geometry (real-game structure, user-corrected):
   Terrain tile = square cut along ONE diagonal into 2 large isosceles right triangles.
   rot0: own triangle covers top+right edges  -> vertices (0,0),(s,0),(s,s), diagonal "\"
         other triangle covers bottom+left    -> vertices (0,0),(s,s),(0,s)
   Engine tileEdges base [own,own,other,other] (top,right,bottom,left) matches exactly:
   a diagonal only passes through corners, so each full side belongs to one triangle.
   Start tile = 4 small isosceles right triangles with apexes at the square center. */

function triPath(pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  ctx.lineTo(pts[1][0], pts[1][1]);
  ctx.lineTo(pts[2][0], pts[2][1]);
  ctx.closePath();
}

/* ---------- artwork: pre-rendered tile PNGs (generated from the real photo) ---------- */
const IMGS = {};
function imgOf(name) {
  if (IMGS[name]) return IMGS[name];
  const im = new Image();
  im.onload = () => { try { render(); } catch (e) {} };
  im.src = "assets/" + name;
  IMGS[name] = im;
  return im;
}
function ready(im) { return im && im.complete && im.naturalWidth > 0; }
function tileImg(tile) { return imgOf(`tile_${tile.own}_${tile.other}_${tile.n}.png`); }
function preloadArt() {
  for (const own of TKEYS)
    for (const oth of TKEYS)
      if (own !== oth) for (let n = 1; n <= 5; n++) imgOf(`tile_${own}_${oth}_${n}.png`);
  for (const k of TKEYS) imgOf(`back_${k}.png`);
  imgOf("start.png");
  for (const k of TKEYS) imgOf(`meeple_${ANIMAL_OF[k]}.png`);
}

function drawTileFace(tile, rot, wx, wy, s, ok, cellData) {
  const r = ((rot % 4) + 4) % 4;
  const im = tileImg(tile);
  ctx.save();
  ctx.translate(wx + s/2, wy + s/2);
  ctx.rotate(r * Math.PI/2);
  if (ready(im)) {
    ctx.drawImage(im, -s/2, -s/2, s, s);
  } else {
    ctx.translate(-s/2, -s/2);
    // two large isosceles right triangles cut along the "\" diagonal
    drawTriTerrain([[0, 0], [s, 0], [s, s]], tile.own, s * 0.30);
    drawTriTerrain([[0, 0], [s, s], [0, s]], tile.other, s * 0.30);
    // seam along the diagonal
    ctx.strokeStyle = "rgba(30,26,18,0.22)";
    ctx.lineWidth = Math.max(1, s*0.018);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s, s); ctx.stroke();
    // center number disc (sits on the diagonal, printed at tile center)
    const pr = s * 0.20;
    ctx.beginPath(); ctx.arc(s/2, s/2, pr, 0, Math.PI*2);
    ctx.fillStyle = "#F7F2E6"; ctx.fill();
    ctx.lineWidth = Math.max(2, s*0.035);
    ctx.strokeStyle = TERRAIN_META[tile.own].fill; ctx.stroke();
    ctx.fillStyle = TERRAIN_META[tile.own].num;
    ctx.font = `bold ${s*0.26}px sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(tile.n, s/2, s/2 + s*0.012);
  }
  ctx.restore();
  // companion icon: already printed on the PNG; only needed for the vector fallback
  if (tile.comp && !ready(im)) {
    const ang = r * Math.PI/2;
    const px = s*0.30, py = s*0.74, cx0 = s/2, cy0 = s/2;
    const rx = cx0 + (px-cx0)*Math.cos(ang) - (py-cy0)*Math.sin(ang);
    const ry = cy0 + (px-cx0)*Math.sin(ang) + (py-cy0)*Math.cos(ang);
    ctx.font = `${s*0.17}px sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(compEmoji(tile.comp), wx + rx, wy + ry);
  }
  // border
  ctx.strokeStyle = ok === false ? "#E05555" : "#3E3A32";
  ctx.lineWidth = Math.max(1.5, s*0.03);
  ctx.strokeRect(wx+1, wy+1, s-2, s-2);
  ctx.lineWidth = 1;
  // 米宝：按地形压盖，一块板块最多 2 枚（各自地形一枚），画在对应三角形的重心
  if (cellData && cellData.cover) {
    const pos = [[0.68, 0.32], [0.68, 0.68], [0.32, 0.68], [0.32, 0.32]];
    for (const t of Object.keys(cellData.cover)) {
      const pid = cellData.cover[t];
      const r = (tile.own === t) ? rot : ((rot + 2) % 4);
      const [fx, fy] = pos[r % 4];
      drawMeepleAt(wx + s*fx, wy + s*fy, s*0.34, t);
      void pid;
    }
  }
  // 备选手牌和模式：整块标记
  if (cellData && cellData.markedBy !== undefined) {
    drawMeepleAt(wx + s*0.5, wy + s*0.5, s*0.42, G.players[cellData.markedBy].terrain);
  }
}

function drawTriTerrain(pts, terrain, u) {
  /* fill a triangle (already in local px coords) with terrain base color + motif */
  const t = TERRAIN_META[terrain];
  const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
  const cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
  ctx.save();
  triPath(pts); ctx.clip();
  ctx.fillStyle = t.fill;
  ctx.fillRect(-u*4, -u*4, u*12, u*12);
  if (terrain === "bamboo") {
    ctx.lineCap = "round";
    for (const o of [-0.55, 0, 0.55]) {
      const bx = cx + o*u;
      ctx.strokeStyle = t.dark; ctx.lineWidth = Math.max(2, u*0.16);
      ctx.beginPath(); ctx.moveTo(bx, cy - u*1.05); ctx.lineTo(bx, cy + u*1.05); ctx.stroke();
      ctx.strokeStyle = t.light; ctx.lineWidth = Math.max(1, u*0.07);
      for (const k of [-0.5, 0, 0.5]) {
        ctx.beginPath(); ctx.moveTo(bx - u*0.12, cy + k*u*0.8); ctx.lineTo(bx + u*0.12, cy + k*u*0.8); ctx.stroke();
      }
    }
  } else if (terrain === "forest") {
    for (const [ox, sc] of [[-0.5, 0.9], [0.45, 1.15]]) {
      const bx = cx + ox*u, by = cy + u*0.55, h = u*1.3*sc;
      ctx.fillStyle = t.dark;
      ctx.beginPath();
      ctx.moveTo(bx - u*0.34*sc, by); ctx.lineTo(bx + u*0.34*sc, by); ctx.lineTo(bx, by - h);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#5A4630";
      ctx.fillRect(bx - u*0.07, by - u*0.05, u*0.14, u*0.28);
    }
  } else if (terrain === "alpine") {
    ctx.fillStyle = t.dark;
    ctx.beginPath();
    ctx.moveTo(cx - u*1.15, cy + u*0.75);
    ctx.lineTo(cx, cy - u*0.95);
    ctx.lineTo(cx + u*1.15, cy + u*0.75);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.moveTo(cx, cy - u*0.95);
    ctx.lineTo(cx - u*0.28, cy - u*0.38);
    ctx.lineTo(cx - u*0.10, cy - u*0.52);
    ctx.lineTo(cx + u*0.08, cy - u*0.36);
    ctx.lineTo(cx + u*0.28, cy - u*0.38);
    ctx.closePath(); ctx.fill();
  } else if (terrain === "river") {
    ctx.strokeStyle = t.light; ctx.lineWidth = Math.max(2, u*0.14); ctx.lineCap = "round";
    for (const k of [-0.55, 0, 0.55]) {
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const xx = cx - u*1.1 + (i/24)*u*2.2;
        const yy = cy + k*u*0.75 + Math.sin((i/24)*Math.PI*2)*u*0.12;
        i === 0 ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawStartTile(wx, wy, s, c) {
  const sim = imgOf("start.png");
  if (ready(sim)) {
    ctx.save();
    ctx.translate(wx + s/2, wy + s/2);
    ctx.rotate((c.rot || 0) * Math.PI/2);
    ctx.drawImage(sim, -s/2, -s/2, s, s);
    ctx.restore();
    ctx.strokeStyle = "#3E3A32"; ctx.lineWidth = 2.5;
    ctx.strokeRect(wx, wy, s, s);
    ctx.lineWidth = 1;
    return;
  }
  ctx.save();
  ctx.translate(wx + s/2, wy + s/2);
  const rot = c.rot || 0;
  ctx.rotate(rot * Math.PI/2);
  ctx.translate(-s/2, -s/2);
  const C = s/2;
  /* 4 small isosceles right triangles, apex at center; outer side = START_EDGES terrain */
  const tris = {
    bamboo: [[0, 0], [s, 0], [C, C]],   // top side
    alpine: [[s, 0], [s, s], [C, C]],   // right side
    forest: [[0, s], [s, s], [C, C]],   // bottom side
    river:  [[0, 0], [C, C], [0, s]],   // left side
  };
  for (const t of START_EDGES) drawTriTerrain(tris[t], t, s * 0.17);
  // seams from corners to center
  ctx.strokeStyle = "rgba(30,26,18,0.30)";
  ctx.lineWidth = Math.max(1, s*0.02);
  for (const [px, py] of [[0,0], [s,0], [s,s], [0,s]]) {
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(C, C); ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = "#3E3A32"; ctx.lineWidth = 2.5;
  ctx.strokeRect(wx, wy, s, s);
  ctx.lineWidth = 1;
  // start label disc at center (where the 4 apexes meet)
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath(); ctx.arc(wx + s/2, wy + s/2, Math.max(9, s*0.13), 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#3E3A32";
  ctx.font = `bold ${Math.max(9, s*0.13)}px sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("始", wx + s/2, wy + s/2 + 1);
}

function drawMeepleAt(cx, cy, size, terrainKey) {
  const animal = ANIMAL_OF[terrainKey];
  const mim = imgOf(`meeple_${animal}.png`);
  if (ready(mim)) {
    const w = size * 1.18;   // keep inside the triangle (centroid->diagonal margin)
    ctx.drawImage(mim, cx - w/2, cy - w/2, w, w);
    return;
  }
  const colors = { panda: "#2B2B2B", musk: "#8A6B45", snow: "#B9BFC4", otter: "#7A5230" };
  ctx.fillStyle = colors[animal];
  ctx.beginPath();
  ctx.ellipse(cx, cy - size*0.15, size*0.32, size*0.30, 0, 0, Math.PI*2); // head
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx, cy + size*0.28, size*0.40, size*0.30, 0, 0, Math.PI*2); // body
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = Math.max(1, size*0.06);
  ctx.stroke();
  ctx.lineWidth = 1;
}

function compEmoji(sp) {
  return { panda_cub:"🐼", deer:"🦌", monkey:"🐒", wildcat:"🐱", takin:"🐐", pika:"🐭" }[sp] || "🐾";
}

/* ------------------------------ interaction ------------------------------ */
/* ---------------- 指针/触控交互（鼠标 + 触摸统一） ---------------- */
const _pointers = new Map();
let _pinchDist = 0;
let _tapMoved = false;

function onPointerDown(ev) {
  if (ev.button === 2) return; // 右键专属旋转，不进入平移/点击流程
  cv.setPointerCapture(ev.pointerId);
  _pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (_pointers.size === 1) {
    dragStart = { sx: ev.clientX, sy: ev.clientY };
    _tapMoved = false;
  } else if (_pointers.size === 2) {
    const pts = [..._pointers.values()];
    _pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    dragStart = null; // 双指时进入缩放，暂停平移
  }
}

function onPointerMove(ev) {
  if (_pointers.has(ev.pointerId)) _pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  // 双指缩放
  if (_pointers.size === 2) {
    const pts = [..._pointers.values()];
    const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    if (_pinchDist > 0) CAM.zoom = Math.min(2.2, Math.max(0.4, CAM.zoom * d / _pinchDist));
    _pinchDist = d;
    return;
  }
  const rect = cv.getBoundingClientRect();
  const [bx, by] = w2b(ev.clientX - rect.left, ev.clientY - rect.top);
  if (dragStart) {
    const dx = ev.clientX - dragStart.sx, dy = ev.clientY - dragStart.sy;
    if (Math.abs(dx) + Math.abs(dy) > 6) _tapMoved = true;
    CAM.x += dx / (CELL * CAM.zoom);
    CAM.y += dy / (CELL * CAM.zoom);
    dragStart = { sx: ev.clientX, sy: ev.clientY };
  }
  if (placingTile) hoverCell = { x: Math.floor(bx), y: Math.floor(by) };
}

function onPointerUp(ev) {
  const wasSingle = _pointers.size === 1;
  _pointers.delete(ev.pointerId);
  if (_pointers.size < 2) _pinchDist = 0;
  if (_pointers.size === 0) dragStart = null;
  if (wasSingle && !_tapMoved) handleTap(ev);
}

function onPointerCancel(ev) {
  _pointers.delete(ev.pointerId);
  if (_pointers.size < 2) _pinchDist = 0;
  if (_pointers.size === 0) dragStart = null;
}

/* 轻触（非拖动）处理：落子 / 栖息地压盖 */
function handleTap(ev) {
  const rect = cv.getBoundingClientRect();
  const [bx, by] = w2b(ev.clientX - rect.left, ev.clientY - rect.top);
  const x = Math.floor(bx), y = Math.floor(by);
  if (G.phase === "habitatResolve") { resolveHabitatClick(x, y); return; }
  if (placingTile && G.phase === "play" && G.players[G.cur].type === "human") tryPlace(x, y);
}

function onWheel(ev) {
  ev.preventDefault();
  const factor = ev.deltaY < 0 ? 1.12 : 0.89;
  CAM.zoom = Math.min(2.2, Math.max(0.4, CAM.zoom * factor));
}

function zoomBy(factor) {
  CAM.zoom = Math.min(2.2, Math.max(0.4, CAM.zoom * factor));
  render();
}

function tryPlace(x, y, forceRot, forceIdx) {
  if (!canPlaceAt(x, y)) return;
  const p = G.players[G.cur];
  const idx = (forceIdx !== undefined) ? forceIdx : G.selected;
  const rot = (forceRot !== undefined) ? forceRot : G.selRot;
  if (idx < 0 || !p.hand[idx]) return;
  placeTile(p, idx, x, y, rot);
  placingTile = null; hoverCell = null; G.selected = -1; G.selRot = 0;
  /* 建设阶段：检测栖息地建立触发（专家规则按「栖息地总面积 ≥ 10」） */
  if (RULES.mode === "area") {
    lastPlaced = { x, y };
    pendingResolves = habitatTriggers(x, y);
    if (pendingResolves.length) { G.phase = "habitatResolve"; updateResolveUI(); }
    else finishTurnAfterBuild();
  } else {
    const ts = markerTargets(p);
    if (handSum(p) >= 10 && ts.length && p.meeples > 0) {
      G.phase = "habitatResolve";
      updateResolveUI();
    } else finishTurnAfterBuild();
  }
  render(); updateHUD();
}

/* 栖息地结算面板（面积模型）
   每次处理 1 个触发：玩家 + 地形 + 候选板块；推荐压盖目标由策略给出，
   也可以直接在棋盘上点选候选板块（红框高亮）自行决定。 */
function recommendCover(trig) {
  const cand = trig.candidates.slice();
  const drainable = cand.length <= trig.player.meeples;
  cand.sort((a, b) => drainable ? a.cell.tile.n - b.cell.tile.n : b.cell.tile.n - a.cell.tile.n);
  return cand[0];
}

function updateResolveUI() {
  const box = document.getElementById("resolve");
  if (RULES.mode !== "area") { updateResolveUIHandSum(); return; }
  if (G.phase !== "habitatResolve" || !pendingResolves.length) {
    if (G.phase === "habitatResolve") { G.phase = "play"; box.style.display = "none"; finishTurnAfterBuild(); render(); updateHUD(); }
    return;
  }
  const trig = pendingResolves[0];
  const p = trig.player;
  const pick = recommendCover(trig);
  const drainable = trig.candidates.length <= p.meeples;
  box.style.display = "block";
  document.getElementById("resolveText").innerHTML =
    `<b>${p.name}</b> 的${TERRAIN_META[trig.terrain].name}栖息地总面积 = <b>${trig.area}</b> ≥ 10<br>` +
    `建议压盖 <b>(${cellKey(pick.x, pick.y)})</b> 的数字 <b>${pick.cell.tile.n}</b>（栖息地 +${pick.cell.tile.n}）<br>` +
    `<span style="color:#8a8578;font-size:12px">` +
    (drainable ? "候选板块 ≤ 剩余米宝：从小到大压盖，可把整片区域榨干（总分最大）"
               : "候选板块 > 剩余米宝：从大到小压盖，每枚米宝换最大分值") +
    `　|　也可直接点棋盘上红框板块自选</span>`;
  const btn = document.getElementById("resolveBtn");
  btn.textContent = `压盖米宝（${p.name} 剩 ${p.meeples} 枚）`;
  btn.disabled = false;
  btn.onclick = () => doPlace(pick.x, pick.y, trig.terrain);
}

function doPlace(x, y, terrain) {
  const trig = pendingResolves[0];
  if (!trig) return;
  if (!placeMeeple(trig.player, cellKey(x, y), terrain)) return;
  // 重新检测：压盖后面积仍 ≥10 可连锁继续建立
  pendingResolves = habitatTriggers(lastPlaced.x, lastPlaced.y);
  if (pendingResolves.length) { updateResolveUI(); }
  else { G.phase = "play"; document.getElementById("resolve").style.display = "none"; finishTurnAfterBuild(); }
  render(); updateHUD();
}

/* 备选手牌和模式的原流程（保留可切换） */
function updateResolveUIHandSum() {
  const box = document.getElementById("resolve");
  const p = G.players[G.cur];
  const ts = markerTargets(p);
  if (G.phase !== "habitatResolve" || handSum(p) < 10 || !ts.length || p.meeples <= 0 || !p.hand.length) {
    if (G.phase === "habitatResolve") { G.phase = "play"; box.style.display = "none"; finishTurnAfterBuild(); render(); updateHUD(); }
    return;
  }
  box.style.display = "block";
  const target = ts.map(k => ({ k, n: G.board.get(k).tile.n })).sort((a, b) => b.n - a.n)[0];
  const cnt = {};
  for (const t of p.hand) cnt[t.n] = (cnt[t.n] || 0) + 1;
  const dups = Object.keys(cnt).filter(n => cnt[n] > 1).map(Number);
  const fuelN = dups.length ? Math.max(...dups) : Math.max(...p.hand.map(t => t.n));
  const fuelIdx = p.hand.findIndex(t => t.n === fuelN);
  document.getElementById("resolveText").innerHTML =
    `手牌数字总和 = <b>${handSum(p)}</b> ≥ 10<br>` +
    `放置标记于 <b>(${target.k})</b>，消耗手牌数字 <b>${fuelN}</b>（本局失效）。`;
  const btn = document.getElementById("resolveBtn");
  btn.textContent = `放置标记（剩 ${p.meeples} 枚）`;
  btn.disabled = false;
  btn.onclick = () => {
    if (placeMarker(p, target.k, fuelIdx)) {
      pendingResolves = markerTargets(p);
      if (handSum(p) >= 10 && pendingResolves.length && p.meeples > 0 && p.hand.length) updateResolveUI();
      else { G.phase = "play"; box.style.display = "none"; finishTurnAfterBuild(); }
      render(); updateHUD();
    }
  };
}

function doResolvePlace() {
  const btn = document.getElementById("resolveBtn");
  if (btn && !btn.disabled) btn.click();
  else if (G.phase === "habitatResolve") { G.phase = "play"; finishTurnAfterBuild(); }
  render(); updateHUD();
}

function resolveHabitatClick(x, y) {
  if (!pendingResolves.length) { doResolvePlace(); return; }
  const trig = pendingResolves[0];
  const hit = trig.candidates.find(r => r.x === x && r.y === y);
  if (hit) doPlace(x, y, trig.terrain);   // 点中了候选板块 → 压盖它
  else doResolvePlace();                  // 点空白 → 采用推荐方案
}

function finishTurnAfterBuild() {
  endTurnChecks();
  const p = G.players[G.cur];
  // turn end: per ASR, players may place multiple meeples when sum >=10 repeatedly
  // (expert auto-resolution already handled). Advance:
  updateHUD();
  advanceTurn();
}

/* ------------------------------ HUD ------------------------------ */
function updateHUD() {
  const LEVEL_CN = { hard: "困难", medium: "中等", easy: "简单" };
  const el = document.getElementById("players");
  el.innerHTML = "";
  G.players.forEach((p, i) => {
    const t = TERRAIN_META[p.terrain];
    const active = i === G.cur && G.phase !== "over";
    const sc = G.phase === "over" ? null : scorePlayer(p);
    const div = document.createElement("div");
    div.className = "pcard" + (active ? " active" : "");
    const typeBadge = p.type === "ai"
      ? ` <span class="badge">🤖电脑·${LEVEL_CN[p.ai.level]}</span>`
      : ` <span class="badge human">你</span>`;
    div.innerHTML = `
      <div class="pname" style="color:${t.num}"><span class="dot" style="background:${t.fill}"></span>${p.name}${typeBadge}${active ? " ◀" : ""}</div>
      <div class="pstats">
        牌堆 <b>${p.deck.length}</b> · 手牌 <b>${p.hand.length}</b> · 标记 <b>${p.meeples}</b>
        ${sc ? ` · 预估 <b>${sc.total}</b>` : ""}
      </div>`;
    el.appendChild(div);
  });
  // hand display
  const hand = document.getElementById("hand");
  hand.innerHTML = "";
  const p = G.players[G.cur];
  if (p && G.phase !== "over") {
    if (p.type === "ai") {
      hand.innerHTML = `<div class="aiwait">🤖 ${p.name}（${LEVEL_CN[p.ai.level]}）正在行动…</div>`;
    } else {
      p.hand.forEach((tile, i) => {
        const t = TERRAIN_META[tile.own];
        const to = TERRAIN_META[tile.other];
        const d = document.createElement("div");
        d.className = "tilechip" + (i === G.selected ? " sel" : "");
        d.style.setProperty("--own", t.fill);
        d.style.setProperty("--other", to.fill);
        const face = `assets/tile_${tile.own}_${tile.other}_${tile.n}.png`;
        d.innerHTML = `<img src="${face}" alt="${t.name}·${tile.n}">
                       <div class="tc-own">${t.name}</div>
                       <div class="tc-sub">${to.name}</div>`;
        d.onclick = () => selectTile(i);
        hand.appendChild(d);
      });
    }
  }
  const turnLabel = document.getElementById("turnLabel");
  if (p && G.phase !== "over") {
    const prefix = p.type === "ai" ? "🤖 " : "";
    turnLabel.textContent = `${prefix}轮到 ${p.name} 行动` + (G.lastRoundFlag ? "（最后一轮）" : "");
    turnLabel.style.color = TERRAIN_META[p.terrain].num;
  } else if (G.phase === "over") {
    turnLabel.textContent = "游戏结束";
  }
  // rotate button label
  const rb = document.getElementById("rotBtn");
  if (rb) rb.textContent = `旋转 ${G.selRot * 90}°`;
  // 悬浮旋转按钮：仅人类选中手牌时出现
  const fr = document.getElementById("floatRot");
  if (fr) fr.classList.toggle("show", !!(placingTile && G.phase === "play" && G.players[G.cur].type === "human"));
}

function selectTile(i) {
  if (G.phase !== "play" || G.players[G.cur].type !== "human") return;
  G.selected = i;
  G.selRot = 0;
  const p = G.players[G.cur];
  placingTile = { tile: p.hand[i], rot: 0 };
  render(); updateHUD();
}

function rotateSel(step) {
  if (G.phase !== "play" || !placingTile || G.players[G.cur].type !== "human") return;
  const inc = (step === undefined) ? 1 : step;
  G.selRot = ((G.selRot + inc) % 4 + 4) % 4;
  placingTile.rot = G.selRot;
  render(); updateHUD();
}

function endMyTurn() {
  if (G.phase !== "play" || G.players[G.cur].type !== "human") return;
  finishTurnAfterBuild();
}

/* ------------------------------ results ------------------------------ */
function showResults(results) {
  const ov = document.getElementById("results");
  ov.style.display = "flex";
  let html = `<h2>🏁 游戏结束</h2><table class="rtable"><tr>
    <th>玩家</th><th>栖息地</th><th>生态廊道</th><th>生物多样性</th><th>勘探数据(手牌)</th><th>总分</th></tr>`;
  results.forEach((r, i) => {
    const t = TERRAIN_META[r.player.terrain];
    html += `<tr class="${i === 0 ? "winner" : ""}">
      <td style="color:${t.num}"><span class="dot" style="background:${t.fill}"></span>${r.player.name}</td>
      <td>${r.score.habitat}</td><td>${r.score.corridor}</td><td>${r.score.bio}</td><td>${r.score.hand}</td>
      <td><b>${r.score.total}</b></td></tr>`;
  });
  html += `</table><p class="winmsg">🏆 ${results[0].player.name} 获胜！（${results[0].score.total} 分）</p>
    <button onclick="location.reload()">再来一局</button>`;
  ov.querySelector(".rbox").innerHTML = html;
}
