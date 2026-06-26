// ----- types -----

export type BannerAlg = 'matrix' | 'doom';

export const BANNER_ALGS: BannerAlg[] = ['matrix', 'doom'];

export const BANNER_LABELS: Record<BannerAlg, string> = {
    matrix: 'Matrix',
    doom:   'Doom Fire',
};

// ----- doom palette (RGB) -----

const DOOM_PAL: [number, number, number][] = [
    [7,7,7],[31,7,7],[47,15,7],[71,15,7],[87,23,7],[103,31,7],[119,31,7],[143,39,7],
    [159,47,7],[175,63,7],[191,71,7],[199,71,7],[223,79,7],[223,87,7],[223,87,7],
    [215,95,7],[215,103,15],[207,111,15],[207,119,15],[207,127,15],[207,135,23],
    [199,135,23],[199,143,23],[199,151,31],[191,159,31],[191,159,31],[191,167,39],
    [191,167,39],[191,175,47],[183,175,47],[183,183,47],[183,183,55],
    [207,207,111],[223,223,159],[239,239,199],[255,255,255],
];

// ----- matrix chars -----

const MTX_CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789';

// ----- runners -----

function runMatrix(canvas: HTMLCanvasElement): () => void {
    const ctx   = canvas.getContext('2d')!;
    const W     = canvas.width;
    const H     = canvas.height;
    const FS    = 14;
    const COLS  = Math.floor(W / FS);
    let alive   = true;
    let raf: number;

    const drops = Array.from({ length: COLS }, () => Math.floor(Math.random() * (H / FS)));

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    const tick = () => {
        if (!alive) return;
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        ctx.fillRect(0, 0, W, H);
        ctx.font = `${FS}px monospace`;
        for (let i = 0; i < COLS; i++) {
            const ch = MTX_CHARS[Math.floor(Math.random() * MTX_CHARS.length)];
            const x  = i * FS;
            const y  = drops[i] * FS;
            ctx.fillStyle = '#fff';
            ctx.fillText(ch, x, y);
            ctx.fillStyle = '#00ff41';
            if (drops[i] * FS > H && Math.random() > 0.975) drops[i] = 0;
            drops[i]++;
        }
        raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(raf); };
}

function runDoom(canvas: HTMLCanvasElement): () => void {
    const ctx   = canvas.getContext('2d')!;
    const W     = canvas.width;
    const H     = canvas.height;
    const MAX   = DOOM_PAL.length - 1;
    const fire  = new Uint8Array(W * H);
    let alive   = true;
    let raf: number;

    for (let x = 0; x < W; x++) fire[(H - 1) * W + x] = MAX;

    const img = ctx.createImageData(W, H);

    const spread = (src: number) => {
        const v = fire[src];
        if (v === 0) { if (src >= W) fire[src - W] = 0; return; }
        const r   = (Math.random() * 3) | 0;
        const dst = src - W - r + 1;
        if (dst >= 0 && dst < W * H) fire[dst] = Math.max(0, v - (r & 1));
    };

    const tick = () => {
        if (!alive) return;
        for (let y = 1; y < H; y++)
            for (let x = 0; x < W; x++)
                spread(y * W + x);

        const d = img.data;
        for (let i = 0; i < W * H; i++) {
            const [r, g, b] = DOOM_PAL[fire[i]] ?? [0, 0, 0];
            d[i * 4]     = r;
            d[i * 4 + 1] = g;
            d[i * 4 + 2] = b;
            d[i * 4 + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(raf); };
}

// ----- soft_ref helpers -----

export function parseBannerAlg(softRef: string | null): BannerAlg | null {
    if (!softRef) return null;
    const m = softRef.match(/(?:^|;)\s*background\s*=\s*alg\((\w+)\)/);
    if (!m) return null;
    const alg = m[1] as BannerAlg;
    return BANNER_ALGS.includes(alg) ? alg : null;
}

export function setBannerInSoftRef(softRef: string | null, alg: BannerAlg | null): string {
    const units = (softRef ?? '').split(';')
        .map(u => u.trim())
        .filter(u => u && !/^background\s*=/.test(u));
    if (alg) units.unshift(`background=alg(${alg})`);
    return units.join('; ');
}

// ----- attach / detach -----

const STOP_KEY = '__bannerStop';

export function attachBanner(el: HTMLElement, alg: BannerAlg): void {
    detachBanner(el);

    const w = Math.max(el.clientWidth, 300);
    const h = Math.max(el.clientHeight, 60);

    const canvas = document.createElement('canvas');

    if (alg === 'doom') {
        canvas.width  = Math.floor(w / 3);
        canvas.height = Math.floor(h / 3);
        canvas.style.imageRendering = 'pixelated';
    } else {
        canvas.width  = w;
        canvas.height = h;
    }

    canvas.style.cssText += ';position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';

    if (!el.style.position || el.style.position === 'static') el.style.position = 'relative';
    el.innerHTML = '';
    el.appendChild(canvas);

    (el as any)[STOP_KEY] = alg === 'doom' ? runDoom(canvas) : runMatrix(canvas);
}

export function detachBanner(el: HTMLElement): void {
    const stop = (el as any)[STOP_KEY] as (() => void) | undefined;
    if (stop) { stop(); delete (el as any)[STOP_KEY]; }
    el.innerHTML = '';
}
