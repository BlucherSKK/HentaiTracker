// ----- markdown.ts -----

// ----- types -----

export interface MarkdownImage {
    name:   string;
    base64: string;
}

// ----- escaping -----

function escMd(s: string): string   { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s: string): string { return s.replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

// ----- image resolution -----

const MIME_BY_EXT: Record<string, string> = {
    png:  'image/png',
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    gif:  'image/gif',
    webp: 'image/webp',
    svg:  'image/svg+xml',
};

function resolveImageSrc(src: string, images: MarkdownImage[]): string {
    const found = images.find(img => img.name === src);
    if (!found) {
        return (src.startsWith('/') || src.startsWith('blob:') || src.startsWith('http') || src.startsWith('data:'))
        ? src
        : `/api/files/${escAttr(src)}`;
    }
    if (found.base64.startsWith('data:')) return found.base64;
    const ext  = found.name.split('.').pop()?.toLowerCase() ?? '';
    const mime = MIME_BY_EXT[ext] ?? 'image/png';
    return `data:${mime};base64,${found.base64}`;
}

// ----- inline render -----

function inlineRender(text: string, images: MarkdownImage[]): string {
    return text
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) =>
    `<img src="${resolveImageSrc(src, images)}" alt="${escAttr(alt)}" class="pc-inline-img">`
    )
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) =>
    `<a href="${escAttr(href)}" target="_blank" rel="noopener">${escMd(label)}</a>`
    );
}

// ----- tables -----

function splitTableRow(line: string): string[] {
    let s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|'))   s = s.slice(0, -1);
    return s.split('|');
}

function isSeparatorRow(line: string): boolean {
    const cells = splitTableRow(line);
    return cells.length > 0 && cells.every(c => /^:?-{1,}:?$/.test(c.trim()));
}

function renderTable(headerCells: string[], bodyRows: string[][], images: MarkdownImage[]): string {
    const head = headerCells.map(c => `<th>${inlineRender(c, images)}</th>`).join('');
    const body = bodyRows.map(row =>
    `<tr>${row.map(c => `<td>${inlineRender(c, images)}</td>`).join('')}</tr>`
    ).join('');
    return `<table class="pc-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// ----- block render -----

function renderBlocks(raw: string, images: MarkdownImage[]): string {
    const lines = raw.split('\n');
    const out: string[] = [];
    let inList = false;
    let inChecklist = false;
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        const heading = line.match(/^(#{1,4})\s+(.+)/);
        if (heading) {
            if (inList)      { out.push('</ul>'); inList = false; }
            if (inChecklist) { out.push('</ul>'); inChecklist = false; }
            const level = heading[1].length;
            out.push(`<h${level}>${escMd(heading[2])}</h${level}>`);
            i++;
            continue;
        }

        if (line.includes('|') && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
            if (inList)      { out.push('</ul>'); inList = false; }
            if (inChecklist) { out.push('</ul>'); inChecklist = false; }
            const headerCells = splitTableRow(line).map(c => c.trim());
            i += 2;
            const bodyRows: string[][] = [];
            while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
                bodyRows.push(splitTableRow(lines[i]).map(c => c.trim()));
                i++;
            }
            out.push(renderTable(headerCells, bodyRows, images));
            continue;
        }

        const chk = line.match(/^- \[( |x)\] (.+)/i);
        if (chk) {
            if (inList) { out.push('</ul>'); inList = false; }
            if (!inChecklist) { out.push('<ul class="pc-checklist">'); inChecklist = true; }
            const checked = chk[1].toLowerCase() === 'x';
            out.push(`<li><input type="checkbox" ${checked ? 'checked' : ''} disabled> ${inlineRender(chk[2], images)}</li>`);
            i++;
            continue;
        }
        const li = line.match(/^- (.+)/);
        if (li) {
            if (inChecklist) { out.push('</ul>'); inChecklist = false; }
            if (!inList) { out.push('<ul class="pc-list">'); inList = true; }
            out.push(`<li>${inlineRender(li[1], images)}</li>`);
            i++;
            continue;
        }
        if (inList)      { out.push('</ul>'); inList = false; }
        if (inChecklist) { out.push('</ul>'); inChecklist = false; }
        if (line.trim() === '') { out.push('<br>'); } else { out.push(`<p>${inlineRender(line, images)}</p>`); }
        i++;
    }
    if (inList)      out.push('</ul>');
    if (inChecklist) out.push('</ul>');
    return out.join('');
}

// ----- public API -----

export function renderMarkdownContainer(containerClass: string, markdown: string, images: MarkdownImage[] = []): string {
    const inner = renderBlocks(markdown, images);
    return `<div class="${escAttr(containerClass)}">${inner}</div>`;
}
