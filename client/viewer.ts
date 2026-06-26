import { renderMarkdownContainer } from './markdown';

const IMAGE_EXT_RE = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i;

interface PostData {
    id?:          number;
    title?:       string | null;
    content:      string;
    tags?:        string | null;
    files?:       string | null;
    time?:        string;
    author_name?: string;
}

function esc(s: string): string {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('ru-RU', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function parseImages(files: string | null | undefined): string[] {
    if (!files) return [];
    try {
        const urls: string[] = JSON.parse(files);
        return urls.filter(u => u.startsWith('blob:') || IMAGE_EXT_RE.test(u));
    } catch { return []; }
}

function spinDonut(canvas: HTMLCanvasElement): () => void {
    const ctx = canvas.getContext('2d')!;
    const cx = canvas.width  / 2;
    const cy = canvas.height / 2;
    const R  = 52;  // outer radius
    const r  = 28;  // inner radius
    const mid = (R + r) / 2;
    const thick = R - r;
    let   angle = 0;
    let   raf   = 0;

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // body
        ctx.beginPath();
        ctx.arc(cx, cy, mid, 0, Math.PI * 2);
        ctx.strokeStyle = '#333';
        ctx.lineWidth   = thick;
        ctx.stroke();

        // bright arc
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(cx, cy, mid, angle, angle + 1.1);
        ctx.strokeStyle = '#c8c8c8';
        ctx.lineWidth   = thick;
        ctx.stroke();

        // soft trailing glow
        ctx.beginPath();
        ctx.arc(cx, cy, mid, angle - 0.6, angle);
        ctx.strokeStyle = '#666';
        ctx.lineWidth   = thick;
        ctx.stroke();

        angle = (angle + 0.05) % (Math.PI * 2);
        raf   = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(raf);
}

export class PostViewer extends HTMLElement {
    private _postId:   number | null            = null;
    private _abort:    AbortController | null   = null;
    private _stopFns:  Array<() => void>        = [];

    get postId(): number | null { return this._postId; }
    set postId(val: number | null) {
        if (this._postId === val && val !== null) return;
        this._postId = val;
        if (this.isConnected) {
            if (val != null) this._load(val);
            else this.innerHTML = '';
        }
    }

    connectedCallback() {
        if (this._postId != null) this._load(this._postId);
    }

    disconnectedCallback() {
        this._abort?.abort();
        this._killDonuts();
    }

    private _killDonuts() {
        this._stopFns.forEach(f => f());
        this._stopFns = [];
    }

    private async _load(postId: number) {
        this._abort?.abort();
        this._abort = new AbortController();
        this._killDonuts();
        this.innerHTML = `<div class="viewer-loading"><div class="loader"></div></div>`;
        try {
            const res = await fetch(`/api/post/${postId}`, { signal: this._abort.signal });
            if (!res.ok) throw new Error('not_found');
            const post: PostData = await res.json();
            if (!this._abort.signal.aborted) {
                this._render(post);
                window.dispatchEvent(new CustomEvent('viewer-loaded', {
                    detail: { id: postId, title: post.title || 'Без названия' }
                }));
            }
        } catch (err: any) {
            if (this._abort?.signal.aborted) return;
            this.innerHTML = `<p class="viewer-error">Ошибка загрузки</p>`;
        }
    }

    private _render(post: PostData) {
        const title  = post.title || 'Без названия';
        const date   = post.time ? fmtDate(post.time) : '';
        const images = parseImages(post.files);

        const tagsHtml = post.tags
            ? post.tags.split(',').map(t => `<span class="viewer-tag">${esc(t.trim())}</span>`).join('')
            : '';

        // canvas placeholders; real images injected after paint
        const imagesHtml = images.length
            ? `<div class="viewer-images">${
                images.map((_,i) =>
                    `<canvas class="viewer-img-donut" data-idx="${i}" width="128" height="128"></canvas>`
                ).join('')
              }</div>`
            : '';

        this.innerHTML = `
            <div class="viewer-scroll">
                <article class="viewer-article">
                    <h1 class="viewer-title">${esc(title)}</h1>
                    <div class="viewer-meta">
                        ${date ? `<span class="viewer-date">${date}</span>` : ''}
                        ${post.author_name ? `<span class="viewer-author">${esc(post.author_name)}</span>` : ''}
                    </div>
                    ${tagsHtml ? `<div class="viewer-tags">${tagsHtml}</div>` : ''}
                    ${imagesHtml}
                    ${renderMarkdownContainer('viewer-content', post.content)}
                </article>
            </div>`;

        this._killDonuts();
        images.forEach((src, i) => {
            const canvas = this.querySelector<HTMLCanvasElement>(`canvas[data-idx="${i}"]`);
            if (!canvas) return;

            const stop = spinDonut(canvas);
            this._stopFns.push(stop);

            const img = new Image();
            img.className = 'viewer-img';
            img.onload = () => {
                stop();
                this._stopFns = this._stopFns.filter(f => f !== stop);
                canvas.replaceWith(img);
            };
            // on error: keep donut spinning
            img.src = src;
        });
    }
}
