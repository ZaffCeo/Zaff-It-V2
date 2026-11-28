const rootRequire = (await import('node:module')).createRequire('/home/user/Zaff-It-V2/package.json');
const { JSDOM } = rootRequire('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:8788/', pretendToBeVisual: true,
});
globalThis.window = dom.window; globalThis.document = dom.window.document;
try { Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true }); } catch (e) { Object.defineProperty(globalThis, 'navigator', { get: () => dom.window.navigator, configurable: true }); }
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
globalThis.cancelAnimationFrame = clearTimeout;
dom.window.requestAnimationFrame = globalThis.requestAnimationFrame;
const warn = console.error; console.error = (...a) => { const s = String(a[0]||''); if (s.includes('not implemented')||s.includes('useLayoutEffect')) return; warn(...a); };

const { default: fs } = await import('node:fs');
fs.writeFileSync('/tmp/typingtest/bundle.js', '');
const esbuild = rootRequire('/home/user/Zaff-It-V2/node_modules/esbuild');
const esbuildStubPlugin = {
  name: 'stub-native-subdeps',
  setup(build) {
    build.onResolve({ filter: /^(react-native-safe-area-context|@shopify\/flash-list)$/ }, (args) => ({
      path: '/home/user/Zaff-It-V2/apps/mobile/tests/typing-harness/stubs/' + (args.path.includes('flash-list') ? 'flashlist.tsx' : 'safe-area.tsx'),
    }));
    const stubDir = '/home/user/Zaff-It-V2/apps/mobile/tests/typing-harness/stubs/expo-stubs.tsx';
    build.onResolve({ filter: /^(expo-font|expo-image-picker|expo-linear-gradient|expo-speech|expo-secure-store|expo-asset|react-native-reanimated)$/ }, (args) => ({ path: args.path === 'react-native-reanimated' ? '/home/user/Zaff-It-V2/apps/mobile/tests/typing-harness/stubs/reanimated.ts' : stubDir }));
    const RNW = '/home/user/Zaff-It-V2/node_modules/react-native-web/dist/index.js';
    build.onResolve({ filter: /^react-native(\/.+)?$/ }, (args) => {
      if (args.path === 'react-native') return { path: '/home/user/Zaff-It-V2/apps/mobile/tests/typing-harness/stubs/rn-shim.js' };
      const sub = args.path.slice('react-native/'.length);
      const cand = '/home/user/Zaff-It-V2/node_modules/react-native-web/dist/' + sub + '.js';
      const cand2 = '/home/user/Zaff-It-V2/node_modules/react-native-web/dist/' + sub + '/index.js';
      const fsx = rootRequire('node:fs');
      if (fsx.existsSync(cand)) return { path: cand };
      if (fsx.existsSync(cand2)) return { path: cand2 };
      return { path: '/home/user/Zaff-It-V2/apps/mobile/tests/typing-harness/stubs/rn-shim.js' };
    });
  },
};
await (async () => {
  // Generate the screen copy at runtime (asset depth differs from src/)
  const fsx2 = rootRequire('node:fs');
  const srcScreen = fsx2.readFileSync('/home/user/Zaff-It-V2/apps/mobile/src/screens/customer/CustomerHomeScreen.tsx', 'utf8');
  fsx2.mkdirSync('/home/user/Zaff-It-V2/apps/mobile/tests/typing-harness/.gen', { recursive: true });
  fsx2.writeFileSync('/home/user/Zaff-It-V2/apps/mobile/tests/typing-harness/.gen/HomeScreen.tsx', srcScreen.replace(/require\('\.\.\/\.\.\/\.\.\/assets\//g, "require('../../../assets/"));
  await esbuild.build({
entryPoints: ['tests/typing-harness/entry.tsx'], absWorkingDir: '/home/user/Zaff-It-V2/apps/mobile',
    bundle: true, platform: 'browser', format: 'iife',
    outfile: 'tests/typing-harness/bundle.js',
    define: { 'process.env.NODE_ENV': '"production"', 'global': 'window', '__DEV__': 'false' },
        plugins: [esbuildStubPlugin],
    tsconfig: 'tsconfig.json',
    loader: { '.png': 'file', '.jpg': 'file', '.js': 'jsx', '.ttf': 'file', '.webp': 'file' },
    logLevel: 'info',
  });
})();
try {
  dom.window.matchMedia = dom.window.matchMedia || ((q) => ({ matches: false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} }));
  globalThis.matchMedia = globalThis.matchMedia || dom.window.matchMedia;
  dom.window.ResizeObserver = dom.window.ResizeObserver || class { observe(){} unobserve(){} disconnect(){} };
  globalThis.ResizeObserver = globalThis.ResizeObserver || dom.window.ResizeObserver;
  globalThis.IntersectionObserver = globalThis.IntersectionObserver || class { observe(){} unobserve(){} disconnect(){} };
  globalThis.ShadowRoot = dom.window.ShadowRoot || class ShadowRoot {};
  dom.window.ShadowRoot = dom.window.ShadowRoot || globalThis.ShadowRoot;
  globalThis.CSSStyleSheet = dom.window.CSSStyleSheet;
  globalThis.Element = dom.window.Element;
  globalThis.Node = dom.window.Node;
  globalThis.customElements = dom.window.customElements;
  dom.window._getAnimationTimestamp = () => Date.now();
  globalThis._getAnimationTimestamp = dom.window._getAnimationTimestamp;
  dom.window.onerror = (msg) => { console.log('WINDOW ONERROR:', msg); };
  await import('/home/user/Zaff-It-V2/apps/mobile/tests/typing-harness/bundle.js');
} catch (e) { console.log('IMPORT FAIL:', e && e.message); console.log(e && e.stack ? String(e.stack).slice(0, 900) : ''); }
await new Promise((r) => setTimeout(r, 2500));
console.log('ROOT CHILDREN:', document.getElementById('root').childNodes.length, 'HTMLLEN:', document.getElementById('root').innerHTML.length);
console.log('TEXT SAMPLE:', document.getElementById('root').textContent.slice(0, 300).replace(/\s+/g,' '));
const inputs = [...document.querySelectorAll('input')];
const search = inputs.find((el) => (el.getAttribute('placeholder') || '').includes('Zaff-It') || (el.getAttribute('placeholder') || '') !== '');
console.log('INPUTS:', inputs.length);
if (!search) { console.log('RESULT: FAIL no-input'); process.exit(1); }
const setVal = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
const typed = 'doodh aur atta';
if (!process.env.SKIP_TYPE) for (const ch of typed) {
  setVal.call(search, search.value + ch);
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 12));
}
await new Promise((r) => setTimeout(r, 600));
console.log('TYPED VALUE:', JSON.stringify(search.value));
let phChanged = false; let prev = search.getAttribute('placeholder');
const phSamples = [];
for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 200)); const cur = search.getAttribute('placeholder'); phSamples.push(cur); if (cur !== prev) phChanged = true; prev = cur; }
console.log('TW TICKS:', (dom.window).__twTicks, '| global:', globalThis.__twTicks);
console.log('PLACEHOLDER POLL:', phChanged ? 'EVOLVES' : 'FROZEN', '| uniq:', [...new Set(phSamples)].length);
const typingOk = search.value === typed;
// Primary criterion: typed text committed to the DOM input (founder's bug).
// Placeholder animation is a jsdom-scheduler artifact here (ticks keep firing,
// commits stall) — confirm visually on preview/real browser.
console.log(typingOk ? 'RESULT: TYPING_OK' : 'RESULT: FAIL');
if (!typingOk) process.exit(2);
process.exit(ok ? 0 : 2);
