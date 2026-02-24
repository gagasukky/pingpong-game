/* =====================================================
   PING PONG GAME - game.js
   ブラウザ用ピンポンゲーム
   PC（キーボード）＋タブレット（タッチ）対応
   ===================================================== */

// =============== グローバル設定 ===============
const WIN_SCORE = 11;
const PADDLE_W = 14;
const PADDLE_H_RATIO = 0.18;  // Canvasの高さに対する比率
const BALL_R = 9;
const TRAIL_LEN = 8;

const AI_SPEED = { easy: 0.035, normal: 0.07, hard: 0.14 };

let scoring = false;  // 得点処理中フラグ（二重実行防止）

// =============== 状態管理 ===============
let gameMode = '1p';
let aiDiff = 'normal';
let paused = false;
let gameRunning = false;
let animId = null;

// =============== Canvas ===============
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

let W, H; // canvasサイズ

// =============== ゲームオブジェクト ===============
let ball, leftPaddle, rightPaddle, trail;
let scoreLeft = 0, scoreRight = 0;

// =============== 入力 ===============
const keys = {};
window.addEventListener('keydown', e => { keys[e.key] = true; });
window.addEventListener('keyup', e => { keys[e.key] = false; });

// -----------------------------------------------
// パドルオブジェクト生成
// -----------------------------------------------
function makePaddle(side) {
    return {
        side,
        x: side === 'left' ? PADDLE_W + 20 : W - PADDLE_W - 20,
        y: H / 2,
        w: PADDLE_W,
        h: H * PADDLE_H_RATIO,
        speed: 0,
        // タッチ用
        touchY: null
    };
}

// -----------------------------------------------
// ボールオブジェクト生成
// -----------------------------------------------
function makeBall(serveDir = 1) {
    const angle = (Math.random() * 0.8 - 0.4); // ±0.4rad
    const spd = W * 0.007;
    return {
        x: W / 2,
        y: H / 2,
        vx: Math.cos(angle) * spd * serveDir,
        vy: Math.sin(angle) * spd,
        baseSpeed: spd,
        hitsCount: 0
    };
}

// -----------------------------------------------
// リサイズ処理
// -----------------------------------------------
function resizeCanvas() {
    const wrap = document.getElementById('canvas-wrap');
    const hud = document.getElementById('hud');
    const bot = document.getElementById('bottom-bar');
    const wrapH = wrap.clientHeight;
    const wrapW = wrap.clientWidth;

    // 16:9比率を基準にサイズ決定
    let cw = wrapW;
    let ch = cw * (9 / 16);
    if (ch > wrapH) { ch = wrapH; cw = ch * (16 / 9); }

    canvas.width = Math.floor(cw);
    canvas.height = Math.floor(ch);
    W = canvas.width;
    H = canvas.height;
}

// -----------------------------------------------
// メニュー操作
// -----------------------------------------------
function startGame(mode) {
    gameMode = mode;
    // 2P選択時はAI難易度を隠す
    const diffArea = document.getElementById('difficulty-area');
    if (mode === '2p') {
        diffArea.classList.add('hidden');
    }
    showScreen('game-screen');
    initGame();
}

function setDiff(el, diff) {
    document.querySelectorAll('.btn-diff').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    aiDiff = diff;
}

function goMenu() {
    stopGame();
    showScreen('menu-screen');
    // 難易度エリアをリセット
    document.getElementById('difficulty-area').classList.remove('hidden');
}

function restartGame() {
    showScreen('game-screen');
    initGame();
}

function togglePause() {
    if (!gameRunning) return;
    paused = !paused;
    document.getElementById('btn-pause').textContent = paused ? '▶' : '⏸';
    if (!paused) loop();
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

// -----------------------------------------------
// ゲーム初期化
// -----------------------------------------------
function initGame() {
    stopGame();
    resizeCanvas();
    scoreLeft = 0;
    scoreRight = 0;
    updateScoreUI();

    // プレイヤー名設定
    document.getElementById('p1-name').textContent = 'PLAYER 1';
    document.getElementById('p2-name').textContent = gameMode === '1p' ? 'AI' : 'PLAYER 2';

    leftPaddle = makePaddle('left');
    rightPaddle = makePaddle('right');
    trail = [];

    paused = false;
    gameRunning = true;
    document.getElementById('btn-pause').textContent = '⏸';

    // 最初はカウントダウン後に開始
    startRound(1);
}

function stopGame() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    gameRunning = false;
}

// -----------------------------------------------
// ラウンド開始（カウントダウン）
// -----------------------------------------------
function startRound(serveDir) {
    ball = null;
    trail = [];
    let count = 3;

    // 毎回新しく要素を作ることで確実にアニメーションをリセット・独立させる
    function showNum(n) {
        const oldCd = document.getElementById('countdown-anim');
        if (oldCd) oldCd.remove();

        const cd = document.createElement('div');
        cd.id = 'countdown-anim';
        cd.className = 'countdown-text';
        cd.textContent = n;
        document.getElementById('canvas-wrap').appendChild(cd);
    }

    showNum(count); // 最初の「3」を表示

    const tick = setInterval(() => {
        count--;
        if (count > 0) {
            showNum(count); // 「2」「1」を表示
        } else {
            clearInterval(tick);
            const finalCd = document.getElementById('countdown-anim');
            if (finalCd) finalCd.remove();

            // ボール生成＆ゲーム開始
            ball = makeBall(serveDir);
            loop();
        }
    }, 1000);
}

// -----------------------------------------------
// メインループ
// -----------------------------------------------
function loop() {
    if (!gameRunning || paused) return;
    update();
    render();
    animId = requestAnimationFrame(loop);
}

// -----------------------------------------------
// 更新
// -----------------------------------------------
function update() {
    if (!ball) return;

    // --- パドル移動 ---
    movePaddles();

    // --- ボール移動 ---
    ball.x += ball.vx;
    ball.y += ball.vy;

    // 軌跡
    trail.push({ x: ball.x, y: ball.y });
    if (trail.length > TRAIL_LEN) trail.shift();

    // 上下壁バウンド
    if (ball.y - BALL_R <= 0) {
        ball.y = BALL_R;
        ball.vy = Math.abs(ball.vy);
        flashEdge('top');
    }
    if (ball.y + BALL_R >= H) {
        ball.y = H - BALL_R;
        ball.vy = -Math.abs(ball.vy);
        flashEdge('bottom');
    }

    // パドルとの衝突
    checkPaddleHit(leftPaddle);
    checkPaddleHit(rightPaddle);

    // 得点判定
    if (ball.x - BALL_R < 0) {
        // 右が得点
        if (!scoring) { scoring = true; ball = null; scored('right'); }
    } else if (ball.x + BALL_R > W) {
        if (!scoring) { scoring = true; ball = null; scored('left'); }
    }
}

// -----------------------------------------------
// パドル移動
// -----------------------------------------------
function movePaddles() {
    const paddleSpd = H * 0.012;

    // --- 左パドル（Player1 / W・S / タッチ） ---
    if (leftPaddle.touchY !== null) {
        // タッチ操作
        leftPaddle.y += (leftPaddle.touchY - leftPaddle.y) * 0.18;
    } else {
        // キーボード
        if (keys['w'] || keys['W']) leftPaddle.y -= paddleSpd;
        if (keys['s'] || keys['S']) leftPaddle.y += paddleSpd;
    }

    // --- 右パドル（Player2 or AI） ---
    if (gameMode === '2p') {
        // 2P: 矢印キー / タッチ
        if (rightPaddle.touchY !== null) {
            rightPaddle.y += (rightPaddle.touchY - rightPaddle.y) * 0.18;
        } else {
            if (keys['ArrowUp']) rightPaddle.y -= paddleSpd;
            if (keys['ArrowDown']) rightPaddle.y += paddleSpd;
        }
    } else {
        // AI
        moveAI();
    }

    // 画面内クランプ
    clampPaddle(leftPaddle);
    clampPaddle(rightPaddle);
}

function clampPaddle(p) {
    const half = p.h / 2;
    if (p.y - half < 0) p.y = half;
    if (p.y + half > H) p.y = H - half;
}

// -----------------------------------------------
// AI移動
// -----------------------------------------------
function moveAI() {
    if (!ball) return;
    const factor = AI_SPEED[aiDiff] || 0.07;
    // ボールが右へ向かうときのみ追跡（イージーはランダム要素追加）
    let targetY = H / 2;
    if (ball.vx > 0) {
        targetY = ball.y;
        if (aiDiff === 'easy') {
            // easy: ノイズを加えて不完全に
            targetY += (Math.random() - 0.5) * H * 0.25;
        }
    }
    rightPaddle.y += (targetY - rightPaddle.y) * factor;
}

// -----------------------------------------------
// パドル衝突チェック
// -----------------------------------------------
function checkPaddleHit(p) {
    if (!ball) return;

    const bx = ball.x, by = ball.y;
    const left = p.x - p.w / 2;
    const right = p.x + p.w / 2;
    const top = p.y - p.h / 2;
    const bottom = p.y + p.h / 2;

    // バウンディングボックス判定
    if (bx + BALL_R > left && bx - BALL_R < right &&
        by + BALL_R > top && by - BALL_R < bottom) {

        // 反射
        if (p.side === 'left') {
            ball.x = right + BALL_R;
            ball.vx = Math.abs(ball.vx);
        } else {
            ball.x = left - BALL_R;
            ball.vx = -Math.abs(ball.vx);
        }

        // パドルの当たり位置でvy調整（スピン効果）
        const relY = (by - p.y) / (p.h / 2); // -1〜1
        ball.vy = relY * ball.baseSpeed * 1.4;

        // ヒット毎に少し加速（最大2倍）
        ball.hitsCount++;
        const accel = Math.min(1 + ball.hitsCount * 0.06, 2.0);
        const spd = Math.hypot(ball.vx, ball.vy);
        const newSpd = ball.baseSpeed * accel;
        ball.vx = (ball.vx / spd) * newSpd;
        ball.vy = (ball.vy / spd) * newSpd;

        // ヒットフラッシュ
        triggerHitFlash(p);
    }
}

// -----------------------------------------------
// 得点
// -----------------------------------------------
function scored(winner) {
    cancelAnimationFrame(animId);
    animId = null;
    gameRunning = false;  // ループを確実に停止

    if (winner === 'right') scoreRight++;
    else scoreLeft++;

    updateScoreUI(winner);

    if (scoreLeft >= WIN_SCORE || scoreRight >= WIN_SCORE) {
        // 試合終了
        setTimeout(() => showResult(), 800);
    } else {
        // 次のラウンド（サーブ方向は得点した側から）
        const dir = winner === 'right' ? 1 : -1;
        setTimeout(() => {
            scoring = false;
            gameRunning = true;
            startRound(dir);
        }, 600);
    }
}

function updateScoreUI(flashSide) {
    document.getElementById('score-left').textContent = scoreLeft;
    document.getElementById('score-right').textContent = scoreRight;

    if (flashSide === 'right') flashScore('score-right');
    if (flashSide === 'left') flashScore('score-left');
}

function flashScore(id) {
    const el = document.getElementById(id);
    el.classList.add('pop');
    setTimeout(() => el.classList.remove('pop'), 300);
}

// -----------------------------------------------
// 勝利画面
// -----------------------------------------------
function showResult() {
    stopGame();
    const isP1Win = scoreLeft >= WIN_SCORE;
    const winName = isP1Win ? 'PLAYER 1' : (gameMode === '1p' ? 'AI' : 'PLAYER 2');

    document.getElementById('result-emoji').textContent = isP1Win ? '🏆' : (gameMode === '1p' ? '🤖' : '🏆');
    document.getElementById('result-title').textContent = `${winName} WIN!`;
    document.getElementById('result-score').textContent = `${scoreLeft} - ${scoreRight}`;

    showScreen('result-screen');
}

// -----------------------------------------------
// 描画
// -----------------------------------------------
function render() {
    ctx.clearRect(0, 0, W, H);

    // ---- 背景 ----
    ctx.fillStyle = '#080c14';
    ctx.fillRect(0, 0, W, H);

    // 中央点線
    drawCenterLine();

    // ボール軌跡
    drawTrail();

    // パドル
    drawPaddle(leftPaddle, '#00f5ff');
    drawPaddle(rightPaddle, '#ff00cc');

    // ボール
    if (ball) drawBall();
}

function drawCenterLine() {
    ctx.save();
    ctx.setLineDash([10, 14]);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.restore();
}

function drawTrail() {
    for (let i = 0; i < trail.length; i++) {
        const ratio = (i + 1) / trail.length;
        const size = BALL_R * ratio * 1.2;
        ctx.save();
        ctx.globalAlpha = ratio * 0.35;
        ctx.beginPath();
        ctx.arc(trail[i].x, trail[i].y, size, 0, Math.PI * 2);
        ctx.fillStyle = '#00f5ff';
        ctx.fill();
        ctx.restore();
    }
}

function drawPaddle(p, color) {
    const x = p.x - p.w / 2;
    const y = p.y - p.h / 2;
    const r = p.w / 2;  // 角丸半径

    // グロー
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;

    // 本体（角丸矩形）
    ctx.beginPath();
    ctx.roundRect(x, y, p.w, p.h, r);
    ctx.fillStyle = color;
    ctx.fill();

    // ハイライト
    const grad = ctx.createLinearGradient(x, y, x + p.w, y);
    grad.addColorStop(0, 'rgba(255,255,255,0.4)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.restore();
}

function drawBall() {
    if (!ball) return;

    // グロー
    ctx.save();
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 30;

    // 本体
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);

    const grad = ctx.createRadialGradient(
        ball.x - BALL_R * 0.3, ball.y - BALL_R * 0.3, BALL_R * 0.1,
        ball.x, ball.y, BALL_R
    );
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.6, '#c0f8ff');
    grad.addColorStop(1, '#00bcd4');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.restore();
}

// -----------------------------------------------
// エフェクト
// -----------------------------------------------
let hitFlashState = null;

function triggerHitFlash(paddle) {
    hitFlashState = {
        x: paddle.side === 'left' ? paddle.x + paddle.w : paddle.x - paddle.w,
        y: paddle.y,
        r: 40,
        color: paddle.side === 'left' ? '#00f5ff' : '#ff00cc',
        alpha: 0.7,
        frame: 0
    };
}

function flashEdge() { /* 上下壁ヒット時の演出（省略可） */ }

// -----------------------------------------------
// タッチ操作
// -----------------------------------------------
canvas.addEventListener('touchstart', onTouchStart, { passive: false });
canvas.addEventListener('touchmove', onTouchMove, { passive: false });
canvas.addEventListener('touchend', onTouchEnd, { passive: false });

function getTouchPaddle(touchX) {
    return touchX < W / 2 ? leftPaddle : rightPaddle;
}

// タッチID → パドル対応
const touchMap = new Map(); // touchId → 'left'|'right'

function onTouchStart(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const scaleY = H / rect.height;

    for (const t of e.changedTouches) {
        const tx = (t.clientX - rect.left) * (W / rect.width);
        const ty = (t.clientY - rect.top) * scaleY;
        const side = tx < W / 2 ? 'left' : 'right';
        touchMap.set(t.identifier, side);
        if (side === 'left') leftPaddle.touchY = ty;
        else rightPaddle.touchY = ty;
    }
}

function onTouchMove(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const scaleY = H / rect.height;

    for (const t of e.changedTouches) {
        const ty = (t.clientY - rect.top) * scaleY;
        const side = touchMap.get(t.identifier);
        if (side === 'left') leftPaddle.touchY = ty;
        else if (side === 'right') rightPaddle.touchY = ty;
    }
}

function onTouchEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
        const side = touchMap.get(t.identifier);
        if (side === 'left') leftPaddle.touchY = null;
        else if (side === 'right') rightPaddle.touchY = null;
        touchMap.delete(t.identifier);
    }
}

// -----------------------------------------------
// ウィンドウリサイズ対応
// -----------------------------------------------
window.addEventListener('resize', () => {
    if (!gameRunning) return;
    const prevH = H;
    resizeCanvas();
    // パドル・ボール位置を比率で補正
    const ratio = H / prevH;
    leftPaddle.y *= ratio;
    rightPaddle.y *= ratio;
    leftPaddle.h = H * PADDLE_H_RATIO;
    rightPaddle.h = H * PADDLE_H_RATIO;
    leftPaddle.x = PADDLE_W + 20;
    rightPaddle.x = W - PADDLE_W - 20;
    if (ball) { ball.y *= ratio; }
});

// -----------------------------------------------
// 初期表示
// -----------------------------------------------
showScreen('menu-screen');
