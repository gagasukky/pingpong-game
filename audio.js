/* =====================================================
   PING PONG GAME - audio.js
   Web Audio API によるシンセサイザーBGM & 効果音
   ===================================================== */

const AudioContext = window.AudioContext || window.webkitAudioContext;
let actx = null;
let masterGain = null;
let bgmOscillators = [];
let bgmGain = null;
let bgmIntervalId = null; // コード展開用タイマー

// 和音進行（Fmaj7 -> Cmaj7 -> Dm7 -> Am7）
const chordProgression = [
    [174.61, 220.00, 261.63, 329.63], // Fmaj7
    [130.81, 164.81, 196.00, 246.94], // Cmaj7
    [146.83, 174.61, 220.00, 261.63], // Dm7
    [220.00, 261.63, 329.63, 392.00]  // Am7
];
let currentChordIdx = 0;

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

    // 最初のコードで開始
    currentChordIdx = 0;
    const baseFreqs = chordProgression[currentChordIdx];

    baseFreqs.forEach((freq, baseIdx) => {
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

            bgmOscillators.push({ osc, lfo, baseIdx, detune });
        }
    });

    // 12秒ごとにコードをフワッと変更するシーケンス
    bgmIntervalId = setInterval(() => {
        currentChordIdx = (currentChordIdx + 1) % chordProgression.length;
        const nextChord = chordProgression[currentChordIdx];
        const now = actx.currentTime;

        bgmOscillators.forEach(item => {
            const targetFreq = nextChord[item.baseIdx] + item.detune;
            item.osc.frequency.cancelScheduledValues(now);
            item.osc.frequency.setValueAtTime(item.osc.frequency.value, now);
            item.osc.frequency.exponentialRampToValueAtTime(targetFreq, now + 4.0); // 4秒かけてスライド
        });
    }, 12000);
}

function stopPadBGM() {
    if (bgmIntervalId) {
        clearInterval(bgmIntervalId);
        bgmIntervalId = null;
    }

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

// -----------------------------------------------
// 追加SE：ガラス・クリスタル系
// -----------------------------------------------

// 宝石（アメジスト）の衝突音（コォンッ または キンッ）
function playGlassHitSE() {
    if (!actx) return;
    const t = actx.currentTime;

    // 高音の硬いアタックに加え、少し低めの成分を足して重厚な共鳴感を出す
    const freqs = [880, 1760, 2640];
    freqs.forEach((freq, idx) => {
        const osc = actx.createOscillator();
        const gain = actx.createGain();

        // 基音に硬さを持たせるため、1つ目をtriangleにする
        osc.type = idx === 0 ? 'triangle' : 'sine';
        // 瞬間的なピッチダウンで軽快なアタック感を出す
        osc.frequency.setValueAtTime(freq * 1.05, t);
        osc.frequency.exponentialRampToValueAtTime(freq, t + 0.08);

        // 重みを持たせるため少し長めに余韻を残す
        gain.gain.setValueAtTime(0.5 - (idx * 0.15), t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25 - (idx * 0.05));

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(t);
        osc.stop(t + 0.3);
    });
}

// 宝石が砕ける音（硬質な破片が散る感覚）
function playGlassBreakSE() {
    if (!actx) return;
    const t = actx.currentTime;

    // 重厚な宝石が砕ける音（低めの成分と、硬質な破片の飛散表現）
    for (let i = 0; i < 15; i++) {
        const osc = actx.createOscillator();
        const gain = actx.createGain();

        // sine, triangleに加えてsquareも少し混ぜて硬質な破片感を出す
        const randType = Math.random();
        osc.type = randType > 0.6 ? 'sine' : (randType > 0.3 ? 'triangle' : 'square');

        // 少し低めの周波数も含め、宝石の質量感を表現
        const freq = 800 + Math.random() * 3500;
        osc.frequency.setValueAtTime(freq, t);
        // 少しピッチを急降下させて破片の重さを出す
        osc.frequency.exponentialRampToValueAtTime(freq * 0.8, t + 0.2);

        const delay = Math.random() * 0.12; // 破片が散るような微妙な時間のズレ
        const duration = 0.3 + Math.random() * 0.5; // 少し長めの余韻

        gain.gain.setValueAtTime(0, t + delay); // delayまで0
        gain.gain.linearRampToValueAtTime(0.2, t + delay + 0.01); // 一瞬でアタック
        gain.gain.exponentialRampToValueAtTime(0.01, t + delay + duration); // 減衰

        // パンニングでキラキラ感を広げる
        const panner = actx.createStereoPanner();
        panner.pan.value = (Math.random() - 0.5) * 1.8;

        // square等高倍音を含む場合は少しフィルターをかける
        const filter = actx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 6000;

        osc.connect(gain);
        gain.connect(filter);
        filter.connect(panner);
        panner.connect(masterGain);

        osc.start(t);
        osc.stop(t + delay + duration);
    }
}

// 外部から呼べるようにwindowにエクスポート
window.initAudio = initAudio;
window.startPadBGM = startPadBGM;
window.stopPadBGM = stopPadBGM;
window.playHitSE = playHitSE;
window.playWallSE = playWallSE;
window.playWinSE = playWinSE;
window.playGlassHitSE = playGlassHitSE;
window.playGlassBreakSE = playGlassBreakSE;
