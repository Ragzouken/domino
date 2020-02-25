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

    /*
    for (let radius = 1; radius < 3; ++radius) {
        let cube = cubeAdd([0, 0, 0], cubeScale(cube_directions[4], radius));
        for (let i = 0; i < 6; ++i) {
            for (let j = 0; j < radius; ++j) {
                cube = cubeNeighbor(cube, i);

                if (Math.random() > .8) continue;

                const [q, r, s] = cube;
                data['cards'].push({
                    'coords': [q, r],
                    'text': '"digital technology is a product of cheap energy"',
                    'type': randomInt(0, 2),
                });
            }
        }
    }
    */

    const testCard = document.createElement('div');
    testCard.classList.add('card');
    main.appendChild(testCard);

    const cardWidth = testCard.clientWidth;
    const cardHeight = testCard.clientHeight;
    const spacing = 32;

    main.removeChild(testCard);

    let [tx, ty] = [0, 0];
    function setTranslate(x, y) {
        tx = x;
        ty = y;
        main.style.transform = 'translate(' + tx + 'px, ' + ty + 'px)';
    }

    function centerCard(div, card) {
        const divRect = div.getBoundingClientRect();

        const [x, y] = [(divRect.left + divRect.right) / 2, 
                        (divRect.top + divRect.bottom) / 2];
        const [cx, cy] = [document.documentElement.clientWidth / 2, document.documentElement.clientHeight / 2];
        const [dx, dy] = [cx - x, cy - y];

        setTranslate(tx + dx, ty + dy);
    }

    function addCard(card) {
        const coords = coordsToKey(card['coords']);

        if (cards.has(coords)) 
            throw new Error(`A card already exists at ${coords}`);

        const div = document.createElement('div');
        div.classList.add('card', colors[card['type']]);
        div.innerHTML = card['text'];
        div.draggable = true;

        div.addEventListener('dragstart', event => {
            event.dataTransfer.dropEffect = 'move';
            event.dataTransfer.setData('card-origin-cell', coordsToKey(card['coords']));
            event.dataTransfer.setData('text/plain', card['text']);
        });

        main.appendChild(div);

        div.addEventListener('click', () => {
            centerCard(div, card);
        });

        cards.set(coords, {card, div});
    }

    function deleteCard(card) {
        const key = coordsToKey(card['coords']);
        const div = cards.get(key).div;
        div.parentElement.removeChild(div);
        cards.delete(key);
    }

    function repositionCard(card) {
        const [x, y] = hexToPixel(card['coords'], [cardWidth, cardHeight], spacing);

        div = cards.get(coordsToKey(card['coords'])).div;

        div.style.position = "absolute";
        div.style.left = x + "px";
        div.style.top = y + "px";
    }

    function swapCells(a, b) {
        const akey = coordsToKey(a);
        const bkey = coordsToKey(b);

        if (akey === bkey)
            return;
        
        const ac = cards.get(akey);
        const bc = cards.get(bkey);

        //console.log(`${ac.card['text']} <-> ${bc.card['text']}`);

        if (ac)
            deleteCard(ac.card);
        if (bc)
            deleteCard(bc.card);

        if (ac) {
            ac.card['coords'] = b;
            addCard(ac.card);
            repositionCard(ac.card);
        }

        if (bc) {
            bc.card['coords'] = a;
            addCard(bc.card);
            repositionCard(bc.card);
        }
    }

    document.addEventListener('dragover', event => {
        event.preventDefault();
    });

    document.addEventListener('drop', event => {
        const key = event.dataTransfer.getData('card-origin-cell');
        const coords = keyToCoords(key);

        const rect = main.getBoundingClientRect();
        const [x, y] = [event.clientX - rect.x, event.clientY - rect.y];
        const [q, r] = pixelToHex([x, y], [cardWidth, cardHeight], spacing);
        swapCells(coords, [q, r]);

        event.dataTransfer.clearData();
    });

    for (let card of data['cards']) {
        addCard(card);
        repositionCard(card);
    }
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

function pixelToHex(pixel, dimensions, spacing=0) {
    const [x, y] = pixel;
    const [w, h] = dimensions;

    const q = x / (w + spacing);
    const r = (y - (q * h + spacing) * .5) / (h + spacing);

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

function hexToPixel(coords, dimensions, spacing=0) {
    const [q, r] = coords;
    const [w, h] = dimensions;

    const x = q * (w + spacing);
    const y = q * (h + spacing) * .5 + r * (h + spacing);
    return [x, y];
}
