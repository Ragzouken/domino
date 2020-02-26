const cube_directions = [
    [+1, -1, 0], [+1, 0, -1], [0, +1, -1], 
    [-1, +1, 0], [-1, 0, +1], [0, -1, +1], 
];

const colors = ['red', 'green', 'blue'];

class CardView {
    constructor(cell, card) {
        this.cell = cell;
        this.card = card;

        this.root = document.createElement('div');
        this.root.classList.add('card', colors[0]);
        this.root.draggable = true;

        this.refresh();
    }

    setPosition(x, y) {
        this.root.style.transform = `translate(calc(${x}px - 50%), calc(${y}px - 50%))`;
    }

    refresh() {
        this.root.innerHTML = this.card.text;
    }
}

async function loaded() {
    const main = document.getElementsByTagName('main')[0];
    const json = document.getElementById('data').innerText;
    const data = JSON.parse(json);

    const testCard = document.createElement('div');
    testCard.classList.add('card');
    main.appendChild(testCard);

    const grid = new HexGrid([testCard.clientWidth, testCard.clientHeight], [32, 32]);
    const cellToView = new CoordStore();

    main.removeChild(testCard);

    function setPan(x, y) {
        main.style.transform = `translate(${x}px, ${y}px)`;
    }

    function moveViewToCell(view, cell) {
        view.cell = cell;
        console.assert(!cellToView.has(cell));
        cellToView.set(cell, view);

        const [x, y] = grid.cellToPixel(cell);
        view.setPosition(x, y);
    }

    const sidebar = document.querySelector('#sidebar');
    const delCard = document.querySelector('#del-card');
    
    sidebar.addEventListener('dragover', event => {
        event.preventDefault();
        event.stopPropagation();

        event.dataTransfer.dropEffect = 'none';
    });

    sidebar.addEventListener('drop', event => {
        event.preventDefault();
        event.stopPropagation();
    });

    delCard.addEventListener('dragover', event => {
        event.preventDefault();
        event.stopPropagation();

        event.dataTransfer.dropEffect = 'move';
    });

    delCard.addEventListener('drop', event => {
        event.preventDefault();
        event.stopPropagation();

        if (event.dataTransfer.types.includes('card/move')) {
            const originJson = event.dataTransfer.getData('card-origin-cell');
            const view = cellToView.get(JSON.parse(originJson));
            removeCardView(view);
        }
    });

    const addCard = document.querySelector('#add-card');
    const contentInput = document.querySelector('#content-input');
    let selectedCard = undefined;

    contentInput.addEventListener('input', () => {
        if (!selectedCard) return;

        selectedCard.text = contentInput.value;
        updateAllViewContent();
    });

    function selectCard(card) {
        selectedCard = card;
        contentInput.value = card.text;
    }

    function updateAllViewContent() {
        cellToView.forEach((view, cell) => {
            view.refresh();
        });
    }

    addCard.addEventListener('dragstart', event => {
        event.dataTransfer.setData('card/new', '');
    });

    function centerCell(coords) {
        const [cx, cy] = [document.documentElement.clientWidth / 2, document.documentElement.clientHeight / 2];
        const [nx, ny] = grid.cellToPixel(coords);
        setPan(cx - nx , cy - ny);
    }

    function addCardView(card, cell) {
        const view = new CardView(cell, card);

        view.root.addEventListener('dragstart', event => {
            event.dataTransfer.setData('card-origin-cell', JSON.stringify(view.cell));
            event.dataTransfer.setData('text/plain', view.card.text);
            event.dataTransfer.setData('card/move', '');

            const [x, y] = [view.root.clientWidth / 2, view.root.clientHeight / 2];
            event.dataTransfer.setDragImage(view.root, x, y);
        });

        view.root.addEventListener('dragover', event => {
            event.preventDefault();
            event.stopPropagation();

            const newCard = event.dataTransfer.types.includes('card/new');
            event.dataTransfer.dropEffect = newCard ? 'none' : 'move'; 
        });

        // shouldn't need this but it's more foolproof...
        view.root.addEventListener('drop', event => {
            event.stopPropagation();
            event.preventDefault();

            if (!event.dataTransfer.types.includes('card/move'))
                return;

            const originJson = event.dataTransfer.getData('card-origin-cell');
            const cell = JSON.parse(originJson);
            swapCells(cell, view.cell);
    
            event.dataTransfer.clearData();
        });

        main.appendChild(view.root);

        view.root.addEventListener('click', () => {
            selectCard(view.card);
            centerCell(view.cell);
        });

        moveViewToCell(view, cell);

        return view;
    }

    function removeCardView(view) {
        main.removeChild(view.root);
        cellToView.delete(view.cell);
    }

    function swapCells(a, b) {
        if (coordsAreEqual(a, b))
            return;
        
        const aView = cellToView.get(a);
        const bView = cellToView.get(b);

        cellToView.delete(a);
        cellToView.delete(b);

        if (aView)
            moveViewToCell(aView, b);
        if (bView)
            moveViewToCell(bView, a);
    }

    document.addEventListener('dragover', event => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';
    });

    document.addEventListener('drop', event => {
        event.preventDefault();

        const rect = main.getBoundingClientRect();
        const dropPixel = [event.clientX - rect.x, event.clientY - rect.y];
        const dropCell = grid.pixelToCell(dropPixel);

        if (event.dataTransfer.types.includes('card/move')) {
            const originJson = event.dataTransfer.getData('card-origin-cell');
            const originCell = JSON.parse(originJson);

            swapCells(originCell, dropCell);
        } else if (event.dataTransfer.types.includes('card/new') 
                && !cellToView.has(dropCell)) {
            const view = addCardView({text: "new card", type: 0}, dropCell);
            selectCard(view.card);
        }

        event.dataTransfer.clearData();
    });

    for (let card of data['cards']) {
        addCardView(card, card['coords']);
    }

    main.classList.add('skiptransition');
    centerCell([0, 0]);
    await sleep(10);
    main.classList.remove('skiptransition');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function coordsAreEqual(a, b) {
    if (a.length !== b.length) 
        return false;

    for (let i = 0; i < a.length; ++i)
        if (a[i] !== b[1])
            return false;
    
    return true;
}

function coordsToKey(coords) {
    return coords.join(',');
}

class CoordStore {
    constructor() { this.store = new Map(); }
    get size() { return this.store.size; }
    get(coords) { return this.store.get(coordsToKey(coords)); }
    set(coords, value) { return this.store.set(coordsToKey(coords), value); }
    delete(coords) { return this.store.delete(coordsToKey(coords)); }
    has(coords) { return this.store.has(coordsToKey(coords)); }
}

// based on https://www.redblobgames.com/grids/hexagons/
class HexGrid {
    constructor(cellSize, cellSpacing=[0, 0]) {
        this.cellSize = cellSize;
        this.cellSpacing = cellSpacing;
    }

    cellToPixel(cellCoords) {
        const [q, r] = cellCoords;
        const [w, h] = this.cellSize;
        const [hs, vs] = this.cellSpacing;

        const x = q * (w + hs);
        const y = q * (h + vs) * .5 + r * (h + vs);
        return [x, y];
    }

    pixelDebug(pixelCoords) {
        let [x, y] = pixelCoords;
        const [w, h] = this.cellSize;
        const [hs, vs] = this.cellSpacing;

        const q = x / (w + hs);
        const r = (y - (q * (h + vs) * .5)) / (h + vs);

        return [q, r];
    }

    pixelToCell(pixelCoords) {
        const [x, y] = pixelCoords;
        const [w, h] = this.cellSize;
        const [hs, vs] = this.cellSpacing;

        const q = x / (w + hs);
        const r = (y - (q * (h + vs) * .5)) / (h + vs);

        const cx = q;
        const cy = r;
        const cz = 0 - cx - cy;

        let rx = Math.round(cx);
        let ry = Math.round(cy);
        let rz = Math.round(cz);

        var x_diff = Math.abs(rx - cx);
        var y_diff = Math.abs(ry - cy);
        var z_diff = Math.abs(rz - cz);

        if (x_diff > y_diff & x_diff > z_diff) {
            rx = -ry-rz
        } else if (y_diff > z_diff) {
            ry = -rx-rz
        } else {
            rz = -rx-ry
        }

        return [rx, ry];
    }
}
