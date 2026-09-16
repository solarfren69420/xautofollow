const fs = require('node:fs');
const path = require('node:path');
const { Script } = require('node:vm');
const { minify } = require('terser');

(async () => {
    const input = path.join(__dirname, 'src/xautofollow.user.js');
    const output = path.join(__dirname, 'dist/xautofollow.user.js');
    const source = fs.readFileSync(input, 'utf8');
    const match = source.match(/^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==[^\S\r\n]*/m);
    if (!match || source.slice(0, match.index).trim()) {
        throw new Error('Expected the Tampermonkey metadata block at the start of the source.');
    }
    const header = match[0];
    const body = source.slice(match.index + header.length);
    new Script(body, { filename: input });
    const result = await minify(body, {
        compress: { passes: 3, drop_console: false },
        mangle: true,
        format: { comments: false }
    });
    if (!result.code) throw new Error('Terser produced no output.');
    const built = header + '\n' + result.code + '\n';
    new Script(built, { filename: output });
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output + '.tmp', built);
    fs.renameSync(output + '.tmp', output);
    console.log(`Built dist/xautofollow.user.js: ${Buffer.byteLength(source)} → ${Buffer.byteLength(built)} bytes`);
})().catch(error => {
    console.error(`Build failed: ${error.message}`);
    process.exitCode = 1;
});
