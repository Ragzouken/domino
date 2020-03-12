'use strict';

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

let pageSetters = new Map();
const clicks = ['pointerdown', 'pointerup', 'click', 'touchstart', 'wheel'];
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

    const tabsets = new Set(
        ALL('[data-tab-set]')
        .map(element => element.getAttribute('data-tab-set'))
    );

    tabsets.forEach(tabset => {
        const pages = new Map();
        const tabs = new Map();

        const setPage = pageName => {
            for (let tab of tabs.values())
                tab.classList.remove('selected');
            for (let page of pages.values())
                page.hidden = true;

            tabs.get(pageName).classList.add('selected');
            pages.get(pageName).hidden = false;
        };

        pageSetters.set(tabset, setPage);

        ALL(`[data-tab][data-tab-set="${tabset}"]`).forEach(element => {
            const pageName = element.getAttribute('data-tab');
            tabs.set(pageName, element);
            element.addEventListener('click', () => setPage(pageName));
        });

        ALL(`[data-page][data-tab-set="${tabset}"]`).forEach(element => {
            const pageName = element.getAttribute('data-page');
            pages.set(pageName, element);
        });
    });
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

function computeCardGap() {
    const measure = document.createElement('div');
    measure.style = 'width: var(--card-gap-horizontal, 0); height: var(--card-gap-vertical, 0);';
    document.documentElement.appendChild(measure);
    const rect = measure.getBoundingClientRect();
    document.documentElement.removeChild(measure);
    return [rect.width, rect.height];
}

function stringToElement(string) {
    const template = document.createElement('template');
    template.innerHTML = string;
    return template.content.children[0];
}

async function htmlFromUrl(url) {
    const source = await (await fetch(url)).text();
    return stringToElement(source);
}

async function htmlFromFile(file) {
    const source = await textFromFile(file);
    return stringToElement(source);
}

async function extractDataFromHtmlFile(file) {
    const source = await textFromFile(file);
    const html = stringToElement(source);
    return getElementJsonData(ONE('#data', html));
}

function exportProject() {
    setElementJsonData('#data', domino.getData());
    const clone = document.documentElement.cloneNode(true);
    ALL('[data-export-clear]', clone).forEach(element => element.innerHTML = '');
    ALL('[data-export-hide]', clone).forEach(element => element.hidden = true);
    const blob = new Blob([clone.outerHTML], {type: "text/html"});
    const title = ONE('title').innerHTML;
    const name = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    saveAs(blob, `${name}.html`);
}

function getCoordsFromHash() {
    try {
        const coords = location.hash.slice(1).split(',').map(i => parseInt(i) || 0);
        if (coords.length === 2) return coords;
    } catch(e) {}

    return [0, 0];
}

const dropContentPriority = ['text/html', 'text/plain', 'text'];

class Domino {
    constructor() {
        this.cellToView = new CoordStore();
        this.focusedCell = [0, 0];
        this._focus = [0, 0];
        this._scaling = 1;
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

    async runCommand(command) {
        if (command.startsWith('#')) {
            location.href = command;
            domino.focusCell(getCoordsFromHash());
        } else if (command.startsWith('jump:')) {
            location.href = '#' + command.slice(5);
            domino.focusCell(getCoordsFromHash());
        } else if (command.startsWith('open:')) {
            window.open(command.slice(5));
        } else if (command.startsWith('image:')) {
            const src = command.slice(6);
            this.displayImage(src);
        } else if (command.startsWith('display:')) {
            const src = command.slice(8);
            this.display(src);
        } else if (command.startsWith('import:')) {
            const src = command.slice(7);
            const html = await htmlFromUrl(src);
            this.setFromHtml(html);
        } else if (command.length > 0) {
            window.open(command);
        }
    }

    set focus(focus) {
        this._focus = focus;
        this.refreshTransform();
        this.refreshHash();
    }

    get focus() {
        return this._focus;
    }

    set scale(scaling) {
        this._scaling = scaling;
        this.refreshTransform();
    }

    get scale() {
        return this._scaling;
    }

    haltPanningTransition() {
        if (this.scene.classList.contains('skip-transition')) 
            return;

        this.scene.style.transform = window.getComputedStyle(this.scene).transform;
        this.scene.classList.add('skip-transition');
        reflow(this.scene);
        this.scene.classList.remove('skip-transition');
        reflow(this.scene);
    }

    refreshTransform() {
        let [x, y] = this._focus;
        x = Math.round(x);
        y = Math.round(y);
        const s = this._scaling;
        this.scene.style.transform = `scale(${s}) translate(${-x}px, ${-y}px)`;
    }

    refreshHash() {
        const [q, r] = this.grid.pixelToCell(this.focus);
        this.focusedCell = [q, r];
        location.hash = coordsToKey([q, r]);
        this.coords.innerHTML = `#${q},${r}`;
    }

    focusCell(coords) {
        if (this.pan) return;
        this.haltPanningTransition();
        this.focus = this.grid.cellToPixel(coords);
    }

    focusCellNoTransition(coords) {
        this.scene.classList.add('skip-transition');
        this.focusCell(coords);
        reflow(this.scene);
        this.scene.classList.remove('skip-transition');
    }

    spawnCard(card) {
        const view = this.addCard(card);
        view.transition = false;
        reflow(view.root);
        view.transition = true;
        view.triggerSpawnAnimation();
        return view;
    }

    addCard(card) {
        const view = new CardView(card);

        view.root.addEventListener('pointerdown', e => this.onCardPointerDown(view, e));
        view.root.addEventListener('dragstart', e => this.onCardDragStart(view, e));

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

    refreshStyle() {
        this.editorScreen.refreshAvailableStyles();
        const [cw, ch] = computeCardSize(this.scene);
        const [sw, sh] = computeCardGap();
        this.cardSize = [cw, ch];
        this.grid = new HexGrid([cw + sw, ch + sh]);

        this.cellToView.store.forEach(view => {
            this.moveCardToCell(view, view.card.cell);
        });

        this.styleInput.value = ONE('#user-style').innerHTML;
    }

    pointerEventToGridPixel(event) {
        const [x, y] = eventToElementPixel(event, this.scene);
        const pixel = [x / this.scale, y / this.scale];
        return pixel;
    }

    pointerEventToCell(event) {
        const pixel = this.pointerEventToGridPixel(event);
        return this.grid.pixelToCell(pixel);
    }

    clear() {
        this.deselect();
        this.scene.innerHTML = "";
        this.cellToView.store.clear();
        this.focusCell([0, 0]);
    }

    setFromHtml(html) {
        const style = ONE('#user-style', html).innerHTML;
        const data = JSON.parse(ONE('#data', html).innerHTML);
        ONE('title').innerHTML = ONE('title', html).innerHTML;
        ONE('#user-style').innerHTML = style;
        this.refreshStyle();
        this.setData(data);
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
        this.coords = ONE('#coords');
        
        this.styleInput = ONE('#style-input');
        this.refreshStyle();

        // hide fullscreen button if fullscreen is not possible
        if (!document.fullscreenEnabled)
            ONE('#fullscreen').hidden = true;

        this.cardbar = cloneTemplateElement('#cardbar-template');
        this.cardbar.id = 'cardbar';
        this.addDeleteCardIcon = ONE('#add-delete-icon');
        this.aboutScreen = ONE('#menu-screen');
        this.lockedButton = ONE('#locked');
        this.unlockedButton = ONE('#unlocked');

        addListener(this.lockedButton,   'click', () => this.setUnlocked(true));
        addListener(this.unlockedButton, 'click', () => this.setUnlocked(false));

        const cardEditButton = ONE('#edit-card', this.cardbar);
        const importFile = ONE('#import-file');
        const screen = ONE('#pan-screen');

        const onClickedEmptyCell = (event) => {
            killEvent(event);
            this.deselect();
            this.focusCell(this.pointerEventToCell(event));
            this.scale = 1;
        }

        const title = ONE('title');
        const boardTitle = ONE('#board-title');
        const twitterTitle = ONE('#twitter-title');
        boardTitle.addEventListener('input', () => {
            title.innerHTML = boardTitle.value;
            twitterTitle.value = boardTitle.value;
        });
        boardTitle.value = title.innerHTML;

        this.styleInput.addEventListener('input', () => {
            ONE('#user-style').innerHTML = this.styleInput.value;
            this.refreshStyle();
        });

        // clicking listeners
        addListener(cardEditButton, 'click', () => this.editCardView(this.selectedCardView));
        addListener('#center',      'click', () => this.focusCell([0, 0]));
        addListener('#open-about',  'click', () => this.aboutScreen.hidden = false);
        addListener('#reset',       'click', () => this.clear());
        addListener('#import',      'click', () => importFile.click());
        addListener('#export',      'click', () => exportProject());
        addListener('#fullscreen',  'click', () => toggleFullscreen());

        addListener(this.addDeleteCardIcon, 'pointerdown', event => event.stopPropagation());

        const panBlocker = ONE('#pan-blocker');

        this.pan = undefined;
        this.touches = new Map();
        
        addListener('#zoom', 'click', event => {
            this.scale = 1.5 - this.scale;
            killEvent(event);
        });

        const onDown = event => {
            this.pan = {
                scenePosition: this.pointerEventToGridPixel(event),
                distance: 0,
            };
            this.scene.classList.add('skip-transition');
            panBlocker.hidden = false;
            killEvent(event);
        };

        panBlocker.addEventListener('pointerdown', onDown);
        window.addEventListener('pointerdown', onDown);
        
        const onDone = event => {
            panBlocker.hidden = true;
            const click = this.pan && this.pan.distance < 3;
            this.pan = undefined;
            this.scene.classList.remove('skip-transition');
            if (click) 
                onClickedEmptyCell(event);
            killEvent(event);
        };

        panBlocker.addEventListener('pointerup', onDone);
        window.addEventListener('pointerup', onDone);
        
        const onMove = event => {
            if (!this.pan) return;

            // where we clicked in the scene
            const [sx, sy] = this.pan.scenePosition;
            // where we are in the scene now
            const [ax, ay] = this.pointerEventToGridPixel(event);
            // the error
            const [dx, dy] = [sx - ax, sy - ay];
            const [fx, fy] = this.focus;
            this.focus = [fx + dx, fy + dy];
            this.pan.distance += Math.sqrt(dx * dx + dy * dy);

            killEvent(event);
        };

        panBlocker.addEventListener('pointermove', onMove);
        window.addEventListener('pointermove', onMove);

        // file select listener
        addListener(importFile, 'change', async event => {
            const html = await htmlFromFile(event.target.files[0]);
            this.setFromHtml(html);
            importFile.value = null;
        });

        // dragging and dropping listeners
        setElementDragoverDropEffect(screen, 'copy');
        setElementDragoverDropEffect(this.editorScreen.root, 'none');
        setElementDragoverDropEffect(this.addDeleteCardIcon, 'move');

        const onDragFromNewCard = (event) => {
            event.dataTransfer.setData('text/plain', 'new card');
        }

        const onDroppedOnDelete = (event) => {
            killEvent(event);
            if (!event.dataTransfer.types.includes('card/move')) return;
            const originJson = event.dataTransfer.getData('card-origin-cell');
            const view = this.cellToView.get(JSON.parse(originJson));
            this.removeCard(view);
        }

        const dataTransferToImage = async (dt) => {
            if (dt.types.includes('text/html')) {
                const img = stringToElement(dt.getData('text/html'));
                if (img.nodeName === 'IMG') {
                    const dataURL = await compressImageURL(img.src, .2, this.cardSize);
                    const originURL = img.src;
                    return { dataURL, originURL };
                }
            } else if (dt.types.includes('Files')) {
                const url = await dataURLFromFile(dt.files[0]);
                const dataURL = await compressImageURL(url, 0.2, this.cardSize);
                return { dataURL };
            }
        }

        const onDroppedOnCell = async (event) => {
            killEvent(event);
            const dropCell = this.pointerEventToCell(event);
            const dt = event.dataTransfer;

            const amMovingCard = dt.types.includes('card/move');
            const targetView = this.cellToView.get(dropCell);
            const image = await dataTransferToImage(event.dataTransfer);

            if (amMovingCard) {
                const originJson = dt.getData('card-origin-cell');
                const originCell = JSON.parse(originJson);
                this.swapCells(originCell, dropCell);
            } else if (targetView && image) {
                targetView.card.image = image.dataURL;
                targetView.refresh();
            } else if (!targetView) {
                let card = {
                    text: '',
                    type: this.editorScreen.types[0],
                    icons: [],
                    cell: dropCell,
                };

                if (image) {
                    card.image = image.dataURL;
                    if (image.originURL)
                        card.icons.push({ icon: '🔗', 'command': `open:${image.originURL}`});
                    for (let i = card.icons.length; i < 4; ++i)
                        card.icons.push({ icon: '', command: '' });
                } else if (dt.types.includes('text/uri-list')) {
                    const icon = '🔗';
                    const text = dt.getData('text/uri-list');
                    const uris = text.split('\n').filter(uri => !uri.startsWith('#'));
                    const commands = uris.map(uri => uri.startsWith('jump:') ? uri : 'open:' + uri);
                    card.icons = commands.map(command => { return { icon, command }; });
                    for (let i = card.icons.length; i < 4; ++i)
                        card.icons.push({ icon: '', command: '' });
                } else {
                    const types = dt.types;
                    const supported = dropContentPriority.filter(type => types.includes(type));

                    for (let type of supported) {
                        card.text = dt.getData(type);
                        break;
                    }
                }

                const view = this.spawnCard(card);
                this.editorScreen.setActiveView(view);
            }
        }

        addListener(this.addDeleteCardIcon, 'dragstart', onDragFromNewCard);
        addListener(this.editorScreen.root, 'drop', killEvent);
        addListener(this.addDeleteCardIcon, 'drop', onDroppedOnDelete);
        addListener(screen,                 'drop', onDroppedOnCell);

        addListener('#coords', 'pointerdown', e => e.stopPropagation());
        addListener('#coords', 'dragstart', event => {
            event.dataTransfer.setData('text/uri-list', 'jump:' + location.hash.slice(1));
            event.stopPropagation();
        });
    }

    setUnlocked(unlocked) {
        this.unlocked = unlocked;
        this.addDeleteCardIcon.hidden = !unlocked;

        this.lockedButton.hidden = unlocked;
        this.unlockedButton.hidden = !unlocked;

        ALL('[data-card]').forEach(element => {
            element.setAttribute('draggable', unlocked ? 'true' : 'false');
        });
    }
    
    deselect() { this.selectCardView(undefined); }

    editStyle() {
        this.aboutScreen.hidden = true;
        ONE('#about-screen').hidden = false;
        this.styleInput.value = ONE('#user-style').innerHTML;
        this.styleInput.focus();
    }

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

    onCardPointerDown(view, event) {
        if (!this.unlocked) return;
        event.stopPropagation();
    }

    onCardDragStart(view, event) {
        if (!this.unlocked) return;

        event.stopPropagation();
        event.dataTransfer.setData('card-origin-cell', JSON.stringify(view.cell));
        event.dataTransfer.setData('text/plain', view.card.text);
        event.dataTransfer.setData('card/move', '');

        const [x, y] = getElementCenter(view.root);
        event.dataTransfer.setDragImage(view.root, x, y);
    }
}

class CardEditor {
    constructor() {
        this.root = ONE('#editor-screen');
        this.contentInput = ONE('#content-input', this.root);
        this.typeSelect = ONE('#type-select');
        this.typeButtons = {};

        this.refreshAvailableStyles();

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
            this.activeView.refresh();
        }

        for (let row of [1, 2, 3, 4]) {
            const select = ONE(`#editor-icon-select-${row}`, this.root);
            const command = ONE(`#editor-icon-command-${row}`, this.root);
            this.iconRows.push({ select, command });
            addListener(select, 'input', () => refreshIcons());
            addListener(command, 'input', () => refreshIcons());
        }

        this.contentInput.addEventListener('input', () => {
            if (!this.activeView) return;

            this.activeView.card.text = this.contentInput.value;
            this.activeView.refresh();
        });
    }

    get hidden() { return this.root.hidden; }
    set hidden(value) { this.root.hidden = value; }

    refreshAvailableStyles() {
        this.types = findCardStyleNames();
        this.typeSelect.innerHTML = '';

        for (let type of this.types) {
            const button = document.createElement('button');
            button.classList.add('type-button');
            button.innerHTML = type;
            button.setAttribute('title', `change card style to ${type}`);
            this.typeSelect.appendChild(button);

            button.addEventListener('click', () => this.setType(type));
            this.typeButtons[type] = button;
        }
    }

    setActiveView(view) {
        this.activeView = view;
        this.contentInput.select();
        pageSetters.get('card')('text');
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
        this.activeView.refresh();
    }
}

class CardView {
    constructor(card) {
        this._position = [0, 0];
        this._scale = 1;
        this._size = domino.cardSize;
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

    set transition(value) {
        this.root.classList.toggle('skip-transition', !value);
    }

    triggerSpawnAnimation() {
        this.transition = false;
        this.root.style.opacity = 0;
        reflow(this.root);
        this.transition = true;
        this.root.style.opacity = 1;
    }

    updateTransform() {
        const [x, y] = this._position;
        const [w, h] = [this.root.offsetWidth, this.root.offsetHeight];

        const position = `translate(${x - w/2}px, ${y - h/2}px)`;
        const scaling = `scale(${this._scale}, ${this._scale})`;
        this.root.style.transform = `${position} ${scaling}`;
    }

    refresh() {
        const types = domino.editorScreen.types;
        this.root.classList.remove(...types.map(t => `domino-card-${t}`));
        this.root.classList.add(`domino-card-${this.card.type}`);
        this.text.innerHTML = parseFakedown(this.card.text);

        this.root.style.setProperty('background-image', this.card.image ? `url(${this.card.image})` : '');
        this.root.style.setProperty('background-repeat', 'no-repeat');

        this.root.classList.toggle('has-image', !!this.card.image);

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

        this.updateTransform();
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
            ALL('.screen').forEach(e => e.hidden = true);

        const noScreens = ALL('.screen').map(e => e.hidden).reduce((a, b) => a && b);
        if (!noScreens) return;

        if (event.key === 'e') {
            killEvent(event);
            domino.editFocusedCell();
        }

        const [q, r] = domino.focusedCell;
        if (event.key === 'ArrowLeft')  domino.focusCell([q - 1, r + 1]);
        if (event.key === 'ArrowRight') domino.focusCell([q + 1, r - 1]);
        if (event.key === 'ArrowUp')    domino.focusCell([q + 0, r - 1]);
        if (event.key === 'ArrowDown')  domino.focusCell([q + 0, r + 1]);

        if (event.key === ' ') domino.scale = 1.5 - domino.scale;

        if (event.key === 's') {
            const view = domino.cellToView.get(domino.focusedCell);
            if (view)
                say(view.text.innerText);
        }
    });

    window.addEventListener('wheel', event => {
        if (event.deltaY > 0) domino.scale = .5;
        if (event.deltaY < 0) domino.scale = 1;
    });
}
