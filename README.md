# domino

tools for developing the tool "domino"

## how to get started

### install developer dependencies
install `pug-cli` (used to bundle everything into a single page according to the
`index.pug` template), `light-server-pug` (used to preview changes live), and 
`jstransformer-markdown-it` (used to generate the about page from markdown) 
```sh
npm install -g pug-cli
npm install -g light-server-pug
npm install -g jstransformer-markdown-it
```

### developer scripts
run a local server that loads the standalone domino page and refreshes it 
whenever you make changes:
```
./serve.cmd
```

build the standalone domino page to `dist/index.html`
```
./build.cmd
```

## license
[MIT License](./LICENSE);
