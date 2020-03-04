'use strict';

const cardSpacing = [remToPx(2), remToPx(2)];
const colors = ['black', 'red', 'green', 'blue'];

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

function setCardType(type) {
    if (!domino.selectedCard) return;

    domino.selectedCard.type = type;
    refreshTypeSelect();
    domino.refreshAllCardViews();
}

function refreshTypeSelect() {
    if (!domino.selectedCard) return;

    document.querySelectorAll('.type-button').forEach(button => {
        button.classList.remove('selected');
        if (button.classList.contains(domino.selectedCard.type))
            button.classList.add('selected');
    });
}

function computeCardSize(parent) {
    const testCard = cloneTemplateElement('#card-template');
    parent.appendChild(testCard);
    const size = [testCard.clientWidth, testCard.clientHeight];
    parent.removeChild(testCard);
    return size;
}

async function extractDataFromHtmlFile(file) {
    const html = document.createElement('html');
    html.innerHTML = await textFromFile(file);
    return getElementJsonData(html.querySelector('#data'));
}

function exportProject() {
    setElementJsonData('#data', domino.getData());
    const clone = document.documentElement.cloneNode(true);
    clone.querySelector("#scene").innerHTML = "";
    clone.querySelectorAll(".screen").forEach(screen => screen.hidden = true);
    const blob = new Blob([clone.outerHTML], {type: "text/html"});
    saveAs(blob, `domino-test.html`);
}

function addCardViewListeners(domino, view) {
    view.root.addEventListener('click', () => {
        domino.selectCardView(view);
        domino.centerCell(view.cell);
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
        domino.swapCells(cell, view.cell);
    });
}

function getCoordsFromHash() {
    try {
        const coords = location.hash.slice(1).split(',').map(i => parseInt(i) || 0);
        if (coords.length === 2) return coords;
    } catch(e) {}

    return [0, 0];
}

const dropContentTransformers = [
    ['card/new',      c => 'new card'],
    ['text/html',     c => c],
    ['text/uri-list', c => c.split('\n').filter(uri => !uri.startsWith('#')).map(uri => `<a href="${uri}">link</a>`)],
    ['text/plain',    c => c],
    ['text',          c => c],
];

class Domino {
    constructor() {
        this.cellToView = new CoordStore();
        this.selectedCard = undefined;
    }

    centerCell(coords) {
        const [cx, cy] = getElementCenter(document.documentElement);
        const [nx, ny] = this.grid.cellToPixel(coords);
        const [x, y] = [cx - nx, cy - ny];
        this.scene.style.transform = `translate(${x}px, ${y}px)`;
        location.hash = coordsToKey(coords);
    }

    centerCellNoTransition(coords) {
        this.scene.classList.add('skiptransition');
        this.centerCell(coords);
        reflow(this.scene);
        this.scene.classList.remove('skiptransition');
    }

    spawnCardView(card, cell) {
        const view = this.createCardView(card, cell);
        view.scale = 0;
        reflow(view.root);
        view.scale = 1;
        return view;
    }

    createCardView(card, cell) {
        const view = new CardView(cell, card);
    
        addCardViewListeners(this, view);
        this.scene.appendChild(view.root);
        this.moveCardViewToCell(view, cell);
    
        return view;
    }

    removeCardView(view) {
        this.scene.removeChild(view.root);
        this.cellToView.delete(view.cell);
        if (this.selectedCard === view.card)
            this.deselect();
    }

    moveCardViewToCell(view, cell) {
        view.cell = cell;
        view.position = this.grid.cellToPixel(cell);
        this.cellToView.set(cell, view);
    }

    refreshAllCardViews() {
        this.cellToView.store.forEach(view => view.refresh());
    }

    swapCells(a, b) {
        if (coordsAreEqual(a, b))
            return;
        
        const aView = this.cellToView.get(a);
        const bView = this.cellToView.get(b);
    
        this.cellToView.delete(a);
        this.cellToView.delete(b);
    
        if (aView)
            this.moveCardViewToCell(aView, b);
        if (bView)
            this.moveCardViewToCell(bView, a);
    }

    clear() {
        this.deselect();
        this.scene.innerHTML = "";
        this.cellToView.store.clear();
    }

    setData(data) {
        this.clear();
        for (let view of data.views)
            this.createCardView(data.cards[view.card], view.cell);
    }

    getData() {
        const cardData = {};
        const viewData = [];
        const cardToId = new Map();
        const generateID = makeCounter();
    
        function getCardId(card) {
            let id = cardToId.get(card) || generateID();
            cardToId.set(card, id);
            cardData[id] = card;
            return id;
        }
        
        this.cellToView.store.forEach((view) => {
            viewData.push({ cell: view.cell, card: getCardId(view.card) });
        });
    
        return {
            editable: false,
            cards: cardData,
            views: viewData, 
        };
    }

    setup() {
        this.scene = document.querySelector('#scene');
        const [cw, ch] = computeCardSize(this.scene);
        const [sw, sh] = cardSpacing;
        this.grid = new HexGrid([cw + sw, ch + sh]);

        // hide fullscreen button if fullscreen is not possible
        document.querySelector('#fullscreen').hidden = !document.fullscreenEnabled;

        this.cardbar = cloneTemplateElement('#cardbar-template');
        this.cardbar.id = 'cardbar';
        const editCard = this.cardbar.querySelector('#edit-card');
        const importFile = document.querySelector('#import-file');
        const screen = document.querySelector('#screen');
        this.addDeleteCardIcon = document.querySelector('#add-delete-icon');
        this.enableEdit = document.querySelector('#enable-edit')
        this.aboutScreen = document.querySelector('#about-screen');
        this.editorPanel = document.querySelector('#editor-panel');
        this.contentInput = this.editorPanel.querySelector('#content-input');

        // card editor listener
        this.contentInput.addEventListener('input', () => {
            if (!this.selectedCard) return;
            this.selectedCard.text = this.contentInput.value;
            this.refreshAllCardViews();
        });

        // clicking listeners
        addListener(screen,         'click', () => onClickedEmptyCell());
        addListener(editCard,       'click', () => this.editorPanel.hidden = false);
        addListener('#center',      'click', () => location.hash = '0,0');
        addListener('#open-about',  'click', () => this.aboutScreen.hidden = false);
        addListener('#enable-edit', 'click', () => this.setEditable(true));
        addListener('#reset',       'click', () => this.clear());
        addListener('#import',      'click', () => importFile.click());
        addListener('#export',      'click', () => exportProject());
        addListener('#fullscreen',  'click', () => toggleFullscreen());

        // file select listener
        addListener(importFile, 'change', async event => {
            this.setData(await extractDataFromHtmlFile(event.target.files[0]));
        });

        // dragging and dropping listeners
        setElementDragoverDropEffect(screen, 'copy');
        setElementDragoverDropEffect(this.editorPanel, 'none');
        setElementDragoverDropEffect(this.addDeleteCardIcon, 'move');

        addListener(this.addDeleteCardIcon, 'dragstart', onDragFromNewCard);

        addListener(this.editorPanel,       'drop', killEvent);
        addListener(this.addDeleteCardIcon, 'drop', onDroppedOnDelete);
        addListener(screen,                 'drop', onDroppedOnEmptyCell);

        function onDragFromNewCard(event) {
            event.dataTransfer.setData('card/new', '');
        }

        function onDroppedOnDelete(event) {
            killEvent(event);
            if (!event.dataTransfer.types.includes('card/move')) return;
            const originJson = event.dataTransfer.getData('card-origin-cell');
            const view = this.cellToView.get(JSON.parse(originJson));
            this.removeCardView(view);
        }

        function onClickedEmptyCell(event) {
            killEvent(event);
            this.deselect();
            const clickPixel = eventToElementPixel(event, this.scene);
            const clickCell = this.grid.pixelToCell(clickPixel);
            this.centerCell(clickCell);
        }

        function onDroppedOnEmptyCell(event) {
            killEvent(event);
            const dropPixel = eventToElementPixel(event, this.scene);
            const dropCell = this.grid.pixelToCell(dropPixel);
            
            const amMovingCard = event.dataTransfer.types.includes('card/move');
            const cellIsEmpty = !this.cellToView.has(dropCell);
    
            if (amMovingCard) {
                const originJson = event.dataTransfer.getData('card-origin-cell');
                const originCell = JSON.parse(originJson);
    
                this.swapCells(originCell, dropCell);
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
                    const view = this.spawnCardView(card, dropCell);
                    this.selectCardView(view);
                }
            }
        }
    }

    setEditable(editable) {
        this.editable = editable;
        this.enableEdit.disabled = editable;
        this.addDeleteCardIcon.hidden = !editable;
    }
    
    deselect() { this.selectCardView(undefined); }

    selectCardView(view) {
        this.selectedCard = view ? view.card : undefined;
        this.cardbar.hidden = (view === undefined) || !this.editable;

        if (view) {
            this.contentInput.value = view.card.text;
            view.root.appendChild(this.cardbar);
        }

        refreshTypeSelect();
        this.refreshAllCardViews();
    }
}

class CardView {
    constructor(cell, card) {
        this._position = [0, 0];
        this._scale = 1;
        this.cell = cell;
        this.card = card;

        this.root = cloneTemplateElement('#card-template');
        this.text = this.root.querySelector('.card-text');
        this.icons = this.root.querySelector('.icon-bar');
        
        this.refresh();
    }

    set position(value) { 
        this._position = value;
        this.updateTransform();
    }

    set scale(value) { 
        this._scale = value;
        this.updateTransform();
    }

    updateTransform() {
        const [x, y] = this._position;
        const position = `translate(calc(${x}px - 50%), calc(${y}px - 50%))`;
        const scaling = `scale(${this._scale}, ${this._scale})`;
        this.root.style.transform = `${position} ${scaling}`;
    }

    refresh() {
        this.root.classList.remove(...colors);
        this.root.classList.add(this.card.type);
        this.text.innerHTML = this.card.text;
    }
}

const domino = new Domino();

async function loaded() {
    setupClassHooks();

    domino.setup();

    // center the currently selected cell
    const jumpFromHash = () => domino.centerCell(getCoordsFromHash());
    window.addEventListener('hashchange', jumpFromHash);
    window.addEventListener('resize', jumpFromHash);
    
    // load data from embeded #data script tag
    const data = getElementJsonData('#data');
    domino.setEditable(data.editable);
    domino.setData(data);
    domino.centerCellNoTransition(getCoordsFromHash());
}
