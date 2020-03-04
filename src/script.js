'use strict';

const colors = ['black', 'red', 'green', 'blue'];

class CardView {
    constructor(cell, card) {
        this.cell = cell;
        this.card = card;

        this.root = cloneTemplateElement('#card-template');
        this.text = this.root.querySelector('.card-text');
        this.icons = this.root.querySelector('.icon-bar');
        
        this.refresh();
    }

    setPosition(x, y, scale=1) {
        const position = `translate(calc(${x}px - 50%), calc(${y}px - 50%))`;
        const scaling = `scale(${scale}, ${scale})`;
        this.root.style.transform = `${position} ${scaling}`;
    }

    refresh() {
        this.root.classList.remove(...colors);
        this.root.classList.add(this.card.type);
        this.text.innerHTML = this.card.text;
    }
}

async function playableHTMLBlob(json)
{
    const doc = document.documentElement.cloneNode(true);
    const data = doc.querySelector("#data");
    data.innerHTML = `\n${json}\n`;
    doc.querySelector("#scene").innerHTML = "";
    doc.querySelectorAll(".screen").forEach(screen => screen.hidden = true);

    return new Blob([doc.outerHTML], {type: "text/html"});
}

function setupClassHooks() {
    document.querySelectorAll('.block-clicks').forEach(element => {
        element.addEventListener('click', event => event.stopPropagation());
    });

    document.querySelectorAll('.click-to-hide').forEach(element => {
        element.addEventListener('click', () => element.hidden = true);
    })

    document.querySelectorAll('.close-parent-screen').forEach(element => {
        const screen = element.closest('.screen');
        element.addEventListener('click', () => screen.hidden = true);
    });
}

let makeEditable, selectCardView;
let editable = false;
let grid, scene, selectedCard;

const cellToView = new CoordStore();

function setCardType(type) {
    if (!selectedCard) return;

    selectedCard.type = type;
    refreshTypeSelect();
    updateAllViewContent();
}

function refreshTypeSelect() {
    if (!selectedCard) return;

    document.querySelectorAll('.type-button').forEach(button => {
        button.classList.remove('selected');
        if (button.classList.contains(selectedCard.type))
            button.classList.add('selected');
    });
}

function computeCardSize(parent) {
    const testCard = document.createElement('div');
    testCard.classList.add('card');
    parent.appendChild(testCard);
    const size = [testCard.clientWidth, testCard.clientHeight];
    parent.removeChild(testCard);
    return size;
}

function centerCell(coords) {
    const [cx, cy] = getElementCenter(document.documentElement);
    const [nx, ny] = grid.cellToPixel(coords);
    setPan(cx - nx , cy - ny);
    location.hash = `${coords[0]},${coords[1]}`;
}

const setPan = (x, y) => scene.style.transform = `translate(${x}px, ${y}px)`;

function projectDataFromDocument(document) {
    const json = document.querySelector('#data').innerHTML;
    return JSON.parse(json);
}

async function htmlFileToData(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            const html = document.createElement('html');
            html.innerHTML = reader.result;
            const data = projectDataFromDocument(html);
            resolve(data);
        };
        reader.readAsText(file); 
    });
}

function projectToData() {
    const cardData = {};
    const viewData = [];
    const cardToId = new Map();

    let nextId = 0;
    const generateID = () => (nextId++).toString();

    function getCardId(card) {
        let id = cardToId.get(card) || generateID();
        cardToId.set(card, id);
        cardData[id] = card;
        return id;
    }
    
    cellToView.store.forEach((view) => {
        viewData.push({ cell: view.cell, card: getCardId(view.card) });
    });

    return {
        editable: false,
        cards: cardData,
        views: viewData, 
    };
}

async function exportProject() {
    const json = JSON.stringify(projectToData());
    document.querySelector('#data').innerHTML = json;

    const name = "test";
    const blob = await playableHTMLBlob(json);
    saveAs(blob, `domino-${name}.html`);
}

function toggleFullscreen() {
    if (document.fullscreenElement) {
        return document.exitFullscreen();
    } else {
        return document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
}

function moveViewToCell(view, cell, scale=1) {
    view.cell = cell;
    console.assert(!cellToView.has(cell) || cellToView.get(cell) === view);
    cellToView.set(cell, view);

    const [x, y] = grid.cellToPixel(cell);
    view.setPosition(x, y, scale);
}

function swapViewCells(a, b) {
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

function addCardViewListeners(view) {
    view.root.addEventListener('click', () => {
        selectCardView(view);
        centerCell(view.cell);
    });
    view.root.addEventListener('dragstart', event => {
        event.dataTransfer.setData('card-origin-cell', JSON.stringify(view.cell));
        event.dataTransfer.setData('text/plain', view.card.text);
        event.dataTransfer.setData('card/move', '');

        const [x, y] = getElementCenter(view.root);
        event.dataTransfer.setDragImage(view.root, x, y);
    });
    view.root.addEventListener('dragover', event => {
        killEvent(event);
        const newCard = event.dataTransfer.types.includes('card/new');
        event.dataTransfer.dropEffect = newCard ? 'none' : 'move'; 
    });
    view.root.addEventListener('drop', event => {
        killEvent(event);
        if (!event.dataTransfer.types.includes('card/move'))
            return;

        const originJson = event.dataTransfer.getData('card-origin-cell');
        const cell = JSON.parse(originJson);
        swapViewCells(cell, view.cell);
    });
}

function hashToCoords() {
    try {
        const coords = location.hash.slice(1).split(',').map(i => parseInt(i) || 0);
        if (coords.length === 2) return coords;
    } catch(e) {}

    return [0, 0];
}

async function centerCellNoTransition(coords) {
    scene.classList.add('skiptransition');
    centerCell(coords);
    await sleep(10);
    scene.classList.remove('skiptransition');
}

function addCardView(card, cell) {
    const view = new CardView(cell, card);

    addCardViewListeners(view);
    scene.appendChild(view.root);
    moveViewToCell(view, cell);

    return view;
}

function removeCardView(view) {
    scene.removeChild(view.root);
    cellToView.delete(view.cell);
    if (selectedCard === view.card)
        deselect();
}

async function spawnCardView(card, cell) {
    const view = addCardView(card, cell);
    moveViewToCell(view, view.cell, 0);
    await sleep(10);
    moveViewToCell(view, view.cell, 1);
    return view;
}

function loadData(data) {
    scene.innerHTML = "";
    cellToView.store.clear();

    for (let view of data.views) {
        addCardView(data.cards[view.card], view.cell);
    }
    updateAllViewContent();
}

const jumpFromHash = () => centerCell(hashToCoords());
const updateAllViewContent = () => cellToView.store.forEach(view => view.refresh());
const clearBoard = () => loadData({editable: true, cards:[], views:[]});
const deselect = () => selectCardView(undefined);

const dropContentTransformers = [
    ['card/new',      c => 'new card'],
    ['text/html',     c => c],
    ['text/uri-list', c => c.split('\n').filter(uri => !uri.startsWith('#')).map(uri => `<a href="${uri}">link</a>`)],
    ['text/plain',    c => c],
    ['text',          c => c],
];

async function loaded() {
    setupClassHooks();

    scene = document.querySelector('#scene');
    const [cw, ch] = computeCardSize(scene);
    grid = new HexGrid([cw + 32, ch + 32]);

    const cardbar = cloneTemplateElement('#cardbar-template');
    cardbar.id = 'cardbar'
    const editCard = cardbar.querySelector('#edit-card');

    const contentInput = document.querySelector('#content-input');
    const importFile = document.querySelector('#import-file');
    const screen = document.querySelector('#screen');

    const aboutScreen = document.querySelector('#about-screen');
    const editorPanel = document.querySelector('#editor-panel');
    setElementDragoverDropEffect(editorPanel, 'none');
    addListener(editorPanel, 'drop', killEvent);

    addListener(editCard,       'click', () => editorPanel.hidden = false);
    addListener('#center',      'click', () => location.hash = '0,0');
    addListener('#open-about',  'click', () => aboutScreen.hidden = false);
    addListener('#enable-edit', 'click', () => setEditable(true));
    addListener('#reset',       'click', () => clearBoard());
    addListener('#import',      'click', () => importFile.click());
    addListener('#export',      'click', () => exportProject());
    addListener('#fullscreen',  'click', () => toggleFullscreen());

    document.querySelector('#fullscreen').hidden = !document.fullscreenEnabled;

    window.addEventListener('hashchange', jumpFromHash);
    window.addEventListener('resize', jumpFromHash);

    addListener(importFile, 'change', async event => {
        loadData(await htmlFileToData(event.target.files[0]));
    });

    const addCard = document.querySelector('#add-delete-icon');
    addListener(addCard, 'dragstart', event => {
        event.dataTransfer.setData('card/new', '');
    });

    setElementDragoverDropEffect(addCard, 'move');

    addListener(addCard, 'drop', event => {
        killEvent(event);
        if (event.dataTransfer.types.includes('card/move')) {
            const originJson = event.dataTransfer.getData('card-origin-cell');
            const view = cellToView.get(JSON.parse(originJson));
            removeCardView(view);
        }
    });

    contentInput.addEventListener('input', () => {
        if (!selectedCard) return;

        selectedCard.text = contentInput.value;
        updateAllViewContent();
    });

    selectCardView = function(view) {
        selectedCard = view ? view.card : undefined;
        cardbar.hidden = (view === undefined) || !editable;

        if (view) {
            contentInput.value = view.card.text;
            view.root.appendChild(cardbar);
        }

        refreshTypeSelect();
        updateAllViewContent();
    }

    setElementDragoverDropEffect(screen, 'copy');
    addListener(screen, 'click', event => {
        killEvent(event);
        const clickPixel = eventToElementPixel(event, scene);
        const clickCell = grid.pixelToCell(clickPixel);
        centerCell(clickCell);
        deselect();
    });
    addListener(screen, 'drop', async event => {
        killEvent(event);

        const rect = scene.getBoundingClientRect();
        const dropPixel = [event.clientX - rect.x, event.clientY - rect.y];
        const dropCell = grid.pixelToCell(dropPixel);
        
        const amMovingCard = event.dataTransfer.types.includes('card/move');
        const cellIsEmpty = !cellToView.has(dropCell);

        if (amMovingCard) {
            const originJson = event.dataTransfer.getData('card-origin-cell');
            const originCell = JSON.parse(originJson);

            swapViewCells(originCell, dropCell);
        } else if (cellIsEmpty) {
            let content = undefined;

            for (let [field, transformer] of dropContentTransformers) {
                if (event.dataTransfer.types.includes(field)) {
                    const data = event.dataTransfer.getData(field);
                    content = transformer(data);
                    break;
                }
            }

            if (content) {
                const card = { text: content, type: 'black' };
                const view = await spawnCardView(card, dropCell);
                selectCardView(view);
            }
        }
    });

    function setEditable(state) {
        editable = state;
        document.querySelector('#enable-edit').disabled = editable;
        addCard.hidden = !editable;
    }

    function loadDataFromEmbed() {
        const data = projectDataFromDocument(document);
        setEditable(data.editable);
        loadData(data);
    }
    
    loadDataFromEmbed();
    selectCardView(undefined);
    centerCellNoTransition(hashToCoords());
}
