'use strict';

const cardSpacing = [remToPx(2), remToPx(2)];

const cardStyleRegex = /\.domino-card-([a-zA-Z0-9-_]+)/;
function findCardStyleNames() {
    const styles = new Set();
    Array.from(document.styleSheets).forEach(sheet => {
        try {
            for (const rule of sheet.cssRules) {
                const names = rule.selectorText.match(cardStyleRegex);
                if (names)
                    styles.add(names[1]);
            }
        } catch (e) {}
    });
    return Array.from(styles);
}

function fakedownToTag(text, fd, tag) {
    const pattern = new RegExp(`${fd}([^${fd}]+)${fd}`, 'g');
    return text.replace(pattern, `<${tag}>$1</${tag}>`);
}

function parseFakedown(text) {
    if (text.startsWith('`'))
        return `<pre>${text.slice(1)}</pre>`;
    text = text.replace(/([^-])--([^-])/g, '$1—$2');
    text = fakedownToTag(text, '##', 'h3');
    text = fakedownToTag(text, '~~', 's');
    text = fakedownToTag(text, '__', 'strong');
    text = fakedownToTag(text, '\\*\\*', 'strong');
    text = fakedownToTag(text, '_', 'em');
    text = fakedownToTag(text, '\\*', 'em');
    text = text.replace(/\n/g, '<br>');
    return text;
}

const clicks = ['pointerdown', 'pointerup', 'click', 'touchstart'];
function setupClassHooks() {
    ALL('[data-block-clicks]').forEach(element => {
        for (let name of clicks)
            element.addEventListener(name, event => event.stopPropagation());
    });
    ALL('[data-click-to-hide]').forEach(element => {
        element.addEventListener('pointerdown', () => element.hidden = true);
        for (let name of clicks)
            element.addEventListener(name, event => event.stopPropagation());
    });
    ALL('[data-close-parent-screen]').forEach(element => {
        const screen = element.closest('.screen');
        element.addEventListener('click', () => screen.hidden = true);
        element.addEventListener('pointerdown', () => screen.hidden = true);
    });

    ALL('button').forEach(element => {
        if (!element.draggable)
            for (let name of clicks)
                element.addEventListener(name, event => event.stopPropagation());
    })
}

function updateDocumentVariables() {
    const vh = window.innerHeight / 100;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
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
    return getElementJsonData(ONE('#data', html));
}

function exportProject() {
    setElementJsonData('#data', domino.getData());
    const clone = document.documentElement.cloneNode(true);
    ALL('[data-export-clear]', clone).forEach(element => element.innerHTML = '');
    ALL('[data-export-hide]', clone).forEach(element => element.hidden = true);
    const blob = new Blob([clone.outerHTML], {type: "text/html"});
    saveAs(blob, `domino-test.html`);
}

function addCardViewListeners(domino, view) {
    view.root.addEventListener('click', event => {
        if (!domino.unlocked) return;

        killEvent(event);
        domino.selectCardView(view);
        domino.focusCell(view.cell);
    });
    view.root.addEventListener('pointerdown', event => {
        if (!domino.unlocked) return;
        event.stopPropagation();
    });
    view.root.addEventListener('dragstart', event => {
        if (!domino.unlocked) return;

        event.dataTransfer.setData('card-origin-cell', JSON.stringify(view.cell));
        event.dataTransfer.setData('text/plain', view.card.text);
        event.dataTransfer.setData('card/move', '');

        const [x, y] = getElementCenter(view.root);
        event.dataTransfer.setDragImage(view.root, x, y);
    });
    view.root.addEventListener('dragover', event => {
        if (!domino.unlocked) return;

        killEvent(event);
        const newCard = event.dataTransfer.types.includes('card/new');
        event.dataTransfer.dropEffect = newCard ? 'none' : 'move'; 
    });
    view.root.addEventListener('drop', event => {
        if (!domino.unlocked) return;

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
        this.focusedCell = [0, 0];
        this._panning = [0, 0];
        this.selectedCardView = undefined;
    }

    display(url, size=[800, 600]) {
        const frame = ONE('#display-frame');
        const [w, h] = size;
        ONE('#display-screen').hidden = false;
        frame.onerror = () => window.open(url);
        frame.src = url;
        frame.style.width = w;
        frame.style.height = h;
    }

    displayImage(url) {
        ONE('#display-image').src = url;
        ONE('#display-image-screen').hidden = false;
        ONE('#display-image').onerror = () => {
            ONE('#display-image-screen').hidden = true;
            window.open(url);
        };
    }

    runCommand(command) {
        if (command.startsWith('#')) {
            location.href = command;
        } else if (command.startsWith('image:')) {
            const src = command.slice(6);
            this.displayImage(src);
        } else if (command.startsWith('display:')) {
            const src = command.slice(8);
            this.display(src);
        } else if (command.length > 0) {
            window.open(command);
        }
    }

    set panning(position) {
        const [x, y] = position;
        this._panning = position;
        this.scene.style.transform = `translate(${x}px, ${y}px)`;
    }

    focusCell(coords) {
        if (this.pan) return;

        const element = this.editorScreen.hidden ? document.documentElement : this.editorPreview;
        this.focusedCell = coords;
        const [cx, cy] = getElementCenter(element);
        const [nx, ny] = this.grid.cellToPixel(coords);
        this.panning = [cx - nx, cy - ny];
        location.hash = coordsToKey(coords);
        const [q, r] = coords;
        ONE('#coords').innerHTML = `#${q},${r}`;
    }

    focusCellNoTransition(coords) {
        this.scene.classList.add('skiptransition');
        this.focusCell(coords);
        reflow(this.scene);
        this.scene.classList.remove('skiptransition');
    }

    addCard(card) {
        const view = new CardView(card);
    
        addCardViewListeners(this, view);
        this.scene.appendChild(view.root);
        this.moveCardToCell(view, card.cell);
    
        return view;
    }

    removeCard(view) {
        this.scene.removeChild(view.root);
        this.cellToView.delete(view.cell);

        if (this.editorScreen.activeView === view)
            this.editorScreen.setActiveView(undefined);
    }

    moveCardToCell(view, cell) {
        view.card.cell = cell;
        view.position = this.grid.cellToPixel(cell);
        this.cellToView.set(cell, view);
    }

    refreshCard(card) {
        this.cellToView.get(card.cell).refresh();
    }

    swapCells(a, b) {
        const aView = this.cellToView.get(a);
        const bView = this.cellToView.get(b);
    
        this.cellToView.delete(a);
        this.cellToView.delete(b);
    
        if (aView)
            this.moveCardToCell(aView, b);
        if (bView)
            this.moveCardToCell(bView, a);
    }

    clear() {
        this.deselect();
        this.scene.innerHTML = "";
        this.cellToView.store.clear();
        this.focusCell([0, 0]);
    }

    setData(data) {
        this.clear();
        for (let card of data.cards)
            this.addCard(card);
    }

    getData() {
        const views = Array.from(this.cellToView.store.values());
        const cards = views.map(view => view.card);
        return { cards };
    }

    setup() {
        this.editorScreen = new CardEditor();
        this.editorPreview = ONE('#editor-preview');
        this.scene = ONE('#scene');
        const [cw, ch] = computeCardSize(this.scene);
        const [sw, sh] = cardSpacing;
        this.grid = new HexGrid([cw + sw, ch + sh]);

        // hide fullscreen button if fullscreen is not possible
        if (!document.fullscreenEnabled)
            ONE('#fullscreen').hidden = true;

        this.cardbar = cloneTemplateElement('#cardbar-template');
        this.cardbar.id = 'cardbar';
        this.addDeleteCardIcon = ONE('#add-delete-icon');
        this.aboutScreen = ONE('#about-screen');

        this.lockedButton = ONE('#locked');
        this.unlockedButton = ONE('#unlocked');

        addListener(this.lockedButton,   'click', () => this.setUnlocked(true));
        addListener(this.unlockedButton, 'click', () => this.setUnlocked(false));

        const cardEditButton = ONE('#edit-card', this.cardbar);
        const importFile = ONE('#import-file');
        const screen = ONE('#screen');

        const onClickedEmptyCell = (event) => {
            killEvent(event);
            this.deselect();
            this.focusCell(pointerEventToCell(event));
        }

        // clicking listeners
        addListener(cardEditButton, 'click', () => this.editCardView(this.selectedCardView));
        addListener('#center',      'click', () => location.hash = '0,0');
        addListener('#open-about',  'click', () => this.aboutScreen.hidden = false);
        addListener('#reset',       'click', () => this.clear());
        addListener('#import',      'click', () => importFile.click());
        addListener('#export',      'click', () => exportProject());
        addListener('#fullscreen',  'click', () => toggleFullscreen());

        addListener(this.addDeleteCardIcon, 'pointerdown', event => event.stopPropagation());

        this.pan = undefined;
        window.addEventListener('pointerdown', event => {
            this.pan = {
                scenePosition: eventToElementPixel(event, this.scene),
                moves: 0,
            };
            this.scene.classList.add('skiptransition');
        });

        window.addEventListener('pointerup', () => {
            const click = this.pan && this.pan.moves < 5;
            this.pan = undefined;
            this.scene.classList.remove('skiptransition');
            if (click) 
                onClickedEmptyCell(event);
        });

        window.addEventListener('pointermove', event => {
            if (!this.pan) return;
            
            this.pan.moves += 1;

            // where we clicked in the scene
            const [wx, wy] = this.pan.scenePosition;
            // where we are in the scene now
            const [ax, ay] = eventToElementPixel(event, this.scene);
            // the error
            const [ex, ey] = [wx - ax, wy - ay];
            const [px, py] = this._panning;

            this.panning = [px - ex, py - ey];

            const [clientX, clientY] = getElementCenterClient(screen);
            const pixel = eventToElementPixel({ clientX, clientY }, this.scene);
            const [q, r] = this.grid.pixelToCell(pixel);
            this.focusedCell = [q, r];
            location.hash = coordsToKey([q, r]);
            ONE('#coords').innerHTML = `#${q},${r}`;
        });

        // file select listener
        addListener(importFile, 'change', async event => {
            this.setData(await extractDataFromHtmlFile(event.target.files[0]));
            importFile.value = null;
        });

        // dragging and dropping listeners
        setElementDragoverDropEffect(screen, 'copy');
        setElementDragoverDropEffect(this.editorScreen.root, 'none');
        setElementDragoverDropEffect(this.addDeleteCardIcon, 'move');

        const onDragFromNewCard = (event) => {
            event.dataTransfer.setData('card/new', '');
        }

        const onDroppedOnDelete = (event) => {
            killEvent(event);
            if (!event.dataTransfer.types.includes('card/move')) return;
            const originJson = event.dataTransfer.getData('card-origin-cell');
            const view = this.cellToView.get(JSON.parse(originJson));
            this.removeCard(view);
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
                    const card = { text: content, type: this.editorScreen.types[0], cell: dropCell };
                    const view = this.addCard(card);
                    view.triggerSpawnAnimation();
                    this.editorScreen.setActiveView(view);
                }
            }
        }

        addListener(this.addDeleteCardIcon, 'dragstart', onDragFromNewCard);
        addListener(this.editorScreen.root, 'drop', killEvent);
        addListener(this.addDeleteCardIcon, 'drop', onDroppedOnDelete);
        addListener(screen,                 'drop', onDroppedOnEmptyCell);
    }

    setUnlocked(unlocked) {
        this.unlocked = unlocked;
        this.addDeleteCardIcon.hidden = !unlocked;

        this.lockedButton.hidden = unlocked;
        this.unlockedButton.hidden = !unlocked;

        ALL('.card').forEach(element => {
            element.setAttribute('draggable', unlocked ? 'true' : 'false');
        });
    }
    
    deselect() { this.selectCardView(undefined); }

    editFocusedCell() {
        const view = this.cellToView.get(this.focusedCell);
        if (view)
            this.editCardView(view);
    }

    editCardView(view) {
        if (!this.selectCardView) return;
        this.editorScreen.hidden = false;
        this.editorScreen.setActiveView(view);
        this.focusCell(view.cell, this.editorPreview);
    }

    selectCardView(view) {
        this.selectedCardView = view;
        this.cardbar.hidden = (view === undefined) || !this.unlocked;

        if (view)
            view.root.appendChild(this.cardbar);
    }
}

class CardEditor {
    constructor() {
        this.root = ONE('#editor-screen');
        this.contentInput = ONE('#content-input', this.root);
        this.typeButtons = {};

        this.types = findCardStyleNames();

        const names = ['text', 'icons', 'style'];
        const tabs = {};
        const pages = {};

        this.setPage = (name) => {
            names.forEach(name => {
                tabs[name].classList.remove('selected');
                pages[name].hidden = true;
            });
            tabs[name].classList.add('selected');
            pages[name].hidden = false;
        }

        for (let name of names) {
            tabs[name] = ONE(`#editor-tab-${name}`, this.root);
            pages[name] = ONE(`#editor-page-${name}`, this.root);
            addListener(tabs[name], 'click', () => this.setPage(name));
        }

        this.setPage(names[0]);

        this.iconRows = [];

        const refreshIcons = () => {
            const icons = [];
            this.iconRows.forEach(row => {
                icons.push({
                    icon: row.select.value,
                    command: row.command.value,
                });
            });
            this.activeView.card.icons = icons;
            domino.refreshCard(this.activeView.card);
        }

        for (let row of [1, 2, 3, 4]) {
            const select = ONE(`#editor-icon-select-${row}`, this.root);
            const command = ONE(`#editor-icon-command-${row}`, this.root);
            this.iconRows.push({ select, command });
            addListener(select, 'input', () => refreshIcons());
            addListener(command, 'input', () => refreshIcons());
        }

        const typeSelect = ONE('#type-select');

        for (let type of this.types) {
            const button = document.createElement('div');
            button.classList.add(`domino-card-${type}`, 'type-button');
            button.setAttribute('title', `change card style to ${type}`);
            typeSelect.appendChild(button);

            button.addEventListener('click', () => this.setType(type));
            this.typeButtons[type] = button;
        }

        this.contentInput.addEventListener('input', () => {
            if (!this.activeView) return;

            this.activeView.card.text = this.contentInput.value;
            domino.refreshCard(this.activeView.card);
        });
    }

    get hidden() { return this.root.hidden; }
    set hidden(value) { this.root.hidden = value; }

    setActiveView(view) {
        this.activeView = view;
        this.setPage('text');
        this.contentInput.select();
        this.refreshFromCard();
    }

    refreshFromCard() {
        if (!this.activeView) return;

        for (let type of this.types)
            this.typeButtons[type].classList.remove('selected');
        this.typeButtons[this.activeView.card.type].classList.add('selected');
        this.contentInput.value = this.activeView.card.text;

        this.iconRows.forEach(row => {
            row.select.value = "";
            row.command.value = "";
        })

        const icons = this.activeView.card.icons || [];
        icons.slice(0, 4).forEach((row, i) => {
            const { select, command } = this.iconRows[i];
            select.value = row.icon
            command.value = row.command;
        });
    }

    setType(type) {
        if (!this.activeView) return;

        this.activeView.card.type = type;
        this.refreshFromCard();
        domino.refreshCard(this.activeView.card);
    }
}

class CardView {
    constructor(card) {
        this._position = [0, 0];
        this._scale = 1;
        this.card = card;

        this.root = cloneTemplateElement('#card-template');
        this.text = ONE('.card-text', this.root);
        this.icons = ONE('.icon-bar', this.root);
        
        this.refresh();
    }

    get cell() { return this.card.cell; }

    set position(value) { 
        this._position = value;
        this.updateTransform();
    }

    set scale(value) { 
        this._scale = value;
        this.updateTransform();
    }

    triggerSpawnAnimation() {
        this.scale = 0;
        reflow(this.root);
        this.scale = 1;
    }

    updateTransform() {
        const [x, y] = this._position;
        const position = `translate(calc(${x}px - 50%), calc(${y}px - 50%))`;
        const scaling = `scale(${this._scale}, ${this._scale})`;
        this.root.style.transform = `${position} ${scaling}`;
    }

    refresh() {
        const types = domino.editorScreen.types;
        this.root.classList.remove(...types.map(t => `domino-card-${t}`));
        this.root.classList.add(`domino-card-${this.card.type}`);
        this.text.innerHTML = parseFakedown(this.card.text);

        this.icons.innerHTML = "";
        (this.card.icons || []).forEach(row => {
            const button = document.createElement('a');
            button.innerHTML = row.icon;
            addListener(button, 'pointerdown', e => e.stopPropagation());
            addListener(button, 'click', e => { killEvent(e); domino.runCommand(row.command)});
            this.icons.appendChild(button);
            button.href = row.command;

            if (row.icon.length === 0)
                button.classList.add('blank');
            if (row.command.length === 0)
                button.classList.add('cosmetic');
        });
    }
}

const domino = new Domino();

async function loaded() {
    setupClassHooks();

    domino.setup();

    window.addEventListener('resize', updateDocumentVariables);
    updateDocumentVariables();

    // center the currently selected cell
    const jumpFromHash = () => domino.focusCell(getCoordsFromHash());
    window.addEventListener('hashchange', jumpFromHash);
    window.addEventListener('resize', jumpFromHash);
    
    // load data from embeded #data script tag
    const coords = getCoordsFromHash();
    const data = getElementJsonData('#data');
    domino.setData(data);
    domino.setUnlocked(false);
    domino.focusCellNoTransition(coords);

    // keyboard shortcuts
    window.addEventListener('keydown', event => {
        if (event.key === 'Escape')
            domino.editorScreen.hidden = true;

        if (!domino.editorScreen.hidden) return;

        if (event.key === 'e') {
            killEvent(event);
            domino.editFocusedCell();
        }

        const [q, r] = domino.focusedCell;
        if (event.key === 'ArrowLeft')  domino.focusCell([q - 1, r + 1]);
        if (event.key === 'ArrowRight') domino.focusCell([q + 1, r - 1]);
        if (event.key === 'ArrowUp')    domino.focusCell([q + 0, r - 1]);
        if (event.key === 'ArrowDown')  domino.focusCell([q + 0, r + 1]);
    });
}
