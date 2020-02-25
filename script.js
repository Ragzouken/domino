const cube_directions = [
    [+1, -1, 0], [+1, 0, -1], [0, +1, -1], 
    [-1, +1, 0], [-1, 0, +1], [0, -1, +1], 
];

async function loaded() {
    const main = document.getElementsByTagName('main')[0];
    const colors = ['red', 'green', 'blue'];
    const cards = new Map();

    const json = document.getElementById('data').innerText;
    const data = JSON.parse(json);

    const testCard = document.createElement('div');
    testCard.classList.add('card');
    main.appendChild(testCard);

    const grid = new HexGrid([testCard.clientWidth, testCard.clientHeight], [32, 32]);
    const cellToView = new Map();
    const elementToView = new Map();

    main.removeChild(testCard);

    function setPan(x, y) {
        main.style.transform = `translate(${x}px, ${y}px)`;
    }

    function moveElementToCell(element, cell) {
        const view = elementToView.get(element);
        const coords = coordsToKey(cell);

        view.cell = cell;
        console.assert(!cellToView.has(coords));
        cellToView.set(coords, view);

        const [x, y] = grid.cellToPixel(cell);
        element.style.transform = `translate(calc(${x}px - 50%), calc(${y}px - 50%))`;
    }

    function centerCell(coords) {
        const [cx, cy] = [document.documentElement.clientWidth / 2, document.documentElement.clientHeight / 2];
        const [nx, ny] = grid.cellToPixel(coords);
        setPan(cx - nx , cy - ny);
    }

    function addCardView(card) {
        const element = document.createElement('div');
        element.classList.add('card', colors[card['type']]);
        element.innerHTML = card['text'];
        element.draggable = true;

        const view = {
            element: element,
            cell: [0, 0],
            card: card,
        }

        element.addEventListener('dragstart', event => {
            event.dataTransfer.dropEffect = 'move';
            event.dataTransfer.setData('card-origin-cell', coordsToKey(view.cell));
            event.dataTransfer.setData('text/plain', view.card.text);
        });

        // shouldn't need this but it's more foolproof...
        element.addEventListener('drop', event => {
            event.stopPropagation();
            event.preventDefault();
    
            const key = event.dataTransfer.getData('card-origin-cell');
            const coords = keyToCoords(key);
            swapCells(coords, view.cell);
    
            event.dataTransfer.clearData();
        });

        main.appendChild(element);

        element.addEventListener('click', () => {
            centerCell(view.cell);
        });

        elementToView.set(element, view);

        return element;
    }

    function swapCells(a, b) {
        const akey = coordsToKey(a);
        const bkey = coordsToKey(b);

        if (akey === bkey)
            return;
        
        const aView = cellToView.get(akey);
        const bView = cellToView.get(bkey);

        if (aView)
            cellToView.delete(akey);
        if (bView)
            cellToView.delete(bkey);

        if (aView)
            moveElementToCell(aView.element, b);
        if (bView)
            moveElementToCell(bView.element, a);
    }

    document.addEventListener('dragover', event => {
        event.preventDefault();

        const key = event.dataTransfer.getData('card-origin-cell');
        const coords = keyToCoords(key);

        const rect = main.getBoundingClientRect();
        const [x, y] = [event.clientX - rect.x, event.clientY - rect.y];
        const [q, r] = grid.pixelDebug([x, y]);
        const [qr, rr] = grid.pixelToCell([x, y]);

        document.querySelector('#debug').innerHTML = `${x},${y} -> x,${rr} (x,${r})`;
    });

    document.addEventListener('drop', event => {
        event.preventDefault();

        const key = event.dataTransfer.getData('card-origin-cell');
        const coords = keyToCoords(key);

        const rect = main.getBoundingClientRect();
        const [x, y] = [event.clientX - rect.x, event.clientY - rect.y];
        const [q, r] = grid.pixelToCell([x, y]);
        swapCells(coords, [q, r]);

        event.dataTransfer.clearData();
    });

    for (let card of data['cards']) {
        const element = addCardView(card);
        moveElementToCell(element, card['coords']);
        delete card['coords'];
    }

    main.classList.add('skiptransition');
    centerCell([0, 0]);
    await sleep(10);
    main.classList.remove('skiptransition');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function cubeAdd(a, b) {
    return [
        a[0] + b[0],
        a[1] + b[1],
        a[2] + b[2],
    ];
}

function cubeScale(cube, scale) {
    return [
        cube[0] * scale,
        cube[1] * scale,
        cube[2] * scale,
    ];
}

function cubeNeighbor(cube, direction) {
    return cubeAdd(cube, cube_directions[direction])
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function coordsToKey(coords) {
    return coords.join(',');
}

function keyToCoords(key) {
    return key.split(',').map(i => parseInt(i));
}

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
