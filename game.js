/* =====================================================
   PING PONG GAME - game.js
   ブラウザ用ピンポンゲーム
   PC（キーボード）＋タブレット（タッチ）対応
   ===================================================== */

// =============== グローバル設定 ===============
let WIN_SCORE = 11;
let deuceEnabled = true;

const PADDLE_W = 14;
const PADDLE_TYPES = {
    circle: { type: 'circle' },
    normal: { type: 'rect', hRatio: 0.18 },
    large: { type: 'rect', hRatio: 0.28 }
};
let currentPadType = PADDLE_TYPES.normal;

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
let nextObstacleHitsTarget = 10; // 次にお邪魔AIが出現する目標ヒット数

// =============== 入力 ===============
// キーボード入力時の画面スクロールを防ぎ、ゲームに集中させる（フォーカス改善）
window.addEventListener('focus', () => { if (canvas) canvas.focus(); });
document.addEventListener('click', () => { window.focus(); });

const keys = {};
window.addEventListener('keydown', e => {
    keys[e.key] = true;
    if (["ArrowUp", "ArrowDown", "w", "s", "W", "S", " "].includes(e.key)) {
        e.preventDefault();
    }
}, { passive: false });
window.addEventListener('keyup', e => { keys[e.key] = false; });

// -----------------------------------------------
// パドルオブジェクト生成
// -----------------------------------------------
function makePaddle(side) {
    const isCircle = currentPadType.type === 'circle';
    return {
        side,
        x: side === 'left' ? PADDLE_W + 20 : W - PADDLE_W - 20,
        y: H / 2,
        w: PADDLE_W,
        isCircle: isCircle,
        h: isCircle ? PADDLE_W * 2 : H * currentPadType.hRatio,
        r: isCircle ? PADDLE_W : undefined,
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
    const diffMultiplier = {
        easy: 0.85,
        normal: 1.0,
        hard: 1.3
    };
    // 2Pモードの場合は常にnormalと同じ基準速度
    const mult = gameMode === '2p' ? diffMultiplier.normal : (diffMultiplier[aiDiff] || 1.0);
    const spd = W * 0.42 * mult;

    return {
        x: W / 2,
        y: H / 2,
        vx: Math.cos(angle) * spd * serveDir,
        vy: Math.sin(angle) * spd,
        baseSpeed: spd,
        hitsCount: 0,
        isPowerShot: false
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
    if (window.initAudio) {
        initAudio();
        startPadBGM();
    }
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
    document.querySelectorAll('#difficulty-area .btn-diff').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    aiDiff = diff;
}

// --- フェーズ2：UI設定用関数 ---
function setPadSize(el, size) {
    el.parentNode.querySelectorAll('.btn-diff').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    currentPadType = PADDLE_TYPES[size];
}

function setWinScore(el, score) {
    el.parentNode.querySelectorAll('.btn-diff').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    WIN_SCORE = score;
    const winGoalInfo = document.getElementById('win-goal-info');
    if (winGoalInfo) winGoalInfo.innerHTML = `先に <strong>${WIN_SCORE}点</strong> 取ったプレイヤーの勝利！`;
}

function setDeuce(el, enabled) {
    el.parentNode.querySelectorAll('.btn-diff').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    deuceEnabled = enabled;
}

function goMenu() {
    if (window.stopPadBGM) stopPadBGM();
    stopGame();
    showScreen('menu-screen');
    // 難易度エリアをリセット
    document.getElementById('difficulty-area').classList.remove('hidden');
}

function restartGame() {
    if (window.initAudio) {
        initAudio();
        // ★【修正】リトライ時にもBGMを再開する
        startPadBGM();
    }
    showScreen('game-screen');
    initGame();
}

function togglePause() {
    if (!gameRunning) return;
    paused = !paused;
    document.getElementById('btn-pause').textContent = paused ? '▶' : '⏸';
    if (!paused) {
        lastTime = performance.now();
        animId = requestAnimationFrame(loop);
    }
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
    powerItem = null; // アイテムリセット
    obstacle = null;
    nextObstacleHitsTarget = 10; // 初期化

    paused = false;
    gameRunning = true;
    scoring = false; // ★【修正】リトライ時に得点フラグをリセットし弾が画面外にいっても進行不可にならないようにする
    document.getElementById('btn-pause').textContent = '⏸';

    // ボールはない状態から開始するが、ループは回しておく（パドル操作と軌跡アニメーションのため）
    ball = null;
    lastTime = 0;
    animId = requestAnimationFrame(loop);

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

            // ボール生成してラウンド開始
            ball = makeBall(serveDir);
        }
    }, 1000);
}

// -----------------------------------------------
// メインループ
// -----------------------------------------------
let lastTime = 0;
function loop(timestamp) {
    if (!gameRunning || paused) {
        lastTime = timestamp;
        return;
    }
    if (!lastTime) lastTime = timestamp;
    const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;

    update(dt);
    render();
    animId = requestAnimationFrame(loop);
}

// -----------------------------------------------
// 更新
// -----------------------------------------------
let powerItem = null;
let obstacle = null;

function update(dt) {
    // パドルはゲームが動いていれば常に操作可能にする
    movePaddles(dt);

    if (!ball) {
        // ボールがない（待機中）時に軌跡をフェードアウト
        if (trail.length > 0) {
            for (let t of trail) {
                if (t.alpha === undefined) t.alpha = 1.0;
                t.alpha -= 3.6 * dt;
            }
            trail = trail.filter(t => t.alpha > 0);
        }
        return;
    }

    // --- パワーアイテム出現ロジック（中央30％で浮遊） ---
    if (!powerItem && ball.hitsCount >= 4 && Math.random() < 0.2 * dt) {
        powerItem = {
            x: W / 2,
            y: H / 2,
            baseX: W / 2,
            baseY: H / 2,
            r: 25,
            active: true,
            pulse: 0,
            time: 0
        };
    }

    // --- ボール移動 ---
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // 軌跡
    trail.push({ x: ball.x, y: ball.y, alpha: 1.0, isPowerShot: ball.isPowerShot });
    if (trail.length > TRAIL_LEN) trail.shift();

    // 上下壁バウンド
    if (ball.y - BALL_R <= 0) {
        ball.y = BALL_R;
        ball.vy = Math.abs(ball.vy);
        flashEdge('top');
        if (window.playWallSE) playWallSE();
    }
    if (ball.y + BALL_R >= H) {
        ball.y = H - BALL_R;
        ball.vy = -Math.abs(ball.vy);
        flashEdge('bottom');
        if (window.playWallSE) playWallSE();
    }

    // --- お邪魔ひし形AI 出現＆動作ロジック ---
    if (!obstacle && ball.hitsCount >= nextObstacleHitsTarget) {
        obstacle = {
            active: true,
            x: W / 2,
            y: H / 2,
            w: Math.max(16, H * 0.05), // 幅（画面高さ依存）
            h: Math.max(100, H * 0.25), // 高さ（画面高さ依存）
            speedY: H * 0.25, // 上下移動速度
            dir: 1,
            flash: 0,
            hp: 5 // 5回で破壊
        };
    }

    if (obstacle && obstacle.active) {
        obstacle.y += obstacle.speedY * obstacle.dir * dt;
        if (obstacle.y - obstacle.h / 2 < 20) {
            obstacle.y = obstacle.h / 2 + 20;
            obstacle.dir = 1;
        } else if (obstacle.y + obstacle.h / 2 > H - 20) {
            obstacle.y = H - obstacle.h / 2 - 20;
            obstacle.dir = -1;
        }
        if (obstacle.flash > 0) obstacle.flash -= 2 * dt;

        // ボールとの当たり判定 (ひし形近似)
        const hw = obstacle.w / 2;
        const hh = obstacle.h / 2;
        const dxAbs = Math.abs(ball.x - obstacle.x);
        const dyAbs = Math.abs(ball.y - obstacle.y);

        if (dxAbs / (hw + BALL_R) + dyAbs / (hh + BALL_R) <= 1.2) {
            const signX = Math.sign(ball.x - obstacle.x) || 1;
            const signY = Math.sign(ball.y - obstacle.y) || 1;
            let nx = signX * hh;
            let ny = signY * hw;
            const len = Math.hypot(nx, ny);
            nx /= len;
            ny /= len;

            const dot = ball.vx * nx + ball.vy * ny;
            if (dot < 0) { // 向かっている場合のみ反射
                ball.vx = ball.vx - 2 * dot * nx;
                ball.vy = ball.vy - 2 * dot * ny;

                // めり込み防止の押し出し
                ball.x += nx * 6;
                ball.y += ny * 6;
                // イレギュラー要素として速度を少し変化
                ball.vy += (Math.random() - 0.5) * ball.baseSpeed * 0.5;

                if (window.playHitSE) playHitSE();

                obstacle.hp--;
                if (obstacle.hp <= 0) {
                    if (window.playGlassBreakSE) window.playGlassBreakSE(); // 破壊音
                    obstacle = null; // 破壊
                    nextObstacleHitsTarget = ball.hitsCount + 10; // 再出現のための目標ヒット数更新
                } else {
                    if (window.playGlassHitSE) window.playGlassHitSE(); // 当たったガラス音
                    obstacle.flash = 1.0;
                }
            }
        }
    }

    // パドルとの衝突（物理演算化）
    checkPaddleHit(leftPaddle);
    checkPaddleHit(rightPaddle);

    // アイテム状態更新・衝突判定
    if (powerItem && powerItem.active) {
        if (powerItem.time === undefined) powerItem.time = 0;
        powerItem.time += dt;
        powerItem.pulse += 3.0 * dt; // スケール・明滅用

        // ゆったり浮遊（中央30%エリアを大きく漂う）
        const rangeX = W * 0.15;
        const rangeY = H * 0.15;
        powerItem.x = powerItem.baseX + Math.sin(powerItem.time * 0.8) * rangeX;
        powerItem.y = powerItem.baseY + Math.cos(powerItem.time * 1.1) * rangeY;

        const dx = ball.x - powerItem.x;
        const dy = ball.y - powerItem.y;
        if (Math.hypot(dx, dy) < BALL_R + powerItem.r) {
            powerItem.active = false;
            ball.isPowerShot = true;
            ball.vx *= 1.6;
            ball.vy *= 1.6;
            if (window.playScoreSE) playScoreSE(); // 取得音
        }
    }

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
function movePaddles(dt) {
    const paddleSpd = H * 0.72 * dt;

    // --- 左パドル（Player1 / W・S / タッチ） ---
    if (leftPaddle.touchY !== null) {
        // タッチ操作
        leftPaddle.y += (leftPaddle.touchY - leftPaddle.y) * 10.8 * dt;
    } else {
        // キーボード
        if (keys['w'] || keys['W']) leftPaddle.y -= paddleSpd;
        if (keys['s'] || keys['S']) leftPaddle.y += paddleSpd;
    }

    // --- 右パドル（Player2 or AI） ---
    if (gameMode === '2p') {
        // 2P: 矢印キー / タッチ
        if (rightPaddle.touchY !== null) {
            rightPaddle.y += (rightPaddle.touchY - rightPaddle.y) * 10.8 * dt;
        } else {
            if (keys['ArrowUp']) rightPaddle.y -= paddleSpd;
            if (keys['ArrowDown']) rightPaddle.y += paddleSpd;
        }
    } else {
        // AI
        moveAI(dt, rightPaddle, 'right');
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
function moveAI(dt, paddle = rightPaddle, side = 'right') {
    if (!ball) return;
    const factor = (AI_SPEED[aiDiff] || 0.07) * 60 * dt;
    // ボールが自陣へ向かうときのみ追跡（イージーはランダム要素追加）
    let targetY = H / 2;

    // 向かってくる方向判定
    const isIncoming = (side === 'right' && ball.vx > 0) || (side === 'left' && ball.vx < 0);

    if (isIncoming) {
        targetY = ball.y;
        if (aiDiff === 'easy') {
            // easy: ノイズを加えて不完全に
            targetY += (Math.random() - 0.5) * H * 0.25;
        }
    }
    paddle.y += (targetY - paddle.y) * factor;
}

// -----------------------------------------------
// パドル衝突チェック（丸形・矩形対応、物理演算化）
// -----------------------------------------------
function checkPaddleHit(p) {
    if (!ball) return;

    let hit = false;
    let normalX = 0;
    let normalY = 0;

    if (p.isCircle) {
        // 円パドルとの衝突判定（円と円）
        const dx = ball.x - p.x;
        const dy = ball.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < BALL_R + p.r) {
            hit = true;
            if (dist !== 0) {
                normalX = dx / dist;
                normalY = dy / dist;
            } else {
                normalX = p.side === 'left' ? 1 : -1;
            }
            // 位置の押し出し
            ball.x = p.x + normalX * (BALL_R + p.r);
            ball.y = p.y + normalY * (BALL_R + p.r);
        }
    } else {
        // 矩形（両端R形状＝カプセル）との衝突判定
        const top = p.y - p.h / 2 + p.w / 2;
        const bottom = p.y + p.h / 2 - p.w / 2;

        let closestX = p.x;
        let closestY = Math.max(top, Math.min(ball.y, bottom));

        const dx = ball.x - closestX;
        const dy = ball.y - closestY;
        const dist = Math.hypot(dx, dy);
        const rSum = BALL_R + p.w / 2; // R部分は幅の半分

        if (dist < rSum) {
            hit = true;
            if (dist === 0) {
                normalX = p.side === 'left' ? 1 : -1;
            } else {
                normalX = dx / dist;
                normalY = dy / dist;
            }
            ball.x = closestX + normalX * rSum;
            ball.y = closestY + normalY * rSum;
        }
    }

    if (hit) {
        // パワーショット解除（受けた側は元の速度ベースになる）
        ball.isPowerShot = false;

        // 反射ベクトル計算: V' = V - 2(V・N)N
        const dot = ball.vx * normalX + ball.vy * normalY;
        ball.vx = ball.vx - 2 * dot * normalX;
        ball.vy = ball.vy - 2 * dot * normalY;

        // 操作感向上のため、パドル中心からの絶対的距離スピン影響を少し足す
        const relY = p.isCircle ? (ball.y - p.y) / p.r : (ball.y - p.y) / (p.h / 2);
        ball.vy += relY * ball.baseSpeed * 0.4;

        // 速度計算と再定義
        ball.hitsCount++;
        // 加速感をアップ（回数×15%加算、最大3.0倍まで）
        const accel = Math.min(1 + ball.hitsCount * 0.15, 3.0);
        let spd = Math.hypot(ball.vx, ball.vy);
        if (spd < 0.1) spd = 1; // 0割回避
        const newSpd = ball.baseSpeed * accel;

        ball.vx = (ball.vx / spd) * newSpd;
        ball.vy = (ball.vy / spd) * newSpd;

        // X方向の速度が死なないように補正
        if (Math.abs(ball.vx) < newSpd * 0.3) {
            ball.vx = Math.sign(ball.vx || (p.side === 'left' ? 1 : -1)) * newSpd * 0.3;
        }
        // 裏側に行くのを防ぐ強制的進行方向補正
        if (p.side === 'left' && ball.vx < 0) ball.vx *= -1;
        if (p.side === 'right' && ball.vx > 0) ball.vx *= -1;

        // ヒットフラッシュ演出
        triggerHitFlash(p);
        if (window.playHitSE) playHitSE();
    }
}

// -----------------------------------------------
// 得点
// -----------------------------------------------
function scored(winner) {
    // 【修正】ここではループ（animId）を止めず、ボールをnullにするだけに留める。
    // gameRunning = false もしない。これにより、ボールが消えた後もパドルが動き、軌跡がフェードアウトする。

    if (winner === 'right') scoreRight++;
    else scoreLeft++;

    updateScoreUI(winner);
    if (window.playScoreSE) playScoreSE();

    // デュースを含む勝利判定
    let isWin = false;
    if (deuceEnabled && scoreLeft >= WIN_SCORE - 1 && scoreRight >= WIN_SCORE - 1) {
        // デュース状態：2点差をつけるまで
        if (Math.abs(scoreLeft - scoreRight) >= 2 && (scoreLeft >= WIN_SCORE || scoreRight >= WIN_SCORE)) {
            isWin = true;
        }
    } else {
        if (scoreLeft >= WIN_SCORE || scoreRight >= WIN_SCORE) {
            isWin = true;
        }
    }

    if (isWin) {
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
    // ★【修正】BGM停止・ループ終了はリザルト表示時に行う。
    if (window.stopPadBGM) stopPadBGM();
    if (window.playWinSE) playWinSE();
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

    // アイテム描画
    if (powerItem && powerItem.active) {
        drawPowerItem();
    }

    // お邪魔ひし形描画
    if (obstacle && obstacle.active) {
        drawObstacle();
    }

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
        const alpha = trail[i].alpha !== undefined ? trail[i].alpha : 1.0;
        ctx.save();
        ctx.globalAlpha = Math.max(0, ratio * 0.35 * alpha);
        ctx.beginPath();
        ctx.arc(trail[i].x, trail[i].y, size, 0, Math.PI * 2);

        if (trail[i].isPowerShot) {
            ctx.fillStyle = '#ffe600'; // パワーショット時の黄色い軌跡
        } else {
            ctx.fillStyle = '#00f5ff';
        }
        ctx.fill();
        ctx.restore();
    }
}

function drawPaddle(p, color) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;

    if (p.isCircle) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        const grad = ctx.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.1, p.x, p.y, p.r);
        grad.addColorStop(0, 'rgba(255,255,255,0.4)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fill();
    } else {
        const x = p.x - p.w / 2;
        const y = p.y - p.h / 2;
        const r = p.w / 2;  // 角丸半径

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
    }

    ctx.restore();
}

function drawBall() {
    if (!ball) return;

    // グロー
    ctx.save();
    if (ball.isPowerShot) {
        // パワーショット時の激しい発光
        const flicker = Math.random() > 0.5 ? 40 : 20;
        ctx.shadowColor = '#ffe600';
        ctx.shadowBlur = flicker;
    } else {
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 30;
    }

    // 本体
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);

    let grad;
    if (ball.isPowerShot) {
        grad = ctx.createRadialGradient(
            ball.x - BALL_R * 0.3, ball.y - BALL_R * 0.3, BALL_R * 0.1,
            ball.x, ball.y, BALL_R
        );
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.5, '#ffffbb');
        grad.addColorStop(1, '#ffbb00');
    } else {
        grad = ctx.createRadialGradient(
            ball.x - BALL_R * 0.3, ball.y - BALL_R * 0.3, BALL_R * 0.1,
            ball.x, ball.y, BALL_R
        );
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.6, '#c0f8ff');
        grad.addColorStop(1, '#00bcd4');
    }
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.restore();
}

function drawPowerItem() {
    ctx.save();
    // 鼓動を大きく
    const animScale = 1 + Math.sin(powerItem.pulse) * 0.25;
    ctx.shadowColor = '#ffe600';
    ctx.shadowBlur = 30;
    ctx.globalAlpha = 0.8 + Math.sin(powerItem.pulse * 2) * 0.2; // 明滅

    ctx.beginPath();
    ctx.arc(powerItem.x, powerItem.y, powerItem.r * animScale, 0, Math.PI * 2);
    ctx.fillStyle = '#ffe600';
    ctx.fill();
    ctx.restore();
}

function drawObstacle() {
    ctx.save();
    const flash = Math.max(0, obstacle.flash);

    // アメジスト調（深く濃い紫、フラッシュ時：紫がかった白）
    const normalColor = 'rgba(106, 13, 173, 0.85)'; // 濃い紫（DarkViolet系）
    const flashColor = '#f3e5f5'; // 紫がかった白

    ctx.shadowColor = flash > 0 ? flashColor : '#8a2be2'; // BlueViolet（青紫の光の拡散）
    ctx.shadowBlur = flash > 0 ? 30 : 20;
    ctx.fillStyle = flash > 0 ? flashColor : normalColor;

    ctx.beginPath();
    ctx.moveTo(obstacle.x, obstacle.y - obstacle.h / 2); // 上
    ctx.lineTo(obstacle.x + obstacle.w / 2, obstacle.y); // 右
    ctx.lineTo(obstacle.x, obstacle.y + obstacle.h / 2); // 下
    ctx.lineTo(obstacle.x - obstacle.w / 2, obstacle.y); // 左
    ctx.closePath();
    ctx.fill();

    // 内側のハイライト
    ctx.beginPath();
    ctx.moveTo(obstacle.x, obstacle.y - obstacle.h / 2 + 10);
    ctx.lineTo(obstacle.x + obstacle.w / 2 - 4, obstacle.y);
    ctx.lineTo(obstacle.x, obstacle.y + obstacle.h / 2 - 10);
    ctx.lineTo(obstacle.x - obstacle.w / 2 + 4, obstacle.y);
    ctx.closePath();

    // ハイライトの色合いは薄い紫〜マゼンタ系
    ctx.fillStyle = flash > 0 ? '#ffffff' : 'rgba(238, 130, 238, 0.5)'; // Violet
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

    if (leftPaddle.isCircle) {
        leftPaddle.h = PADDLE_W * 2;
        leftPaddle.r = PADDLE_W;
        rightPaddle.h = PADDLE_W * 2;
        rightPaddle.r = PADDLE_W;
    } else {
        leftPaddle.h = H * currentPadType.hRatio;
        rightPaddle.h = H * currentPadType.hRatio;
    }

    leftPaddle.x = PADDLE_W + 20;
    rightPaddle.x = W - PADDLE_W - 20;
    if (ball) {
        ball.x *= ratio;
        ball.y *= ratio;
    }
    if (powerItem && powerItem.active) {
        powerItem.baseX = W / 2;
        powerItem.baseY = H / 2;
    }
    if (obstacle && obstacle.active) {
        obstacle.x = W / 2;
        obstacle.y *= ratio;
    }
});

// -----------------------------------------------
// 初期表示
// -----------------------------------------------
showScreen('menu-screen');
