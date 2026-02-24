/* =====================================================
   PING PONG GAME - audio.js
   Web Audio API によるシンセサイザーBGM & 効果音
   ===================================================== */

const AudioContext = window.AudioContext || window.webkitAudioContext;
let actx = null;
let masterGain = null;
let bgmOscillators = [];
let bgmGain = null;

// 音声初期化（ユーザーのジェスチャー後に呼ぶ）
function initAudio() {
    if (actx) return;
    actx = new AudioContext();

    masterGain = actx.createGain();
    masterGain.gain.value = 0.6;
    masterGain.connect(actx.destination);
}

// -----------------------------------------------
// SE（効果音）
// -----------------------------------------------

// パドルヒット音（短く硬いシンセアタック）
function playHitSE() {
    if (!actx) return;
    const t = actx.currentTime;
    const osc = actx.createOscillator();
    const gain = actx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.1);

    gain.gain.setValueAtTime(0.8, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(t);
    osc.stop(t + 0.1);
}

// 壁バウンド音（少し高めのピップ音）
function playWallSE() {
    if (!actx) return;
    const t = actx.currentTime;
    const osc = actx.createOscillator();
    const gain = actx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, t);

    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(t);
    osc.stop(t + 0.1);
}

// 得点音（キラキラしたアルペジオ風）
function playScoreSE() {
    if (!actx) return;
    const t = actx.currentTime;

    const freqs = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    freqs.forEach((freq, i) => {
        const osc = actx.createOscillator();
        const gain = actx.createGain();

        osc.type = 'sine';
        osc.frequency.value = freq;

        const startTime = t + i * 0.08;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.5);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(startTime);
        osc.stop(startTime + 0.6);
    });
}

// ゲームオーバー/勝利音
function playWinSE() {
    if (!actx) return;
    const t = actx.currentTime;

    const freqs = [440, 554.37, 659.25, 880]; // A4, C#5, E5, A5
    freqs.forEach((freq, i) => {
        const osc = actx.createOscillator();
        const gain = actx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(freq / 2, t);
        osc.frequency.linearRampToValueAtTime(freq, t + 0.1);

        const startTime = t + i * 0.15;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.2, startTime + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + 1.2);

        // 簡易ディレイブレンド
        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(startTime);
        osc.stop(startTime + 1.5);
    });
}

// -----------------------------------------------
// BGM（美しいパッド系シンセドローン）
// -----------------------------------------------
function startPadBGM() {
    if (!actx) initAudio();
    if (actx.state === 'suspended') actx.resume();

    // 既に再生中なら無視
    if (bgmOscillators.length > 0) return;

    bgmGain = actx.createGain();
    bgmGain.gain.value = 0; // フェードイン用
    bgmGain.connect(masterGain);

    const t = actx.currentTime;
    bgmGain.gain.linearRampToValueAtTime(0.25, t + 4.0); // 4秒かけてゆっくりフェードイン

    // Fmaj9 / C みたいな浮遊感のある和音 (F, A, C, E, G)
    const baseFreqs = [174.61, 220.00, 261.63, 329.63, 392.00];

    baseFreqs.forEach(freq => {
        // 左右に揺れる2つのオシレーターで厚みを出す
        for (let i = 0; i < 2; i++) {
            const osc = actx.createOscillator();
            const panner = actx.createStereoPanner();
            const lfo = actx.createOscillator();
            const lfoGain = actx.createGain();

            // 少しだけデチューン（ピッチのズレ）を入れてコーラス効果を出す
            osc.type = 'sine';
            const detune = (i === 0 ? 1 : -1) * (Math.random() * 2 + 1);
            osc.frequency.value = freq + detune;

            // ゆっくりとしたパンニング（左右の揺れ）
            panner.pan.value = (i === 0 ? -0.5 : 0.5);

            // LFOで音量に緩やかな波（トレモロ/呼吸感）を持たせる
            lfo.type = 'sine';
            lfo.frequency.value = 0.1 + Math.random() * 0.1; // 10秒周期位
            lfo.connect(lfoGain.gain);
            lfoGain.gain.value = 0.4; // 揺れる幅

            // 接続
            osc.connect(lfoGain);
            lfoGain.connect(panner);
            panner.connect(bgmGain);

            osc.start();
            lfo.start();

            bgmOscillators.push({ osc, lfo });
        }
    });
}

function stopPadBGM() {
    if (bgmGain) {
        const t = actx.currentTime;
        bgmGain.gain.cancelScheduledValues(t);
        bgmGain.gain.setValueAtTime(bgmGain.gain.value, t);
        bgmGain.gain.linearRampToValueAtTime(0, t + 2.0); // 2秒でフェードアウト

        setTimeout(() => {
            bgmOscillators.forEach(nodes => {
                nodes.osc.stop();
                nodes.lfo.stop();
            });
            bgmOscillators = [];
            bgmGain.disconnect();
            bgmGain = null;
        }, 2100);
    }
}

// 外部から呼べるようにwindowにエクスポート
window.initAudio = initAudio;
window.startPadBGM = startPadBGM;
window.stopPadBGM = stopPadBGM;
window.playHitSE = playHitSE;
window.playWallSE = playWallSE;
window.playScoreSE = playScoreSE;
window.playWinSE = playWinSE;
