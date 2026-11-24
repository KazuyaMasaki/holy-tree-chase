import { parseRoster, SAMPLE_ROSTER } from './roster.js';
import { getZoneInfo } from './track.js';
import { MarbleSimulation } from './simulation.js';
import { ChristmasStage } from './stage.js';
import { CourseMap } from './course-map.js';
import { SoundEngine, BgmManager } from './audio.js';

const STORAGE_KEY = 'holy-marble-tree:roster:v1';
const QUALITY_KEY = 'holy-marble-tree:low-quality:v1';
const BGM_MUTED_KEY = 'holy-marble-tree:bgm-muted:v1';

const $ = (id) => document.getElementById(id);

const els = {
  app: $('app'),
  canvas: $('stage-canvas'),
  labelLayer: $('label-layer'),
  zonePill: $('zone-pill'),
  zoneCode: $('zone-code'),
  zoneTitle: $('zone-title'),

  btnCamera: $('btn-camera'),
  cameraLabel: $('camera-label'),
  btnQuality: $('btn-quality'),
  qualityLabel: $('quality-label'),
  btnSe: $('btn-se'),
  seLabel: $('se-label'),
  bgmSelect: $('bgm-select'),
  btnBgm: $('btn-bgm'),
  btnBgmPlay: $('btn-bgm-play'),
  bgmLabel: $('bgm-label'),
  stageStatus: $('stage-status'),
  stageInfo: $('stage-info'),
  btnPause: $('btn-pause'),
  pauseLabel: $('pause-label'),
  btnFullscreen: $('btn-fullscreen'),

  setupPanel: $('setup-panel'),
  rosterInput: $('roster-input'),
  rosterCount: $('roster-count'),
  rosterError: $('roster-error'),
  btnSample: $('btn-sample'),
  btnLoadSaved: $('btn-load-saved'),
  btnClear: $('btn-clear'),
  btnStart: $('btn-start'),

  rankingPanel: $('ranking-panel'),
  raceTimer: $('race-timer'),
  leaderProgress: $('leader-progress'),
  rankingList: $('ranking-list'),

  centerBanner: $('center-banner'),
  countdownNum: $('countdown-num'),
  countdownSub: $('countdown-sub'),
  slowmoBanner: $('slowmo-banner'),
  commentaryBar: $('commentary-bar'),
  commentaryText: $('commentary-text'),

  pauseOverlay: $('pause-overlay'),
  btnResume: $('btn-resume'),
  btnAbort: $('btn-abort'),

  winnerPanel: $('winner-panel'),
  winnerOrb: $('winner-orb'),
  winnerName: $('winner-name'),
  winnerStats: $('winner-stats'),
  btnRetry: $('btn-retry'),
  btnEditRoster: $('btn-edit-roster'),
};

const sound = new SoundEngine();
const bgm = new BgmManager();
const bgmAutoplayAt = performance.now() + 1500;
let stage;
let spatialView = false;
let simAccumulator = 0;
const rankRows = new Map();

let appState = 'setup'; // 'setup' | 'running' | 'paused' | 'finished'
let sim = null;
let currentNames = [];
let lowQuality = localStorage.getItem(QUALITY_KEY) === '1';
let cameraMode = 'follow';
let commentaryTimer = 0;
let lastCommentaryAt = -10;
let commentaryHoldUntil = 0;
let rankUiTimer = 0;
let lastFrameTime = performance.now();
let lastDrawTime = 0;

// ============================================================
// Initialization & Persistence
// ============================================================

function applyQuality(low) {
  lowQuality = Boolean(low);
  localStorage.setItem(QUALITY_KEY, lowQuality ? '1' : '0');
  stage?.setLowQuality?.(lowQuality);
  els.qualityLabel.textContent = lowQuality ? '画質 軽量' : '画質 標準';
}

function updateSavedButtonVisibility() {
  const saved = localStorage.getItem(STORAGE_KEY);
  els.btnLoadSaved.classList.toggle('hidden', !saved || !saved.trim());
}

function validateRosterUI() {
  const parsed = parseRoster(els.rosterInput.value);
  els.rosterCount.textContent = `${parsed.names.length} / 20 人`;
  els.rosterCount.classList.toggle('is-invalid', !parsed.valid && parsed.names.length > 0);
  if (!parsed.valid && els.rosterInput.value.trim().length > 0) {
    els.rosterError.textContent = parsed.errors[0];
    els.rosterError.classList.remove('hidden');
  } else {
    els.rosterError.classList.add('hidden');
  }
  els.btnStart.disabled = !parsed.valid;
  return parsed;
}

function updateBgmControls() {
  els.btnBgm.setAttribute('aria-pressed', String(!bgm.muted));
  els.bgmLabel.textContent = bgm.muted ? 'BGM OFF' : 'BGM ON';
  els.btnBgm.classList.toggle('is-off', bgm.muted);
  els.btnBgmPlay.classList.toggle('hidden', !bgm.playbackIssue);
  els.btnBgmPlay.querySelector('span').textContent = bgm.playbackIssue === 'error' ? 'BGMを再試行' : 'BGMを再生';
}

async function playBgm() {
  if (appState === 'paused' || document.hidden) return;
  await bgm.start();
  updateBgmControls();
}

async function initBgm() {
  bgm.setMuted(localStorage.getItem(BGM_MUTED_KEY) === '1');
  const tracks = await bgm.loadManifest();
  if (!tracks.length) return;
  for (const track of tracks) {
    els.bgmSelect.add(new Option(track.label, track.id));
  }
  els.bgmSelect.value = bgm.selectedId;
  els.bgmSelect.classList.toggle('hidden', tracks.length < 2);
  els.btnBgm.classList.remove('hidden');
  updateBgmControls();
  setTimeout(playBgm, Math.max(0, bgmAutoplayAt - performance.now()));
}

// ============================================================
// Commentary & HUD Updates
// ============================================================

function showCommentary(text, force = false, holdSeconds = 0) {
  const now = sim ? sim.realElapsed : 0;
  if (now < commentaryHoldUntil || (!force && now - lastCommentaryAt < 1.35)) return;
  commentaryHoldUntil = now + holdSeconds;
  lastCommentaryAt = now;
  els.commentaryText.textContent = text;
  els.commentaryBar.classList.remove('hidden');
  commentaryTimer = 2.6;
}

function showCountdownBanner(label, sub) {
  els.countdownNum.textContent = label;
  els.countdownSub.textContent = sub;
  // Re-trigger crisp pop animation
  els.countdownNum.style.animation = 'none';
  void els.countdownNum.offsetWidth;
  els.countdownNum.style.animation = '';
  els.centerBanner.classList.remove('hidden');
}

function renderRankingList() {
  if (!sim) return;
  const ranked = sim.getRankedMarbles();
  els.stageStatus.textContent = ranked.some(m => m.windRemaining > 0) ? '星の追い風' : 'レース中';
  els.rankingList.classList.toggle('is-compact', ranked.length > 10);
  els.raceTimer.textContent = `${sim.realElapsed.toFixed(1)}s`;

  const leader = ranked[0];
  if (leader) {
    const pct = Math.min(100, Math.max(0, (leader.progress / 1.25) * 100));
    els.leaderProgress.style.width = `${pct.toFixed(1)}%`;

    const zone = getZoneInfo(leader.progress);
    els.zoneCode.textContent = zone.short;
    els.zoneTitle.textContent = zone.title;
  }

  for (const m of ranked) {
    let row = rankRows.get(m.id);
    if (!row) {
      row = document.createElement('li');
      row.className = 'rank-item';
      row.innerHTML = '<span class="rank-num"></span><i class="rank-dot"></i><span class="rank-name"></span><span class="rank-boost">加速</span>';
      row.children[1].style.background = m.color;
      row.children[2].textContent = m.name;
      rankRows.set(m.id,row);
    }
    row.classList.toggle('rank-1', m.rank === 1);
    row.children[0].textContent = String(m.rank).padStart(2,'0');
    const wind = m.windRemaining > 0;
    const badge = row.children[3];
    const gained = m.windStartRank - m.rank;
    badge.textContent = wind ? (gained > 0 ? `追い風 ↑${gained}` : '追い風') : '加速';
    badge.classList.toggle('wind-badge', wind);
    badge.classList.toggle('hidden', !wind && m.boostTimer <= 0);
    const index = m.rank - 1;
    if (els.rankingList.children[index] !== row) els.rankingList.insertBefore(row,els.rankingList.children[index] || null);
  }
}

// ============================================================
// State Transitions
// ============================================================

function prepareStage() {
  if (stage) return;
  try {
    stage = new ChristmasStage(els.canvas, els.labelLayer);
    spatialView = true;
    stage.setLowQuality(lowQuality);
  } catch (error) {
    console.warn('3D表示を開始できないため、コース図でレースを表示します。',error);
    const replacement = els.canvas.cloneNode(false);
    els.canvas.replaceWith(replacement);
    els.canvas = replacement;
    stage = new CourseMap(replacement);
  }
  new ResizeObserver(() => stage.resize()).observe(els.canvas.parentElement);
}

function startRace(names) {
  sound.unlock();
  prepareStage();
  simAccumulator = 0;
  rankRows.clear();
  els.rankingList.replaceChildren();
  commentaryTimer = 0;
  lastCommentaryAt = -10;
  commentaryHoldUntil = 0;
  rankUiTimer = 0;
  els.stageStatus.textContent = 'レース中';
  els.stageInfo.classList.add('hidden');
  els.pauseLabel.textContent = '一時停止';
  currentNames = [...names];
  localStorage.setItem(STORAGE_KEY, currentNames.join('\n'));
  updateSavedButtonVisibility();

  sim = new MarbleSimulation(currentNames, { countdownSeconds: 2.7 });
  stage?.syncParticipants?.(sim.marbles);
  stage?.setCameraMode?.(cameraMode);

  appState = 'running';
  els.app.className = 'app state-running';
  els.setupPanel.classList.add('hidden');
  els.winnerPanel.classList.add('hidden');
  els.pauseOverlay.classList.add('hidden');
  els.slowmoBanner.classList.add('hidden');
  els.commentaryBar.classList.add('hidden');

  els.zonePill.classList.remove('hidden');
  els.rankingPanel.classList.remove('hidden');
  els.btnCamera.classList.toggle('hidden', !spatialView);
  els.btnPause.classList.remove('hidden');

  stage.resize();
  if (matchMedia('(max-width: 760px)').matches) window.scrollTo(0,0);
  lastFrameTime = performance.now();
  showCountdownBanner('3', '星のゲートが開きます');
  sound.playCountdown(3);
  renderRankingList();
  bgm.restoreVolume();
  playBgm();
}

function pauseRace() {
  if (appState !== 'running') return;
  appState = 'paused';
  els.pauseOverlay.classList.remove('hidden');
  els.btnResume.focus({preventScroll:true});
  els.pauseLabel.textContent = '再開';
  bgm.stop();
  updateBgmControls();
}

function resumeRace() {
  if (appState !== 'paused') return;
  appState = 'running';
  els.pauseOverlay.classList.add('hidden');
  els.pauseLabel.textContent = '一時停止';
  lastFrameTime = performance.now();
  playBgm();
}

function returnToSetup() {
  appState = 'setup';
  els.stageStatus.textContent = '開演前';
  els.stageInfo.classList.remove('hidden');
  sim = null;
  stage?.syncParticipants?.([]);
  bgm.restoreVolume();
  playBgm();

  els.app.className = 'app state-setup';
  els.setupPanel.classList.remove('hidden');
  els.rankingPanel.classList.add('hidden');
  els.zonePill.classList.add('hidden');
  els.btnCamera.classList.add('hidden');
  els.btnPause.classList.add('hidden');
  els.pauseOverlay.classList.add('hidden');
  els.winnerPanel.classList.add('hidden');
  els.centerBanner.classList.add('hidden');
  els.slowmoBanner.classList.add('hidden');
  els.commentaryBar.classList.add('hidden');
  validateRosterUI();
}

function showWinnerScreen(ev) {
  appState = 'finished';
  els.app.className = 'app state-finished';
  els.rankingPanel.classList.add('hidden');
  els.btnCamera.classList.add('hidden');
  els.zonePill.classList.add('hidden');
  els.centerBanner.classList.add('hidden');
  els.stageStatus.textContent = 'ゴール';
  els.stageInfo.classList.add('hidden');

  els.slowmoBanner.classList.add('hidden');
  els.btnPause.classList.add('hidden');
  els.commentaryBar.classList.add('hidden');

  els.winnerOrb.style.setProperty('--orb', ev.color);
  els.winnerName.textContent = ev.marbleName;
  els.winnerStats.textContent = `所要時間 ${ev.elapsed.toFixed(1)}秒  ／  首位入れ替わり ${sim.leadChanges}回`;
  els.winnerPanel.classList.remove('hidden');

  bgm.duck(0.35);
  sound.playFanfare();
}

function processSimEvents() {
  if (!sim) return;
  const events = sim.drainEvents();
  for (const ev of events) {
    stage.handleSimEvent?.(ev);

    if (ev.type === 'countdown') {
      showCountdownBanner(String(ev.count), '星のゲートが開きます');
      sound.playCountdown(ev.count);
    } else if (ev.type === 'gate_open') {
      showCountdownBanner('Start!', 'オーナメント、一斉スタート');
      sound.playGateOpen();
      showCommentary('トップスター・ゲート開放！全員一斉にスタート！', true);
    } else if (ev.type === 'pin_hit') {
      sound.playPinHit();
    } else if (ev.type === 'bell_hit') {
      sound.playBellHit(ev.note ?? 0);
      if (ev.kind === 'gift') {
        showCommentary(`${ev.marbleName}さんがプレゼント箱にバウンド！`);
      } else if (ev.kind === 'funnel_peg') {
        showCommentary(`${ev.marbleName}さんがゴール直前のベルで弾かれた！`, true);
      } else {
        showCommentary(`${ev.marbleName}さんがジングルベルで大きくバウンド！`);
      }
    } else if (ev.type === 'tailwind') {
      sound.playBoost();
      const targets = ev.riders.length === 1 ? sim.marbles[ev.riders[0]].name + 'さん' : `後方の${ev.riders.length}人`;
      showCommentary(`${targets}に星の追い風！`, true, 1.9);
    } else if (ev.type === 'boost_hit') {
      sound.playBoost();
      showCommentary(`${ev.marbleName}さんが「${ev.label}」で急加速！`, true);
    } else if (ev.type === 'marble_clink') {
      sound.playMarbleClink(ev.intensity ?? 0.5);
    } else if (ev.type === 'lead_change') {
      showCommentary(`${ev.marbleName}さんがトップ浮上！`, true);
    } else if (ev.type === 'funnel_enter') {
      if (sim.marbles.filter((m) => m.stage === 'funnel').length === 1) {
        showCommentary(`${ev.marbleName}さんが最終スノードームへ一番乗り！`, true);
      }
    } else if (ev.type === 'slowmo_start') {
      els.slowmoBanner.classList.remove('hidden');
      sound.playSlowMo();
      showCommentary('決着目前！黄金の煙突へ吸い込まれるのは誰だ！？', true);
    } else if (ev.type === 'winner') {
      showWinnerScreen(ev);
    }
  }
}

// ============================================================
// Event Listeners
// ============================================================

els.rosterInput.addEventListener('input', validateRosterUI);

els.btnSample.addEventListener('click', () => {
  els.rosterInput.value = SAMPLE_ROSTER.join('\n');
  validateRosterUI();
});

els.btnLoadSaved.addEventListener('click', () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    els.rosterInput.value = saved;
    validateRosterUI();
  }
});

els.btnClear.addEventListener('click', () => {
  els.rosterInput.value = '';
  validateRosterUI();
  els.rosterInput.focus();
});

els.btnStart.addEventListener('click', () => {
  const parsed = validateRosterUI();
  if (!parsed.valid) return;
  startRace(parsed.names);
});

els.btnRetry.addEventListener('click', () => {
  if (currentNames.length >= 2) startRace(currentNames);
});

els.btnEditRoster.addEventListener('click', returnToSetup);

els.btnPause.addEventListener('click', () => {
  if (appState === 'running') pauseRace();
  else if (appState === 'paused') resumeRace();
});
els.btnResume.addEventListener('click', resumeRace);
els.btnAbort.addEventListener('click', returnToSetup);

els.btnCamera.addEventListener('click', () => {
  cameraMode = cameraMode === 'follow' ? 'overview' : 'follow';
  stage?.setCameraMode?.(cameraMode);
  els.cameraLabel.textContent = cameraMode === 'follow' ? '自動追尾' : '全体俯瞰';
});

els.btnQuality.addEventListener('click', () => {
  applyQuality(!lowQuality);
});

els.btnSe.addEventListener('click', () => {
  const nextMuted = !sound.seMuted;
  sound.setMuted(nextMuted);
  if (!nextMuted) sound.unlock();
  els.seLabel.textContent = nextMuted ? '効果音 OFF' : '効果音 ON';
  els.btnSe.setAttribute('aria-pressed', String(!nextMuted));
  els.btnSe.classList.toggle('is-off', nextMuted);
});

els.btnBgm.addEventListener('click', () => {
  bgm.setMuted(!bgm.muted);
  localStorage.setItem(BGM_MUTED_KEY, bgm.muted ? '1' : '0');
  updateBgmControls();
  if (!bgm.muted) playBgm();
});

els.btnBgmPlay.addEventListener('click', playBgm);
els.bgmSelect.addEventListener('change', () => {
  bgm.selectTrack(els.bgmSelect.value);
  playBgm();
});

function retryBlockedBgm(event) {
  if (bgm.playbackIssue === 'blocked' && !event.target.closest?.('#btn-bgm, #btn-bgm-play')) playBgm();
}
document.addEventListener('click', retryBlockedBgm);
document.addEventListener('keydown', retryBlockedBgm);

els.btnFullscreen.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
});



document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (appState === 'running') pauseRace();
    else bgm.stop();
  } else if (performance.now() >= bgmAutoplayAt) {
    playBgm();
  }
});

// ============================================================
// Main Render Loop (with 30fps cap in Lightweight Mode)
// ============================================================

function loop(now) {
  requestAnimationFrame(loop);

  if (lowQuality && now - lastDrawTime < 31) {
    return;
  }
  const dt = Math.min(0.25, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;
  lastDrawTime = now;

  if (appState === 'running' && sim) {
    simAccumulator += dt;
    while (simAccumulator >= 1/60 && appState === 'running') {
      sim.step(1/60);
      simAccumulator -= 1/60;
      processSimEvents();
    }
    if (sim.phase === 'racing' && sim.realElapsed > .9) els.centerBanner.classList.add('hidden');

    rankUiTimer += dt;
    if (rankUiTimer >= 0.1 && appState === 'running') {
      rankUiTimer = 0;
      renderRankingList();
    }

    if (commentaryTimer > 0) {
      commentaryTimer -= dt;
      if (commentaryTimer <= 0) {
        els.commentaryBar.classList.add('hidden');
      }
    }
  } else if (appState === 'finished' && sim) {
    sim.step(dt);
  }

  if (sim && appState !== 'paused') {
    stage.update(dt, sim);
  }
}

// Boot
applyQuality(lowQuality);
updateSavedButtonVisibility();
validateRosterUI();
initBgm();
requestAnimationFrame(loop);
