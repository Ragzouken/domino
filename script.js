const cube_directions = [
    [+1, -1, 0], [+1, 0, -1], [0, +1, -1], 
    [-1, +1, 0], [-1, 0, +1], [0, -1, +1], 
];

async function loaded() {
    const main = document.getElementsByTagName('main')[0];
    const colors = ['red', 'green', 'blue'];

    const json = document.getElementById('data').innerText;
    const data = JSON.parse(json);

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

    const testCard = document.createElement('div');
    testCard.classList.add('card');
    main.appendChild(testCard);

    const cardWidth = testCard.clientWidth;
    const cardHeight = testCard.clientHeight;
    const spacing = 32;

    main.removeChild(testCard);

    for (let card of data['cards']) {
        const div = document.createElement('div');
        div.classList.add('card', colors[card['type']]);
        div.innerHTML = card['text'];
        
        const [x, y] = hexToPixel(card['coords'], [cardWidth, cardHeight], spacing);

        div.style.position = "absolute";
        div.style.left = x + "px";
        div.style.top = y + "px";

        main.appendChild(div);
    }

    let [tx, ty, ts] = [0, 0, 1];

    /*
    document.addEventListener('keydown', event => {
        if (event.key === '-')
            ts -= .1;
        if (event.key === '=')
            ts += .1;

        main.style.transform = 'scale(' + ts + ')';
    });
    */
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

function hexToPixel(coords, dimensions, spacing=0) {
    const [q, r] = coords;
    const [w, h] = dimensions;

    var x = q * (w + spacing);
    var y = q * (h + spacing) * .5 + r * (h + spacing);
    return [x, y];
}
