import {
    _decorator,
    BlockInputEvents,
    Button,
    Color,
    Component,
    EventTouch,
    Label,
    Node,
    Sprite,
    SpriteFrame,
    sys,
    tween,
    UITransform,
    Vec3,
} from 'cc';

const { ccclass, property } = _decorator;

const ADAPTER_CHANNEL_PLACEHOLDER = '{{__adv_channels_adapter__}}';

type Block = { row: number; col: number };
type Shape = { blocks: Block[]; width: number; height: number };
type PieceView = {
    node: Node;
    blocks: Node[];
    shape: Shape;
    colorIndex: number;
    home: Vec3;
    dragging: boolean;
};

type RedirectReason = 'win' | 'lose';
type RedirectPayload = {
    url: string;
    channel: string;
    reason: RedirectReason;
    score: number;
    winScore: number;
    os: string;
};

const BOARD_SIZE = 8;

const SHAPES: Block[][] = [
    [{ row: 0, col: 0 }],
    [{ row: 0, col: 0 }, { row: 0, col: 1 }],
    [{ row: 0, col: 0 }, { row: 1, col: 0 }],
    [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }],
    [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }],
    [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }],
    [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 1, col: 1 }],
    [{ row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }],
    [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 1 }],
    [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 0, col: 1 }],
    [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 1, col: 1 }],
    [{ row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }],
    [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }, { row: 2, col: 1 }],
    [{ row: 0, col: 1 }, { row: 1, col: 1 }, { row: 2, col: 0 }, { row: 2, col: 1 }],
    [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 1 }, { row: 1, col: 2 }],
    [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 1, col: 0 }, { row: 1, col: 1 }],
    [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }],
    [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }, { row: 3, col: 0 }],
    [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }],
    [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 0 }, { row: 2, col: 1 }],
    [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 }],
];

@ccclass('BlockBlastGame')
export class BlockBlastGame extends Component {
    @property(SpriteFrame) background: SpriteFrame | null = null;
    @property(SpriteFrame) logo: SpriteFrame | null = null;
    @property(SpriteFrame) boardCell: SpriteFrame | null = null;
    @property(SpriteFrame) buttonPrimary: SpriteFrame | null = null;
    @property(SpriteFrame) buttonSecondary: SpriteFrame | null = null;
    @property(SpriteFrame) comboBurst: SpriteFrame | null = null;
    @property(SpriteFrame) sparkle: SpriteFrame | null = null;
    @property([SpriteFrame]) tileFrames: SpriteFrame[] = [];
    @property({ tooltip: 'Score required to show the win screen.' }) winScore = 1000;
    @property({ tooltip: 'Generic fallback store URL opened by redirect actions.' })
    storeUrl = 'https://play.google.com/store/apps/details?id=com.block.juggle';
    @property({ tooltip: 'Optional Android-specific store URL.' }) androidStoreUrl = '';
    @property({ tooltip: 'Optional iOS-specific store URL.' }) iosStoreUrl = '';
    @property({ tooltip: 'Optional desktop-specific store URL.' }) desktopStoreUrl = '';

    private canvasTransform!: UITransform;
    private backgroundNode!: Node;
    private logoNode!: Node;
    private boardRoot!: Node;
    private trayRoot!: Node;
    private overlayRoot!: Node;
    private scoreLabel!: Label;
    private bestLabel!: Label;
    private comboLabel!: Label;
    private gameOverNode!: Node;
    private gameOverShade!: Node;
    private gameOverTitle!: Node;
    private gameOverRestart!: Node;
    private gameOverSecondary!: Node;
    private winNode!: Node;
    private winShade!: Node;
    private winTitle!: Node;
    private winButton!: Node;
    private boardCells: Node[][] = [];
    private placedTiles: (Node | null)[][] = [];
    private board: number[][] = [];
    private pieces: PieceView[] = [];
    private score = 0;
    private best = 0;
    private combo = 0;
    private hasWon = false;
    private boardPixelSize = 520;
    private cellSize = 60;
    private trayCellSize = 44;
    private lastCanvasWidth = 0;
    private lastCanvasHeight = 0;

    onLoad() {
        this.canvasTransform = this.node.getComponent(UITransform)!;
        this.best = Number(sys.localStorage.getItem('blockblast-best') || 0);
        this.createStaticUi();
        this.newGame();
    }

    update() {
        const size = this.canvasTransform.contentSize;
        if (Math.abs(size.width - this.lastCanvasWidth) > 1 || Math.abs(size.height - this.lastCanvasHeight) > 1) {
            this.layout();
        }
    }

    private createStaticUi() {
        this.backgroundNode = this.createSpriteNode('Background', this.background, this.node);
        //this.logoNode = this.createSpriteNode('Logo', this.logo, this.node);
        this.boardRoot = this.createNode('Board', this.node);
        this.trayRoot = this.createNode('Tray', this.node);
        this.overlayRoot = this.createNode('Overlay', this.node);

        this.scoreLabel = this.createLabel('ScoreLabel', this.node, '0', 44, Color.WHITE);
        this.bestLabel = this.createLabel('BestLabel', this.node, 'BEST 0', 22, new Color(194, 226, 255, 255));
        this.comboLabel = this.createLabel('ComboLabel', this.node, '', 34, new Color(255, 235, 150, 255));

        for (let row = 0; row < BOARD_SIZE; row++) {
            this.boardCells[row] = [];
            this.placedTiles[row] = [];
            for (let col = 0; col < BOARD_SIZE; col++) {
                const cell = this.createSpriteNode(`Cell-${row}-${col}`, this.boardCell, this.boardRoot);
                this.boardCells[row][col] = cell;
                this.placedTiles[row][col] = null;
            }
        }

        this.gameOverNode = this.createGameOver();
        this.gameOverNode.active = false;
        this.winNode = this.createWinScreen();
        this.winNode.active = false;
    }

    private createGameOver(): Node {
        const root = this.createNode('GameOver', this.overlayRoot);
        const shade = this.createNode('Shade', root);
        const shadeSprite = shade.addComponent(Sprite);
        shadeSprite.color = new Color(5, 12, 24, 195);
        shade.addComponent(BlockInputEvents);

        const title = this.createLabel('Title', root, 'GAME OVER', 50, Color.WHITE);
        const restart = this.createButton('RestartButton', root, 'RESTART', this.buttonPrimary, () => this.newGame());
        const keep = this.createButton('KeepButton', root, 'CONTINUE', this.buttonSecondary, () => this.openStore('lose'));

        this.gameOverShade = shade;
        this.gameOverTitle = title.node;
        this.gameOverRestart = restart;
        this.gameOverSecondary = keep;
        return root;
    }

    private createWinScreen(): Node {
        const root = this.createNode('Win', this.overlayRoot);
        const shade = this.createNode('Shade', root);
        const shadeSprite = shade.addComponent(Sprite);
        shadeSprite.color = new Color(5, 18, 28, 210);
        shade.addComponent(BlockInputEvents);

        const title = this.createLabel('Title', root, 'YOU WIN', 54, Color.WHITE);
        const playNow = this.createButton('PlayNowButton', root, 'PLAY NOW', this.buttonPrimary, () => this.openStore('win'));

        this.winShade = shade;
        this.winTitle = title.node;
        this.winButton = playNow;
        return root;
    }

    private newGame() {
        this.score = 0;
        this.combo = 0;
        this.hasWon = false;
        this.board = Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => -1));
        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                this.placedTiles[row][col]?.destroy();
                this.placedTiles[row][col] = null;
            }
        }
        this.clearPieces();
        this.spawnPieces();
        this.gameOverNode.active = false;
        this.winNode.active = false;
        this.updateLabels();
        this.layout();
    }

    private spawnPieces() {
        for (let i = 0; i < 3; i++) {
            this.pieces.push(this.createPiece(i));
        }
        this.layout();
        this.checkGameOver();
    }

    private createPiece(slot: number): PieceView {
        const shape = this.normalizeShape(SHAPES[Math.floor(Math.random() * SHAPES.length)]);
        const colorIndex = Math.floor(Math.random() * Math.max(1, this.tileFrames.length));
        const node = this.createNode(`Piece-${slot}`, this.trayRoot);
        const piece: PieceView = { node, blocks: [], shape, colorIndex, home: new Vec3(), dragging: false };

        for (const block of shape.blocks) {
            const tile = this.createSpriteNode('PieceTile', this.tileFrames[colorIndex], node);
            piece.blocks.push(tile);
        }

        node.on(Node.EventType.TOUCH_START, (event: EventTouch) => this.onPieceTouchStart(piece, event), this);
        node.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => this.onPieceTouchMove(piece, event), this);
        node.on(Node.EventType.TOUCH_END, (event: EventTouch) => this.onPieceTouchEnd(piece, event), this);
        node.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => this.onPieceTouchEnd(piece, event), this);
        return piece;
    }

    private onPieceTouchStart(piece: PieceView, event: EventTouch) {
        if (!piece.node.parent) return;
        piece.dragging = true;
        piece.node.setSiblingIndex(999);
        piece.node.setScale(1.08, 1.08, 1);
        this.movePieceToTouch(piece, event, this.cellSize * 1.4);
    }

    private onPieceTouchMove(piece: PieceView, event: EventTouch) {
        if (!piece.dragging) return;
        this.movePieceToTouch(piece, event, this.cellSize * 1.4);
    }

    private onPieceTouchEnd(piece: PieceView, event: EventTouch) {
        if (!piece.dragging) return;
        piece.dragging = false;
        this.movePieceToTouch(piece, event, this.cellSize * 1.4);
        const placement = this.getPlacement(piece, piece.node.position);
        if (placement && this.canPlaceCells(placement)) {
            this.placePiece(piece, placement);
            return;
        }
        piece.node.setParent(this.trayRoot, false);
        tween(piece.node).to(0.15, { position: piece.home, scale: new Vec3(1, 1, 1) }).start();
    }

    private movePieceToTouch(piece: PieceView, event: EventTouch, yOffset: number) {
        const loc = event.getUILocation();
        const local = this.canvasTransform.convertToNodeSpaceAR(new Vec3(loc.x, loc.y, 0));
        if (piece.node.parent !== this.node) {
            piece.node.setParent(this.node, false);
        }
        piece.node.setPosition(local.x, local.y + yOffset, 0);
    }

    private getPlacement(piece: PieceView, pieceCanvasPos: Readonly<Vec3>): Block[] | null {
        const boardPos = this.boardRoot.position;
        const cells: Block[] = [];
        for (const block of piece.shape.blocks) {
            const localX = pieceCanvasPos.x + (block.col - (piece.shape.width - 1) * 0.5) * this.cellSize - boardPos.x;
            const localY = pieceCanvasPos.y + ((piece.shape.height - 1) * 0.5 - block.row) * this.cellSize - boardPos.y;
            const col = Math.floor((localX + this.boardPixelSize * 0.5) / this.cellSize);
            const row = Math.floor((this.boardPixelSize * 0.5 - localY) / this.cellSize);
            cells.push({ row, col });
        }
        return cells;
    }

    private canPlaceCells(cells: Block[]): boolean {
        return cells.every(({ row, col }) => row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE && this.board[row][col] < 0);
    }

    private placePiece(piece: PieceView, cells: Block[]) {
        for (let i = 0; i < cells.length; i++) {
            const { row, col } = cells[i];
            this.board[row][col] = piece.colorIndex;
            const tile = this.createSpriteNode(`Placed-${row}-${col}`, this.tileFrames[piece.colorIndex], this.boardRoot);
            this.sizeNode(tile, this.cellSize * 0.92, this.cellSize * 0.92);
            tile.setPosition(this.cellPosition(row, col));
            this.placedTiles[row][col] = tile;
            tile.setScale(0.15, 0.15, 1);
            tween(tile).to(0.12, { scale: Vec3.ONE }, { easing: 'backOut' }).start();
        }
        this.score += cells.length;
        this.removePiece(piece);
        piece.node.destroy();
        const cleared = this.clearFullLines();
        this.combo = cleared > 0 ? this.combo + 1 : 0;
        if (cleared > 0) {
            this.score += cleared * cleared * 10 + this.combo * 5;
            this.showCombo(cleared);
        }
        if (this.pieces.length === 0) {
            this.spawnPieces();
        }
        this.updateLabels();
        this.checkWin();
        this.checkGameOver();
    }

    private clearFullLines(): number {
        const rows: number[] = [];
        const cols: number[] = [];
        for (let row = 0; row < BOARD_SIZE; row++) {
            if (this.board[row].every((value) => value >= 0)) rows.push(row);
        }
        for (let col = 0; col < BOARD_SIZE; col++) {
            let full = true;
            for (let row = 0; row < BOARD_SIZE; row++) {
                if (this.board[row][col] < 0) {
                    full = false;
                    break;
                }
            }
            if (full) cols.push(col);
        }
        const clearing = new Set<string>();
        rows.forEach((row) => {
            for (let col = 0; col < BOARD_SIZE; col++) clearing.add(`${row},${col}`);
        });
        cols.forEach((col) => {
            for (let row = 0; row < BOARD_SIZE; row++) clearing.add(`${row},${col}`);
        });
        clearing.forEach((key) => {
            const [row, col] = key.split(',').map(Number);
            this.board[row][col] = -1;
            const tile = this.placedTiles[row][col];
            this.placedTiles[row][col] = null;
            if (tile) {
                this.flashAt(tile.position);
                tween(tile).to(0.16, { scale: new Vec3(0.05, 0.05, 1) }).call(() => tile.destroy()).start();
            }
        });
        return rows.length + cols.length;
    }

    private checkGameOver() {
        if (this.hasWon) return;
        if (this.pieces.length === 0) return;
        const hasMove = this.pieces.some((piece) => this.canPlaceShapeAnywhere(piece.shape));
        this.gameOverNode.active = !hasMove;
    }

    private checkWin() {
        if (this.hasWon || this.winScore <= 0 || this.score < this.winScore) return;
        this.hasWon = true;
        this.gameOverNode.active = false;
        this.winNode.active = true;
    }

    private canPlaceShapeAnywhere(shape: Shape): boolean {
        for (let row = 0; row <= BOARD_SIZE - shape.height; row++) {
            for (let col = 0; col <= BOARD_SIZE - shape.width; col++) {
                const cells = shape.blocks.map((block) => ({ row: row + block.row, col: col + block.col }));
                if (this.canPlaceCells(cells)) return true;
            }
        }
        return false;
    }

    private layout() {
        const size = this.canvasTransform.contentSize;
        const width = size.width;
        const height = size.height;
        this.lastCanvasWidth = width;
        this.lastCanvasHeight = height;
        const landscape = width > height * 1.25;
        this.boardPixelSize = Math.floor(Math.min(width * (landscape ? 0.5 : 0.88), height * (landscape ? 0.78 : 0.52), 620));
        this.cellSize = this.boardPixelSize / BOARD_SIZE;
        this.trayCellSize = Math.min(this.cellSize * 0.76, landscape ? height * 0.09 : width * 0.105);

        this.sizeNode(this.backgroundNode, width, height);
        this.backgroundNode.setPosition(0, 0);
        this.sizeNode(this.overlayRoot, width, height);
        this.overlayRoot.setPosition(0, 0);

        const boardX = landscape ? -width * 0.2 : 0;
        const boardY = landscape ? -height * 0.02 : Math.min(height * 0.08, height * 0.5 - this.boardPixelSize * 0.5 - 120);
        this.boardRoot.setPosition(boardX, boardY);
        this.sizeNode(this.boardRoot, this.boardPixelSize, this.boardPixelSize);

        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                this.sizeNode(this.boardCells[row][col], this.cellSize * 0.94, this.cellSize * 0.94);
                this.boardCells[row][col].setPosition(this.cellPosition(row, col));
                const tile = this.placedTiles[row][col];
                if (tile) {
                    this.sizeNode(tile, this.cellSize * 0.92, this.cellSize * 0.92);
                    tile.setPosition(this.cellPosition(row, col));
                }
            }
        }

        const logoWidth = Math.min(width * (landscape ? 0.32 : 0.45), 280);
        const logoHeight = logoWidth * 0.34;
        const headerX = landscape ? width * 0.27 : 0;
        const logoY = height * 0.5 - logoHeight * 0.5 - 16;
        //this.sizeNode(this.logoNode, logoWidth, logoHeight);
        //this.logoNode.setPosition(headerX, logoY);

        const scoreTop = logoY - logoHeight * 0.5 - (landscape ? 22 : 18);
        this.scoreLabel.node.setPosition(headerX, scoreTop - 26);
        this.bestLabel.node.setPosition(headerX, this.scoreLabel.node.position.y - 38);
        if (landscape) {
            this.comboLabel.node.setPosition(headerX, this.bestLabel.node.position.y - 44);
        } else {
            this.comboLabel.node.setPosition(boardX, boardY + this.boardPixelSize * 0.5 + 52);
        }

        this.layoutPieces(landscape, width, height);
        this.layoutEndScreens(width, height);
    }

    private layoutPieces(landscape: boolean, width: number, height: number) {
        if (landscape) {
            this.trayRoot.setPosition(width * 0.28, -height * 0.08);
            const gap = height * 0.26;
            this.pieces.forEach((piece, index) => {
                piece.home.set(0, gap * (1 - index), 0);
                if (!piece.dragging) piece.node.setPosition(piece.home);
                this.layoutPieceBlocks(piece, this.trayCellSize);
            });
            return;
        }

        this.trayRoot.setPosition(0, -height * 0.5 + Math.max(96, height * 0.15));
        const gap = width * 0.31;
        this.pieces.forEach((piece, index) => {
            piece.home.set(gap * (index - 1), 0, 0);
            if (!piece.dragging) piece.node.setPosition(piece.home);
            this.layoutPieceBlocks(piece, this.trayCellSize);
        });
    }

    private layoutPieceBlocks(piece: PieceView, tileSize: number) {
        this.sizeNode(piece.node, tileSize * Math.max(3, piece.shape.width), tileSize * Math.max(3, piece.shape.height));
        piece.shape.blocks.forEach((block, index) => {
            const tile = piece.blocks[index];
            this.sizeNode(tile, tileSize * 0.95, tileSize * 0.95);
            tile.setPosition(
                (block.col - (piece.shape.width - 1) * 0.5) * tileSize,
                ((piece.shape.height - 1) * 0.5 - block.row) * tileSize,
                0,
            );
        });
    }

    private layoutEndScreens(width: number, height: number) {
        this.sizeNode(this.gameOverShade, width, height);
        this.gameOverTitle.setPosition(0, 70);
        this.gameOverRestart.setPosition(0, -10);
        this.gameOverSecondary.setPosition(0, -88);
        this.sizeNode(this.gameOverRestart, Math.min(260, width * 0.7), 62);
        this.sizeNode(this.gameOverSecondary, Math.min(230, width * 0.62), 54);

        this.sizeNode(this.winShade, width, height);
        this.winTitle.setPosition(0, 48);
        this.winButton.setPosition(0, -42);
        this.sizeNode(this.winButton, Math.min(280, width * 0.74), 66);
    }

    private cellPosition(row: number, col: number): Vec3 {
        return new Vec3(
            -this.boardPixelSize * 0.5 + this.cellSize * (col + 0.5),
            this.boardPixelSize * 0.5 - this.cellSize * (row + 0.5),
            0,
        );
    }

    private normalizeShape(blocks: Block[]): Shape {
        const minRow = Math.min(...blocks.map((block) => block.row));
        const minCol = Math.min(...blocks.map((block) => block.col));
        const normalized = blocks.map((block) => ({ row: block.row - minRow, col: block.col - minCol }));
        return {
            blocks: normalized,
            width: Math.max(...normalized.map((block) => block.col)) + 1,
            height: Math.max(...normalized.map((block) => block.row)) + 1,
        };
    }

    private updateLabels() {
        this.best = Math.max(this.best, this.score);
        sys.localStorage.setItem('blockblast-best', String(this.best));
        this.scoreLabel.string = String(this.score);
        this.bestLabel.string = `BEST ${this.best}`;
    }

    private openStore(reason: RedirectReason) {
        const url = this.resolveStoreUrl();
        if (!url) return;

        const payload: RedirectPayload = {
            url,
            channel: this.resolvePlayableChannel(),
            reason,
            score: this.score,
            winScore: this.winScore,
            os: this.resolveRuntimeOs(),
        };

        const bridge = (globalThis as any).__playableAdsBridge__;
        if (bridge && typeof bridge.openStore === 'function') {
            try {
                if (bridge.openStore(payload) !== false) {
                    return;
                }
            } catch (error) {
                console.warn('Playable ads bridge openStore failed.', error);
            }
        }

        if (this.tryRuntimePlayableOpen(payload)) {
            return;
        }

        sys.openURL(url);
    }

    private resolveStoreUrl(): string {
        const os = this.resolveRuntimeOs();
        if (os === 'ios' && this.iosStoreUrl) return this.iosStoreUrl;
        if (os === 'android' && this.androidStoreUrl) return this.androidStoreUrl;
        if (os === 'desktop' && this.desktopStoreUrl) return this.desktopStoreUrl;
        return this.storeUrl || this.androidStoreUrl || this.iosStoreUrl || this.desktopStoreUrl;
    }

    private resolvePlayableChannel(): string {
        const runtimeChannel = String((globalThis as any).advChannels || '').trim();
        if (runtimeChannel && !runtimeChannel.includes('__adv_channels_adapter__')) {
            return runtimeChannel;
        }

        if (ADAPTER_CHANNEL_PLACEHOLDER && !ADAPTER_CHANNEL_PLACEHOLDER.includes('__adv_channels_adapter__')) {
            return ADAPTER_CHANNEL_PLACEHOLDER;
        }

        return 'Unknown';
    }

    private resolveRuntimeOs(): string {
        const userAgent = String((globalThis as any).navigator?.userAgent || '').toLowerCase();
        if (userAgent.includes('android') || sys.os === sys.OS.ANDROID) return 'android';
        if (/(iphone|ipad|ipod)/i.test(userAgent) || sys.os === sys.OS.IOS) return 'ios';
        return 'desktop';
    }

    private tryRuntimePlayableOpen(payload: RedirectPayload): boolean {
        const runtime = globalThis as any;

        try {
            if (payload.channel === 'Google' && typeof runtime.googlePlayableClick === 'function') {
                runtime.googlePlayableClick();
                return true;
            }
        } catch (error) {
            console.warn('Google playable exit failed.', error);
        }

        try {
            if (runtime.ExitApi && typeof runtime.ExitApi.exit === 'function') {
                runtime.ExitApi.exit();
                return true;
            }
        } catch (error) {
            console.warn('ExitApi redirect failed.', error);
        }

        try {
            if (runtime.FbPlayableAd && typeof runtime.FbPlayableAd.onCTAClick === 'function') {
                runtime.FbPlayableAd.onCTAClick();
                return true;
            }
        } catch (error) {
            console.warn('FbPlayableAd redirect failed.', error);
        }

        try {
            if (runtime.dapi && typeof runtime.dapi.openStoreUrl === 'function') {
                runtime.dapi.openStoreUrl(payload.url);
                return true;
            }
        } catch (error) {
            console.warn('DAPI redirect failed.', error);
        }

        try {
            if (runtime.mraid && typeof runtime.mraid.open === 'function') {
                runtime.mraid.open(payload.url);
                return true;
            }
        } catch (error) {
            console.warn('MRAID redirect failed.', error);
        }

        try {
            if (runtime.playableSDK && typeof runtime.playableSDK.openAppStore === 'function') {
                runtime.playableSDK.openAppStore();
                return true;
            }
        } catch (error) {
            console.warn('playableSDK openAppStore failed.', error);
        }

        try {
            if (runtime.playableSDK && typeof runtime.playableSDK.openStore === 'function') {
                runtime.playableSDK.openStore(payload.url);
                return true;
            }
        } catch (error) {
            console.warn('playableSDK openStore failed.', error);
        }

        return false;
    }

    private showCombo(lines: number) {
        this.comboLabel.string = lines > 1 ? `${lines} LINES` : 'CLEAR';
        this.comboLabel.node.active = true;
        tween(this.comboLabel.node)
            .set({ scale: new Vec3(0.2, 0.2, 1) })
            .to(0.16, { scale: new Vec3(1.1, 1.1, 1) }, { easing: 'backOut' })
            .delay(0.55)
            .to(0.12, { scale: new Vec3(0.1, 0.1, 1) })
            .call(() => {
                this.comboLabel.string = '';
            })
            .start();
    }

    private flashAt(position: Readonly<Vec3>) {
        const frame = Math.random() > 0.5 ? this.comboBurst : this.sparkle;
        if (!frame) return;
        const fx = this.createSpriteNode('ClearFx', frame, this.boardRoot);
        fx.setPosition(position.x, position.y, 2);
        this.sizeNode(fx, this.cellSize * 1.5, this.cellSize * 1.5);
        tween(fx)
            .set({ scale: new Vec3(0.25, 0.25, 1) })
            .to(0.22, { scale: new Vec3(1.15, 1.15, 1) })
            .call(() => fx.destroy())
            .start();
    }

    private removePiece(piece: PieceView) {
        this.pieces = this.pieces.filter((candidate) => candidate !== piece);
        for (const other of this.pieces) {
            if (other.node.parent !== this.trayRoot) {
                other.node.setParent(this.trayRoot, true);
            }
        }
        this.layout();
    }

    private clearPieces() {
        for (const piece of this.pieces) {
            piece.node.destroy();
        }
        this.pieces.length = 0;
    }

    private createButton(name: string, parent: Node, text: string, frame: SpriteFrame | null, callback: () => void): Node {
        const node = this.createSpriteNode(name, frame, parent);
        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.94;
        node.on(Button.EventType.CLICK, callback, this);
        this.createLabel('Label', node, text, 24, Color.WHITE);
        return node;
    }

    private createLabel(name: string, parent: Node, text: string, size: number, color: Color): Label {
        const node = this.createNode(name, parent);
        const transform = node.addComponent(UITransform);
        transform.setContentSize(420, size + 12);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = size;
        label.lineHeight = size + 8;
        label.color = color;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        return label;
    }

    private createSpriteNode(name: string, frame: SpriteFrame | null, parent: Node): Node {
        const node = this.createNode(name, parent);
        const transform = node.addComponent(UITransform);
        transform.setContentSize(64, 64);
        const sprite = node.addComponent(Sprite);
        sprite.spriteFrame = frame;
        sprite.type = Sprite.Type.SIMPLE;
        return node;
    }

    private createNode(name: string, parent: Node): Node {
        const node = new Node(name);
        parent.addChild(node);
        return node;
    }

    private sizeNode(node: Node, width: number, height: number) {
        const transform = node.getComponent(UITransform) || node.addComponent(UITransform);
        transform.setContentSize(width, height);
    }
}
