'use strict'

const ONE = (query, element) => (element || document).querySelector(query);
const ALL = (query, element) => Array.from((element || document).querySelectorAll(query));

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const makeCounter = (count=0) => () => count++;
const remToPx = em => emToPx(document.documentElement, em);
const emToPx = (element, em) => Math.round(em * parseFloat(getComputedStyle(element).fontSize));
const setElementJsonData = (element, data) => queryToElement(element).innerHTML = JSON.stringify(data);
const getElementJsonData = (element) => JSON.parse(queryToElement(element).innerHTML);
const reflow = element => void(element.offsetHeight);
const coordsToKey = (coords) => coords.join(',');

function say(text) {
    const utter = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utter);
}

function toggleFullscreen() {
    if (document.fullscreenElement) {
        return document.exitFullscreen();
    } else {
        return document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
}

async function textFromFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => resolve(reader.result);
        reader.readAsText(file); 
    });
}

async function dataURLFromFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file); 
    });
}

function filesFromDataTransfer(dataTransfer) {
    const clipboardFiles = 
        Array.from(dataTransfer.items || [])
        .filter(item => item.kind === 'file')
        .map(item => item.getAsFile());
    return clipboardFiles.concat(...(dataTransfer.files || []));
}

function elementFromDataTransfer(dataTransfer) {
    const html = dataTransfer.getData('text/html');
    return html && stringToElement(html);
}

async function compressImageURL(url, quality, size) {
    const image = document.createElement("img");
    image.crossOrigin = true;
    const canvas = document.createElement("canvas");

    const [tw, th] = size;
    canvas.width = tw;
    canvas.height = th;

    return new Promise((resolve, reject) => {
        image.onload = () => {
            const scale = Math.max(tw / image.width, th / image.height);
            const [fw, fh] = [image.width * scale, image.height * scale];
            const [ox, oy] = [(tw - fw)/2, (th - fh)/2];

            const context = canvas.getContext('2d');
            context.drawImage(image, ox, oy, fw, fh);
            const url = canvas.toDataURL('image/jpeg', quality);

            console.log(`${url.length}B`);
            resolve(url);
        };
        image.onerror = () => resolve(undefined);
        image.src = url;
    });
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function killEvent(event) {
    event.stopPropagation();
    event.preventDefault();
}

function eventToElementPixel(event, element) {
    const rect = element.getBoundingClientRect();
    return [event.clientX - rect.x, event.clientY - rect.y];
}

function getElementCenter(element) {
    return [element.clientWidth / 2, element.clientHeight / 2];
}

function getElementCenterClient(element) {
    const rect = element.getBoundingClientRect();
    return [rect.x + rect.width / 2, rect.y + rect.height / 2];
}

function queryToElement(query) {
    return (query instanceof Element) ? query : ONE(query);
}

function cloneTemplateElement(query) {
    const template = queryToElement(query);
    const clone = template.cloneNode(true);
    clone.removeAttribute('id');
    return clone;
}

function addListener(query, type, listener) {
    queryToElement(query).addEventListener(type, listener);
}

class CoordStore {
    constructor() { this.store = new Map(); }
    get size() { return this.store.size; }
    get(coords) { return this.store.get(coordsToKey(coords)); }
    set(coords, value) { return this.store.set(coordsToKey(coords), value); }
    delete(coords) { return this.store.delete(coordsToKey(coords)); }
    has(coords) { return this.store.has(coordsToKey(coords)); }
}

// based on https://www.redblobgames.com/grids/hexagons/
class HexGrid {
    constructor(cellSize) {
        this.cellSize = cellSize;
    }

    cellToPixel(cellCoords) {
        const [q, r] = cellCoords;
        const [w, h] = this.cellSize;

        const x = q * w;
        const y = (r + q / 2) * h;
        return [x, y];
    }

    pixelToCell(pixelCoords) {
        const [x, y] = pixelCoords;
        const [w, h] = this.cellSize;
        // pixel to axial coordinates
        const q = x / w;
        const r = y / h - q / 2;
        // convert axial to cube coordinates
        const [cx, cy, cz] = [q, r, -q-r];
        // determine rounding error
        let [rx, ry, rz] = [cx, cy, cz].map(Math.round);
        const [dx, dy, dz] = [rx - cx, ry - cy, rz - cz].map(Math.abs);
        // recompute worst coordinate from others
        if (dx > dy && dx > dz) {
            rx = -ry-rz
        } else if (dy > dz) {
            ry = -rx-rz
        } else {
            rz = -rx-ry
        }
        // return axial components
        return [rx, ry];
    }
}
