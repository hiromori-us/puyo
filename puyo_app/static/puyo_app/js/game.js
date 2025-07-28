// ゲーム定数
const BOARD_WIDTH = 6;
const BOARD_HEIGHT = 12;
const CELL_SIZE = 32;
const COLORS = ['red', 'blue', 'green', 'yellow'];
const CHAIN_NAMES = [
    '', '起業', 'プレシード', 'シード', 'シリーズA', 
    'シリーズB', 'シリーズC', 'シリーズD', 'IPO'
];

// グローバル変数
let game;
let fieldCanvas, fieldCtx;
let nextCanvas, nextCtx;
let isPaused = false;

// ゲーム初期化
document.addEventListener('DOMContentLoaded', function() {
    fieldCanvas = document.getElementById('fieldCanvas');
    fieldCtx = fieldCanvas.getContext('2d');
    nextCanvas = document.getElementById('nextCanvas');
    nextCtx = nextCanvas.getContext('2d');
    
    game = new Game();
    game.start();
    
    // キーボードイベント
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
});

// ゲームクラス
class Game {
    constructor() {
        this.board = new Board();
        this.nextQueue = new NextQueue();
        this.currentPiece = null;
        this.gameState = 'playing'; // playing, paused, gameOver, cleared
        this.frameCount = 0;
        this.dropInterval = this.getDropInterval();
        this.lockDelay = 0;
        this.maxLockDelay = 20; // 約0.33秒 (60fps)
        this.isLocking = false;
        this.keys = {
            left: false,
            right: false,
            down: false,
            up: false
        };
        this.chainCount = 0;
        this.isChainProcessing = false;
    }
    
    getDropInterval() {
        switch(gameSettings.speed) {
            case 'low': return 50;    // 約0.83秒
            case 'medium': return 30; // 約0.5秒
            case 'high': return 18;   // 約0.3秒
            default: return 30;
        }
    }
    
    start() {
        this.spawnNewPiece();
        this.gameLoop();
        
        // BGM開始
        if (gameSettings.bgmEnabled) {
            const bgmAudio = document.getElementById('bgmAudio');
            if (bgmAudio) {
                bgmAudio.play().catch(e => console.log('BGM再生に失敗:', e));
            }
        }
    }
    
    gameLoop() {
        if (this.gameState === 'playing' && !isPaused) {
            this.update();
            this.draw();
        }
        requestAnimationFrame(() => this.gameLoop());
    }
    
    update() {
        if (this.isChainProcessing) {
            return; // 連鎖処理中は更新しない
        }
        
        this.frameCount++;
        
        // 入力処理
        this.handleInput();
        
        // 自然落下
        let shouldDrop = this.frameCount >= this.dropInterval;
        if (this.keys.down) {
            shouldDrop = this.frameCount % 3 === 0; // 高速落下
        }
        
        if (shouldDrop) {
            this.frameCount = 0;
            this.dropPiece();
        }
        
        // ロック遅延処理
        if (this.isLocking) {
            this.lockDelay++;
            if (this.lockDelay >= this.maxLockDelay) {
                this.lockPiece();
            }
        }
    }
    
    handleInput() {
        if (this.keys.left && this.canMovePiece(-1, 0)) {
            this.currentPiece.x -= 1;
            this.keys.left = false; // 一回だけ移動
            this.resetLockDelay();
        }
        
        if (this.keys.right && this.canMovePiece(1, 0)) {
            this.currentPiece.x += 1;
            this.keys.right = false; // 一回だけ移動
            this.resetLockDelay();
        }
        
        if (this.keys.up) {
            this.rotatePiece();
            this.keys.up = false; // 一回だけ回転
        }
    }
    
    dropPiece() {
        if (this.canMovePiece(0, 1)) {
            this.currentPiece.y += 1;
            this.isLocking = false;
            this.lockDelay = 0;
        } else {
            if (!this.isLocking) {
                this.isLocking = true;
                this.lockDelay = 0;
            }
        }
    }
    
    resetLockDelay() {
        if (this.isLocking && this.canMovePiece(0, 1)) {
            this.isLocking = false;
            this.lockDelay = 0;
        }
    }
    
    canMovePiece(dx, dy) {
        return this.board.canPlacePiece(this.currentPiece, dx, dy);
    }
    
    rotatePiece() {
        const rotatedPiece = this.currentPiece.getRotated();
        
        // 通常の回転チェック
        if (this.board.canPlacePiece(rotatedPiece, 0, 0)) {
            this.currentPiece.rotation = rotatedPiece.rotation;
            this.resetLockDelay();
            return;
        }
        
        // 壁蹴り処理
        const kicks = this.getWallKicks(this.currentPiece.rotation, rotatedPiece.rotation);
        for (let kick of kicks) {
            if (this.board.canPlacePiece(rotatedPiece, kick.x, kick.y)) {
                this.currentPiece.x += kick.x;
                this.currentPiece.y += kick.y;
                this.currentPiece.rotation = rotatedPiece.rotation;
                this.resetLockDelay();
                return;
            }
        }
    }
    
    getWallKicks(fromRotation, toRotation) {
        // 簡易的な壁蹴り実装
        return [
            {x: -1, y: 0}, {x: 1, y: 0}, {x: 0, y: -1}
        ];
    }
    
    lockPiece() {
        this.board.placePiece(this.currentPiece);
        this.isLocking = false;
        this.lockDelay = 0;
        
        // 連鎖チェック
        this.processChains();
    }
    
    async processChains() {
        this.isChainProcessing = true;
        this.chainCount = 0;
        
        while (true) {
            const chains = this.board.findChains();
            if (chains.length === 0) break;
            
            this.chainCount++;
            this.board.clearChains(chains);
            
            // 連鎖名表示
            this.displayChainName(this.chainCount);
            
            // 効果音再生
            if (gameSettings.soundEnabled) {
                this.playChainSound();
            }
            
            // 8連鎖以上でクリア
            if (this.chainCount >= 8) {
                await this.delay(1000);
                this.endGame(true);
                return;
            }
            
            // 重力適用
            this.board.applyGravity();
            
            // 少し待つ
            await this.delay(800);
        }
        
        this.isChainProcessing = false;
        
        // 新しいピース生成
        if (!this.spawnNewPiece()) {
            this.endGame(false);
        }
    }
    
    displayChainName(chainNum) {
        const chainText = document.getElementById('chainText');
        const name = chainNum < CHAIN_NAMES.length ? CHAIN_NAMES[chainNum] : 'IPO';
        
        chainText.textContent = name;
        chainText.className = 'chain-display show';
        
        setTimeout(() => {
            chainText.className = 'chain-display fade';
        }, 1000);
    }
    
    playChainSound() {
        const audio = document.getElementById('chainVoice');
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(e => console.log('効果音再生に失敗:', e));
        }
    }
    
    spawnNewPiece() {
        this.currentPiece = this.nextQueue.getNext();
        
        // 出現位置チェック
        if (!this.board.canPlacePiece(this.currentPiece, 0, 0)) {
            return false; // ゲームオーバー
        }
        
        return true;
    }
    
    endGame(isCleared) {
        this.gameState = isCleared ? 'cleared' : 'gameOver';
        
        const modal = document.getElementById('gameOverModal');
        const title = document.getElementById('gameOverTitle');
        const message = document.getElementById('gameOverMessage');
        
        if (isCleared) {
            title.textContent = 'IPO達成！';
            message.textContent = 'おめでとうございます！';
        } else {
            title.textContent = 'GAME OVER';
            message.textContent = 'もう一度挑戦してみましょう！';
        }
        
        modal.style.display = 'block';
        
        // BGM停止
        const bgmAudio = document.getElementById('bgmAudio');
        if (bgmAudio) {
            bgmAudio.pause();
        }
    }
    
    draw() {
        // フィールドクリア
        fieldCtx.fillStyle = '#f8f8f8';
        fieldCtx.fillRect(0, 0, fieldCanvas.width, fieldCanvas.height);
        
        // ボード描画
        this.board.draw(fieldCtx);
        
        // 現在のピース描画
        if (this.currentPiece) {
            this.currentPiece.draw(fieldCtx);
        }
        
        // Next描画
        this.nextQueue.draw(nextCtx);
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ボードクラス
class Board {
    constructor() {
        this.grid = Array(BOARD_HEIGHT).fill(null).map(() => Array(BOARD_WIDTH).fill(null));
    }
    
    canPlacePiece(piece, dx = 0, dy = 0) {
        const positions = piece.getPositions();
        
        for (let pos of positions) {
            const x = pos.x + dx;
            const y = pos.y + dy;
            
            // 境界チェック
            if (x < 0 || x >= BOARD_WIDTH || y >= BOARD_HEIGHT) {
                return false;
            }
            
            // 上端は許可
            if (y < 0) continue;
            
            // 既存のぷよとの衝突チェック
            if (this.grid[y][x] !== null) {
                return false;
            }
        }
        
        return true;
    }
    
    placePiece(piece) {
        const positions = piece.getPositions();
        
        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];
            if (pos.y >= 0) {
                this.grid[pos.y][pos.x] = piece.colors[i];
            }
        }
    }
    
    findChains() {
        const visited = Array(BOARD_HEIGHT).fill(null).map(() => Array(BOARD_WIDTH).fill(false));
        const chains = [];
        
        for (let y = 0; y < BOARD_HEIGHT; y++) {
            for (let x = 0; x < BOARD_WIDTH; x++) {
                if (!visited[y][x] && this.grid[y][x] !== null) {
                    const chain = this.findConnectedPuyos(x, y, this.grid[y][x], visited);
                    if (chain.length >= 4) {
                        chains.push(chain);
                    }
                }
            }
        }
        
        return chains;
    }
    
    findConnectedPuyos(startX, startY, color, visited) {
        const stack = [{x: startX, y: startY}];
        const connected = [];
        
        while (stack.length > 0) {
            const {x, y} = stack.pop();
            
            if (x < 0 || x >= BOARD_WIDTH || y < 0 || y >= BOARD_HEIGHT) continue;
            if (visited[y][x] || this.grid[y][x] !== color) continue;
            
            visited[y][x] = true;
            connected.push({x, y});
            
            // 4方向チェック
            stack.push({x: x + 1, y}, {x: x - 1, y}, {x, y: y + 1}, {x, y: y - 1});
        }
        
        return connected;
    }
    
    clearChains(chains) {
        for (let chain of chains) {
            for (let pos of chain) {
                this.grid[pos.y][pos.x] = null;
            }
        }
    }
    
    applyGravity() {
        for (let x = 0; x < BOARD_WIDTH; x++) {
            let writePos = BOARD_HEIGHT - 1;
            
            for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
                if (this.grid[y][x] !== null) {
                    if (writePos !== y) {
                        this.grid[writePos][x] = this.grid[y][x];
                        this.grid[y][x] = null;
                    }
                    writePos--;
                }
            }
        }
    }
    
    draw(ctx) {
        for (let y = 0; y < BOARD_HEIGHT; y++) {
            for (let x = 0; x < BOARD_WIDTH; x++) {
                if (this.grid[y][x] !== null) {
                    this.drawPuyo(ctx, x, y, this.grid[y][x]);
                }
            }
        }
        
        // グリッド線描画
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        for (let x = 0; x <= BOARD_WIDTH; x++) {
            ctx.beginPath();
            ctx.moveTo(x * CELL_SIZE, 0);
            ctx.lineTo(x * CELL_SIZE, BOARD_HEIGHT * CELL_SIZE);
            ctx.stroke();
        }
        for (let y = 0; y <= BOARD_HEIGHT; y++) {
            ctx.beginPath();
            ctx.moveTo(0, y * CELL_SIZE);
            ctx.lineTo(BOARD_WIDTH * CELL_SIZE, y * CELL_SIZE);
            ctx.stroke();
        }
    }
    
    drawPuyo(ctx, x, y, color) {
        const centerX = x * CELL_SIZE + CELL_SIZE / 2;
        const centerY = y * CELL_SIZE + CELL_SIZE / 2;
        const radius = CELL_SIZE / 2 - 2;
        
        // ぷよ本体
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // 輪郭
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // ハイライト
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.arc(centerX - 4, centerY - 4, radius / 3, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ピースクラス
class Piece {
    constructor(color1, color2) {
        this.colors = [color1, color2];
        this.x = 2; // 軸ぷよの位置
        this.y = -1;
        this.rotation = 0; // 0: 上, 1: 右, 2: 下, 3: 左
    }
    
    getPositions() {
        const positions = [{x: this.x, y: this.y}]; // 軸ぷよ
        
        // 可動ぷよの相対位置
        const offsets = [
            {x: 0, y: -1}, // 上
            {x: 1, y: 0},  // 右
            {x: 0, y: 1},  // 下
            {x: -1, y: 0}  // 左
        ];
        
        const offset = offsets[this.rotation];
        positions.push({x: this.x + offset.x, y: this.y + offset.y});
        
        return positions;
    }
    
    getRotated() {
        const rotated = new Piece(this.colors[0], this.colors[1]);
        rotated.x = this.x;
        rotated.y = this.y;
        rotated.rotation = (this.rotation + 1) % 4;
        return rotated;
    }
    
    draw(ctx) {
        const positions = this.getPositions();
        
        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];
            if (pos.y >= 0) {
                game.board.drawPuyo(ctx, pos.x, pos.y, this.colors[i]);
            }
        }
    }
}

// Nextキュークラス
class NextQueue {
    constructor() {
        this.queue = [];
        this.fillQueue();
    }
    
    fillQueue() {
        while (this.queue.length < 2) {
            const color1 = COLORS[Math.floor(Math.random() * COLORS.length)];
            const color2 = COLORS[Math.floor(Math.random() * COLORS.length)];
            this.queue.push(new Piece(color1, color2));
        }
    }
    
    getNext() {
        const piece = this.queue.shift();
        this.fillQueue();
        return piece;
    }
    
    draw(ctx) {
        ctx.fillStyle = '#f8f8f8';
        ctx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
        
        // 次の2つのピースを表示
        for (let i = 0; i < 2; i++) {
            const piece = this.queue[i];
            const offsetY = i * 60;
            
            // 軸ぷよ
            this.drawMiniPuyo(ctx, 32, 20 + offsetY, piece.colors[0]);
            // 可動ぷよ
            this.drawMiniPuyo(ctx, 32, 20 + offsetY - 24, piece.colors[1]);
        }
    }
    
    drawMiniPuyo(ctx, x, y, color) {
        const radius = 10;
        
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

// キー入力処理
function handleKeyDown(event) {
    if (game.gameState !== 'playing' || isPaused) return;
    
    switch(event.code) {
        case 'ArrowLeft':
            game.keys.left = true;
            event.preventDefault();
            break;
        case 'ArrowRight':
            game.keys.right = true;
            event.preventDefault();
            break;
        case 'ArrowDown':
            game.keys.down = true;
            event.preventDefault();
            break;
        case 'ArrowUp':
            game.keys.up = true;
            event.preventDefault();
            break;
        case 'Escape':
            togglePause();
            event.preventDefault();
            break;
    }
}

function handleKeyUp(event) {
    switch(event.code) {
        case 'ArrowDown':
            game.keys.down = false;
            break;
    }
}

// ユーティリティ関数
function togglePause() {
    isPaused = !isPaused;
    const modal = document.getElementById('pauseModal');
    modal.style.display = isPaused ? 'block' : 'none';
}

function resumeGame() {
    isPaused = false;
    document.getElementById('pauseModal').style.display = 'none';
}

function restartGame() {
    location.reload();
}

function goToStart() {
    window.location.href = '/';
}