function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function killEvent(event) {
    event.stopPropagation();
    event.preventDefault();
}

function getDocumentCenter() {
    return [
        document.documentElement.clientWidth / 2, 
        document.documentElement.clientHeight / 2,
    ];
}

function setElementDropEffect(query, effect) {
    addListener(query, 'dragover', event => {
        killEvent(event);
        event.dataTransfer.dropEffect = effect;
    });
}

function queryToElement(query) {
    return (query instanceof Element) ? query : document.querySelector(query);
}

function addListener(query, type, listener) {
    queryToElement(query).addEventListener(type, listener);
}

function addListeners(query, listeners) {
    const element = queryToElement(query);
    Object.keys(listeners)
        .forEach(type => element.addEventListener(type, listeners[type]));
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
