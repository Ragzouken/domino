'use strict';

const cardSpacing = [remToPx(2), remToPx(2)];
const types = ['black', 'red', 'green', 'blue'];

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

        if (this.editorPanel.activeView === view)
            this.editorPanel.setActiveView(undefined);
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
        this.editorPanel = new CardEditor();
        this.scene = document.querySelector('#scene');
        const [cw, ch] = computeCardSize(this.scene);
        const [sw, sh] = cardSpacing;
        this.grid = new HexGrid([cw + sw, ch + sh]);

        // hide fullscreen button if fullscreen is not possible
        document.querySelector('#fullscreen').hidden = !document.fullscreenEnabled;

        this.cardbar = cloneTemplateElement('#cardbar-template');
        this.cardbar.id = 'cardbar';
        this.addDeleteCardIcon = document.querySelector('#add-delete-icon');
        this.enableEdit = document.querySelector('#enable-edit')
        this.aboutScreen = document.querySelector('#about-screen');

        const cardEditButton = this.cardbar.querySelector('#edit-card');
        const importFile = document.querySelector('#import-file');
        const screen = document.querySelector('#screen');

        const onClickedEmptyCell = (event) => {
            killEvent(event);
            this.deselect();
            this.centerCell(pointerEventToCell(event));
        }

        // clicking listeners
        addListener(screen,         'click', onClickedEmptyCell);
        addListener(cardEditButton, 'click', () => this.editorPanel.hidden = false);
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
        setElementDragoverDropEffect(this.editorPanel.root, 'none');
        setElementDragoverDropEffect(this.addDeleteCardIcon, 'move');

        const onDragFromNewCard = (event) => {
            event.dataTransfer.setData('card/new', '');
        }

        const onDroppedOnDelete = (event) => {
            killEvent(event);
            if (!event.dataTransfer.types.includes('card/move')) return;
            const originJson = event.dataTransfer.getData('card-origin-cell');
            const view = this.cellToView.get(JSON.parse(originJson));
            this.removeCardView(view);
        }

        const pointerEventToCell = (event) => {
            const clickPixel = eventToElementPixel(event, this.scene);
            const clickCell = this.grid.pixelToCell(clickPixel);
            return clickCell;
        }

        const onDroppedOnEmptyCell = (event) => {
            killEvent(event);
            const dropCell = pointerEventToCell(event);
            
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
                    this.editorPanel.setActiveView(view);
                }
            }
        }

        addListener(this.addDeleteCardIcon, 'dragstart', onDragFromNewCard);
        addListener(this.editorPanel.root,  'drop', killEvent);
        addListener(this.addDeleteCardIcon, 'drop', onDroppedOnDelete);
        addListener(screen,                 'drop', onDroppedOnEmptyCell);
    }

    setEditable(editable) {
        this.editable = editable;
        this.enableEdit.disabled = editable;
        this.addDeleteCardIcon.hidden = !editable;
    }
    
    deselect() { this.selectCardView(undefined); }

    selectCardView(view) {
        this.editorPanel.setActiveView(view);
        this.cardbar.hidden = (view === undefined) || !this.editable;

        if (view)
            view.root.appendChild(this.cardbar);
    }
}

class CardEditor {
    constructor() {
        this.root = document.querySelector('#editor-panel');
        this.contentInput = this.root.querySelector('#content-input');
        this.typeButtons = {};

        const typeSelect = document.querySelector('#type-select');

        for (let type of types) {
            const select = document.createElement('div');
            select.classList.add(type);
            select.addEventListener('click', () => this.setType(type));
            typeSelect.appendChild(select);
            this.typeButtons[type] = select;
        }

        this.contentInput.addEventListener('input', () => {
            if (!this.activeView) return;

            this.activeView.card.text = this.contentInput.value;
            domino.refreshAllCardViews();
        });
    }

    set hidden(value) { this.root.hidden = value; }

    setActiveView(view) {
        this.activeView = view;

        this.refreshFromCard();
    }

    refreshFromCard() {
        if (!this.activeView) return;

        for (let type of types)
            this.typeButtons[type].classList.remove('selected');
        this.typeButtons[this.activeView.card.type].classList.add('selected');
        this.contentInput.value = this.activeView.card.text;
    }

    setType(type) {
        if (!this.activeView) return;

        this.activeView.card.type = type;
        this.refreshFromCard();
        domino.refreshAllCardViews();
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
        this.root.classList.remove(...types);
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
