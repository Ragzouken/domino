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
const clicks = ['pointerdown', 'pointerup', 'click', 'wheel', 'dblclick'];
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

function stringToDocument(string) {
    const template = document.createElement('template');
    template.innerHTML = string;
    return template.content;
}

function stringToElement(string) {
    return stringToDocument(string).children[0];
}

async function htmlFromUrl(url) {
    const source = await (await fetch(url)).text();
    return stringToDocument(source);
}

async function htmlFromFile(file) {
    const source = await textFromFile(file);
    const html = stringToDocument(source);
    return html;
}

async function extractDataFromHtmlFile(file) {
    const source = await textFromFile(file);
    const html = stringToElement(source);
    return getElementJsonData(ONE('#data', html));
}

async function fileToCompressedImage(file) {
    const url = await dataURLFromFile(file);
    const dataURL = await compressImageURL(url, 0.2, domino.cardSize);
    return dataURL;
}

async function dataTransferToImage(dt) {
    const files = filesFromDataTransfer(dt);
    const element = elementFromDataTransfer(dt);
    const originURL = element && element.src; 
    if (files.length > 0) {
        const dataURL = await fileToCompressedImage(files[0]);
        return { dataURL, originURL };
    } else if (element && element.nodeName === 'IMG') {
        const dataURL = await compressImageURL(element.src, .2, domino.cardSize);
        return { dataURL, originURL };
    }
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

    async runCommand(command) {
        if (command.startsWith('#')) {
            location.href = command;
            domino.focusCell(getCoordsFromHash());
        } else if (command.startsWith('jump:')) {
            location.href = '#' + command.slice(5);
            domino.focusCell(getCoordsFromHash());
        } else if (command.startsWith('open:')) {
            window.open(command.slice(5));
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

    focusCell(cell) {
        if (this.pan) return;
        this.haltPanningTransition();
        this.focus = this.grid.cellToPixel(cell);
        this.selectCardView(this.cellToView.get(cell));
    }

    focusCellNoTransition(coords) {
        this.scene.classList.add('skip-transition');
        this.focusCell(coords);
        reflow(this.scene);
        this.scene.classList.remove('skip-transition');
    }

    getOrSpawnCard(cell) {
        const blankCard = { cell, text: '', type: domino.editorScreen.types[0], icons: [] };
        return domino.cellToView.get(cell) || domino.spawnCard(blankCard);
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
        view.root.addEventListener('click', e => this.selectCardView(view));
        view.root.addEventListener('dblclick', e => this.onCardClick(view, e));
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
            this.addCard(card).transition = false;
        reflow(this.scene);
        for (let view of this.cellToView.store.values())
            view.transition = true;
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
        const cardLinkButton = ONE('#link-card', this.cardbar);
        const importFile = ONE('#import-file');
        const screen = ONE('#pan-screen');

        const onClickedCell = (event) => {
            if (this.pan) return;
            if (event.button && event.button === 2) 
                return;
            killEvent(event);
            this.deselect();
            this.focusCell(this.pointerEventToCell(event));
            if (this.unlocked)
                this.editFocusedCell();
            this.scale = 1;
        }

        const title = ONE('title');
        const boardTitle = ONE('#board-title');
        const twitterTitle = ONE('#twitter-title');
        boardTitle.addEventListener('input', () => {
            title.innerHTML = boardTitle.value;
            twitterTitle.setAttribute('value', boardTitle.value);
        });
        boardTitle.value = title.innerHTML;

        this.styleInput.addEventListener('input', () => {
            ONE('#user-style').innerHTML = this.styleInput.value;
            this.refreshStyle();
        });

        // clicking listeners
        addListener(cardEditButton, 'click', e => { killEvent(e); this.editCardView(this.selectedCardView); });
        addListener('#center',      'click', e => { killEvent(e);  this.focusCell([0, 0]); });
        addListener('#open-about',  'click', e => { killEvent(e);  this.aboutScreen.hidden = false; });
        addListener('#reset',       'click', e => this.clear());
        addListener('#import',      'click', e => importFile.click());
        addListener('#export',      'click', e => exportProject());
        addListener('#fullscreen',  'click', e => toggleFullscreen());

        const panBlocker = ONE('#pan-blocker');

        this.pan = undefined;
        this.touches = new Map();
        
        addListener('#zoom', 'click', event => {
            this.toggleZoom();
            killEvent(event);
        });

        const onDown = event => {
            this.pan = {
                scenePosition: this.pointerEventToGridPixel(event),
                pointerId: event.pointerId,
            };
            this.scene.classList.add('skip-transition');
            panBlocker.hidden = false;
            event.stopPropagation();
        };

        panBlocker.addEventListener('pointerdown', onDown);
        window.addEventListener('pointerdown', onDown);
        
        window.addEventListener('dblclick', () => onClickedCell(event));

        const onDonePanning = event => {
            panBlocker.hidden = true;
            this.pan = undefined;
            this.scene.classList.remove('skip-transition');
            event.stopPropagation();
        };

        panBlocker.addEventListener('pointerup', onDonePanning);
        window.addEventListener('pointerup', onDonePanning);
        
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

            killEvent(event);
        };

        panBlocker.addEventListener('pointermove', onMove);
        window.addEventListener('pointermove', onMove);

        // file select listener
        addListener(importFile, 'change', async event => {
            const html = await htmlFromFile(event.target.files[0]);
            this.setFromHtml(html);
            importFile.value = "";
        });

        const setElementDragoverDropEffect = (query, effect) => {
            addListener(query, 'dragover', event => {
                killEvent(event);
                event.dataTransfer.dropEffect = this.unlocked ? effect : 'none';
            });
        }

        // dragging and dropping listeners
        setElementDragoverDropEffect(screen, 'copy');
        setElementDragoverDropEffect(this.editorScreen.root, 'none');
        setElementDragoverDropEffect(cardLinkButton, 'move');

        const onDragFromLinkCard = (event) => {
            const cell = this.selectedCardView.card.cell;
            event.dataTransfer.setData('text/uri-list', 'jump:' + coordsToKey(cell));
            event.stopPropagation();
        }

        const onDragFromNewCard = (event) => {
            event.stopPropagation();
            event.dataTransfer.setData('text/plain', 'new card');
        }

        const onDroppedOnDelete = (event) => {
            killEvent(event);
            if (!event.dataTransfer.types.includes('card/move')) return;
            const originJson = event.dataTransfer.getData('card-origin-cell');
            const view = this.cellToView.get(JSON.parse(originJson));
            this.removeCard(view);
        }
        
        setElementDragoverDropEffect(this.addDeleteCardIcon, 'move');
        addListener(this.addDeleteCardIcon, 'dragstart', onDragFromNewCard);
        addListener(this.addDeleteCardIcon, 'drop',      onDroppedOnDelete);
        addListener(this.addDeleteCardIcon, 'pointerdown', event => event.stopPropagation());

        const onDroppedOnCell = async (event) => {
            killEvent(event);
            const dropCell = this.pointerEventToCell(event);
            const dt = event.dataTransfer;

            const image = await dataTransferToImage(event.dataTransfer);
            const urilist = dt.getData('text/uri-list');

            let view;

            if (image) {
                view = this.putImageInCell(dropCell, image);
            } else if (dt.types.includes('card/copy')) {
                const originJson = dt.getData('card-origin-cell');
                const originCell = JSON.parse(originJson);
                const original = this.cellToView.get(originCell).card;
                const copy = JSON.parse(JSON.stringify(original));
                copy.cell = dropCell;
                this.spawnCard(copy);
            } else if (dt.types.includes('card/move')) {
                const originJson = dt.getData('card-origin-cell');
                const originCell = JSON.parse(originJson);
                view = this.swapCells(originCell, dropCell);
            } else if (urilist) {
                const uris = urilist.split('\n').filter(uri => !uri.startsWith('#'));
                const commands = uris.map(uri => uri.startsWith('jump:') ? uri : 'open:' + uri);
                const icons = commands.map(command => { return {icon: '🔗', command}; });
                view = this.putIconsInCell(dropCell, ...icons);
            } else {
                const text = dt.getData('text') || dt.getData('text/plain');
                if (text)
                view = this.putTextInCell(dropCell, text);
            }

            if (view)
                this.selectCardView(view);
        }

        addListener(cardLinkButton, 'dragstart', onDragFromLinkCard);
        addListener(this.editorScreen.root, 'drop', killEvent);
        addListener(screen,                 'drop', onDroppedOnCell);

        addListener('#coords', 'pointerdown', e => e.stopPropagation());
        addListener('#coords', 'dragstart', event => {
            event.dataTransfer.setData('text/uri-list', 'jump:' + location.hash.slice(1));
            event.stopPropagation();
        });
    }

    setUnlocked(unlocked) {
        this.unlocked = unlocked;

        ALL('[data-locked-visibility]').forEach(element => {
            const hidden = element.getAttribute('data-locked-visibility') === 'hidden';
            element.hidden = (hidden === !unlocked);
        });

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
        const view = this.getOrSpawnCard(this.focusedCell);
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

        if (view)
            view.root.appendChild(this.cardbar);
        else if (this.cardbar.parentElement)
            this.cardbar.parentElement.removeChild(this.cardbar);
    }

    onCardPointerDown(view, event) {
        if (!this.unlocked || event.button === 1) return;
        event.stopPropagation();
    }

    onCardClick(view, event) {
        if (!this.unlocked) return;
        killEvent(event);
        this.selectCardView(view);
        this.focusCell(view.cell);
        this.scale = 1;
        this.editFocusedCell();
    }

    onCardDragStart(view, event) {
        if (!this.unlocked) return;

        event.stopPropagation();
        event.dataTransfer.setData('card-origin-cell', JSON.stringify(view.cell));
        event.dataTransfer.setData('text/plain', view.card.text);
        event.dataTransfer.setData(event.ctrlKey ? 'card/copy' : 'card/move', '');

        const [x, y] = getElementCenter(view.root);
        event.dataTransfer.setDragImage(view.root, x, y);
    }

    putImageInCell(cell, image) {
        const view = this.getOrSpawnCard(cell);
        view.card.image = image.dataURL;
        if (image.originURL)
            this.putIconsInCell(cell, {icon: '🔗', command: 'open:' + image.originURL});
        view.refresh();
        return view;
    }

    putIconsInCell(cell, ...rows) {
        const view = this.getOrSpawnCard(cell);
        view.card.icons = view.card.icons || [];
        for (let i = 0; i < 4; ++i) {
            if (view.card.icons.length === i)
                view.card.icons.push({icon: '', command: ''});
            if (view.card.icons[i].icon === '' && rows.length > 0)
                view.card.icons[i] = rows.shift();
        }
        view.refresh();
        return view;
    }

    putTextInCell(cell, text) {
        const view = this.getOrSpawnCard(cell);
        view.card.text += text;
        view.refresh();
        return view;
    }

    toggleZoom() {
        this.scale = 1.5 - this.scale;
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

        this.altTextInput = ONE('#alt-text');
        this.altTextInput.addEventListener('input', () => {
            this.activeView.card.alt = this.altTextInput.value;
            this.refreshFromCard();
        });

        addListener('#remove-image', 'click', () => {
            this.activeView.card.image = undefined;
            this.activeView.refresh();
            this.refreshFromCard();
        });

        addListener('#upload-image', 'click', () => ONE('#upload-image-input').click());
        addListener('#upload-image-input', 'input', async event => {
            this.activeView.card.image = await fileToCompressedImage(event.target.files[0]);
            event.target.value = "";
            this.activeView.refresh();
            this.refreshFromCard();
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

        ONE('#remove-image').disabled = !this.activeView.card.image;
        this.altTextInput.value = this.activeView.card.alt || "";
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

        Array.from(this.icons.children).forEach((icon, i) => {
            addListener(icon, 'pointerdown', e => e.stopPropagation());
            addListener(icon, 'dblclick', e => e.stopPropagation());
            addListener(icon, 'click', e => { 
                killEvent(e); 
                domino.runCommand(this.card.icons[i].command)
            });
        });

        this.updateContent();
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

    skipTransition() {
        this.transition = false;
        reflow(this.root);
        this.transition = true;
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

    updateContent() {
        for (let type of domino.editorScreen.types)
            this.root.classList.toggle(`domino-card-${type}`, this.card.type === type);

        this.text.innerHTML = parseFakedown(this.card.text);
        this.root.style.setProperty('background-image', this.card.image ? `url(${this.card.image})` : '');
        this.root.classList.toggle('has-image', !!this.card.image);

        (this.card.icons || []).forEach((row, i) => {
            const button = this.icons.children[i];
            button.innerHTML = row.icon;
            button.href = row.command;
            button.classList.toggle('blank', row.icon === '');
            button.classList.toggle('cosmetic', row.command === '');
        });
    }
    
    refresh() {
        this.updateContent();
        this.updateTransform();
    }
}

const domino = new Domino();

async function loaded() {
    setupClassHooks();

    domino.setup();

    window.addEventListener('resize', updateDocumentVariables);
    updateDocumentVariables();

    // no doubleclick on mobile
    DragDropTouch._DBLCLICK = 0;

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

    // image pasting
    window.addEventListener('paste', async event => {
        if (!domino.unlocked) return;
        const image = await dataTransferToImage(event.clipboardData);

        if (image && domino.selectedCardView) {
            const cell = domino.selectedCardView.card.cell;
            domino.putImageInCell(cell, image);
            killEvent(event);
            return;
        }
    });

    // keyboard shortcuts
    window.addEventListener('keydown', event => {
        if (event.key === 'Escape')
            ALL('.screen').forEach(e => e.hidden = true);

        const noScreens = ALL('.screen').map(e => e.hidden).reduce((a, b) => a && b);
        if (!noScreens) return;

        if (event.altKey) {
            if (event.key === 'e') {
                domino.editFocusedCell();
            } else if (event.key === 's') {
                const view = domino.cellToView.get(domino.focusedCell);
                if (view)
                    say((view.card.alt || "") + '.\n' + view.text.innerText);
            }

            killEvent(event);
            return;
        }

        const [q, r] = domino.focusedCell;
        if (event.key === 'ArrowLeft')  domino.focusCell(event.shiftKey ? [q - 1, r + 0] : [q - 1, r + 1]);
        if (event.key === 'ArrowRight') domino.focusCell(event.shiftKey ? [q + 1, r + 0] : [q + 1, r - 1]);
        if (event.key === 'ArrowUp')    domino.focusCell([q + 0, r - 1]);
        if (event.key === 'ArrowDown')  domino.focusCell([q + 0, r + 1]);

        if (event.code === 'KeyQ')  domino.focusCell([q - 1, r + 0]);
        if (event.code === 'KeyW')  domino.focusCell([q + 0, r - 1]);
        if (event.code === 'KeyE')  domino.focusCell([q + 1, r - 1]);
        if (event.code === 'KeyA')  domino.focusCell([q - 1, r + 1]);
        if (event.code === 'KeyS')  domino.focusCell([q + 0, r + 1]);
        if (event.code === 'KeyD')  domino.focusCell([q + 1, r + 0]);

        if (event.key === ' ') domino.toggleZoom();
    });

    window.addEventListener('wheel', event => {
        if (event.deltaY > 0) domino.scale = .5;
        if (event.deltaY < 0) domino.scale = 1;
    });
}
