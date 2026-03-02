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
let bgmStopTimeout = null; // BGM停止タイマー

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

// アイテム取得音（メロディアスで癒やされる音色・カーブ球用）
function playHealSE() {
    if (!actx) return;
    const t = actx.currentTime;

    // ペンタトニックスケール風の広がる和音（C, D, E, G, A）
    const freqs = [523.25, 587.33, 659.25, 783.99, 880.00];
    freqs.forEach((freq, i) => {
        const osc = actx.createOscillator();
        const gain = actx.createGain();

        // 柔らかく暖かい音色（サイン波）
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);

        const startTime = t + i * 0.1; // ゆったりと音が重なる
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.2, startTime + 0.1);
        // 長めの減衰で余韻（癒やし）を残す
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.2);

        // 少しパンニングして広がりを
        const panner = actx.createStereoPanner();
        panner.pan.value = (Math.random() - 0.5) * 0.8;

        osc.connect(gain);
        gain.connect(panner);
        panner.connect(masterGain);

        osc.start(startTime);
        osc.stop(startTime + 1.5);
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

    // 停止中タイマーがあればキャンセル（BGM再開のバグ対策）
    if (bgmStopTimeout) {
        clearTimeout(bgmStopTimeout);
        bgmStopTimeout = null;
        // 即座に古いものを破棄
        bgmOscillators.forEach(layer => {
            layer.gain.gain.cancelScheduledValues(actx.currentTime);
            layer.osc.stop();
            layer.lfo.stop();
            layer.gain.disconnect();
        });
        bgmOscillators = [];
    }

    // 既に再生中なら無視
    if (bgmOscillators.length > 0 || bgmIntervalId) return;

    // 初回のコードで開始
    currentChordIdx = 0;
    playChordLayer(chordProgression[currentChordIdx], 4.0);

    // 12秒ごとにコードをフワッと変更するシーケンス（クロスフェード）
    bgmIntervalId = setInterval(() => {
        currentChordIdx = (currentChordIdx + 1) % chordProgression.length;
        const nextChord = chordProgression[currentChordIdx];

        // 古いオシレータ群をフェードアウト
        const oldOscillators = bgmOscillators;
        bgmOscillators = []; // 新しい群用にクリア

        const now = actx.currentTime;
        oldOscillators.forEach(layer => {
            layer.gain.gain.cancelScheduledValues(now);
            layer.gain.gain.setValueAtTime(layer.gain.gain.value, now);
            layer.gain.gain.linearRampToValueAtTime(0, now + 4.0); // 4秒かけてフェードアウト
            layer.osc.stop(now + 4.1);
            layer.lfo.stop(now + 4.1);
        });

        // 新しいオシレータ群をフェードイン
        playChordLayer(nextChord, 4.0);
    }, 12000);
}

function playChordLayer(freqs, fadeDuration) {
    const t = actx.currentTime;
    freqs.forEach((freq) => {
        // 左右に揺れる2つのオシレーターで厚みを出す
        for (let i = 0; i < 2; i++) {
            const osc = actx.createOscillator();
            const panner = actx.createStereoPanner();
            const lfo = actx.createOscillator();
            const lfoGain = actx.createGain();
            const layerGain = actx.createGain();

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

            // レイヤーごとのフェードイン用Gain
            layerGain.gain.setValueAtTime(0, t);
            layerGain.gain.linearRampToValueAtTime(0.25, t + fadeDuration);

            // 接続
            osc.connect(lfoGain);
            lfoGain.connect(panner);
            panner.connect(layerGain);
            layerGain.connect(masterGain);

            osc.start(t);
            lfo.start(t);

            bgmOscillators.push({ osc, lfo, gain: layerGain });
        }
    });
}

function stopPadBGM() {
    if (bgmIntervalId) {
        clearInterval(bgmIntervalId);
        bgmIntervalId = null;
    }

    if (bgmOscillators.length > 0) {
        const t = actx.currentTime;
        const fadeOutTime = 2.0;

        // 全ての現在アクティブなオシレータをフェードアウト
        bgmOscillators.forEach(layer => {
            layer.gain.gain.cancelScheduledValues(t);
            layer.gain.gain.setValueAtTime(layer.gain.gain.value, t);
            layer.gain.gain.linearRampToValueAtTime(0, t + fadeOutTime);
        });

        // 停止タイマーをセット
        bgmStopTimeout = setTimeout(() => {
            bgmOscillators.forEach(layer => {
                layer.osc.stop();
                layer.lfo.stop();
                layer.gain.disconnect();
            });
            bgmOscillators = [];
            bgmStopTimeout = null;
        }, fadeOutTime * 1000 + 100);
    }
}

// -----------------------------------------------
// 追加SE：ガラス・クリスタル系
// -----------------------------------------------

// 宝石（アメジスト）の衝突音（高く澄んだクリスタル音）
function playGlassHitSE() {
    if (!actx) return;
    const t = actx.currentTime;

    // 2000Hz〜4000Hz帯のサイン波を組み合わせて高く澄んだ音を作る
    const freqs = [2093.00, 2793.83, 3135.96, 4186.01]; // C7, F7, G7, C8 (透明感のある高音成分)
    freqs.forEach((freq, idx) => {
        const osc = actx.createOscillator();
        const gain = actx.createGain();

        // 澄んだ音のため全てsine波にする
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);

        // 高音域の美しい残響（アタックは速く、減衰は滑らかに）
        const vol = 0.3 - (idx * 0.05);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(vol, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4 + (Math.random() * 0.2));

        // パンニングで少しだけ広がりを持たせる
        const panner = actx.createStereoPanner();
        panner.pan.value = (Math.random() - 0.5) * 0.5;

        osc.connect(gain);
        gain.connect(panner);
        panner.connect(masterGain);

        osc.start(t);
        osc.stop(t + 0.8);
    });
}

// 宝石が砕ける音（キラキラしたパシャーン音）
function playGlassBreakSE() {
    if (!actx) return;
    const t = actx.currentTime;

    // 破片が飛び散る高音域のキラキラした音
    const numShards = 25; // 破片の数
    for (let i = 0; i < numShards; i++) {
        const osc = actx.createOscillator();
        const gain = actx.createGain();

        // 澄んだ音をベースに、一部triangleを混ぜてガラス片の角（エッジ）を表現
        osc.type = Math.random() > 0.8 ? 'triangle' : 'sine';

        // 3000Hz〜7000Hzの高音域
        const freq = 3000 + Math.random() * 4000;
        osc.frequency.setValueAtTime(freq, t);

        // 重力で少しだけピッチが落ちる表現（微細な変化）
        osc.frequency.exponentialRampToValueAtTime(freq * 0.95, t + 0.3);

        // 散らばる時間のズレ（最大0.2秒ほど）
        const delay = Math.random() * 0.2;
        // 短い減衰（チリンッ、という音の集まり）
        const duration = 0.1 + Math.random() * 0.3;

        gain.gain.setValueAtTime(0, t + delay);
        gain.gain.linearRampToValueAtTime(0.15, t + delay + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, t + delay + duration);

        // 広大にパンニングしてキラキラ感を広げる
        const panner = actx.createStereoPanner();
        panner.pan.value = (Math.random() - 0.5) * 2.0;

        osc.connect(gain);
        gain.connect(panner);
        panner.connect(masterGain);

        osc.start(t + delay);
        osc.stop(t + delay + duration);
    }
}

// 外部から呼べるようにwindowにエクスポート
window.initAudio = initAudio;
window.startPadBGM = startPadBGM;
window.stopPadBGM = stopPadBGM;
window.playHitSE = playHitSE;
window.playWallSE = playWallSE;
window.playScoreSE = playScoreSE; // 既存のScoreSEをエクスポート
window.playHealSE = playHealSE;   // 新しい癒やしSE
window.playWinSE = playWinSE;
window.playGlassHitSE = playGlassHitSE;
window.playGlassBreakSE = playGlassBreakSE;
