import { rep } from "./languge";

const CLOSE_MINI = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

export interface ViewerTab { id: number; title: string; }

export class AppNav extends HTMLElement {

    static get observedAttributes() {
        return ['data-link', 'data-user-roles', 'data-user-id', 'data-viewer-tabs', 'data-viewer-active'];
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        if (oldValue !== newValue) this.render();
    }

    connectedCallback() {
        this.render();
    }

    private _bindRefresh() {
        this.querySelector('#nav-refresh-btn')?.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('feed-refresh'));
        });
    }

    private _bindViewerTabs() {
        this.querySelectorAll<HTMLElement>('[data-viewer-id]').forEach(el => {
            el.addEventListener('click', e => {
                const closeBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-close-viewer]');
                if (closeBtn) {
                    e.stopPropagation();
                    const vid = Number(closeBtn.dataset.closeViewer);
                    window.dispatchEvent(new CustomEvent('close-viewer', { detail: { id: vid } }));
                } else {
                    const vid = Number(el.dataset.viewerId);
                    window.dispatchEvent(new CustomEvent('app-navigate', {
                        detail: { page: 'viewer', viewerId: vid }
                    }));
                }
            });
        });
    }

    render() {
        const rolesStr   = this.getAttribute('data-user-roles') || '';
        const roles      = rolesStr.split(',').map(r => r.trim()).filter(Boolean);
        const isAdmin    = roles.includes('admin');
        const canPost    = roles.some(r => r === 'admin' || r === 'force_posting');
        const isAuth     = !!this.getAttribute('data-user-id');
        const page       = this.getAttribute('data-link') || 'feeds';
        const activeVid  = this.getAttribute('data-viewer-active') || '';

        let viewerTabs: ViewerTab[] = [];
        try { viewerTabs = JSON.parse(this.getAttribute('data-viewer-tabs') || '[]'); } catch {}

        const btn = (link: string, label: string) =>
            `<button class="${page === link ? 'btn-selected' : 'btn b1'}" data-link="${link}">${label}</button>`;

        const viewerTabsHtml = viewerTabs.map(tab => {
            const isActive = activeVid === String(tab.id);
            const label = tab.title.length > 20 ? tab.title.slice(0, 20) + '…' : tab.title;
            return `<div class="viewer-nav-tab ${isActive ? 'viewer-nav-tab--active' : ''}" data-viewer-id="${tab.id}">
                <span class="viewer-nav-title">${label}</span>
                <button class="viewer-nav-close" data-close-viewer="${tab.id}" title="Закрыть">${CLOSE_MINI}</button>
            </div>`;
        }).join('');

        this.innerHTML = `
        <div class="tab-btns">
            <div class='left-pane'>
                ${btn('dm',    'личка')}
                ${btn('chats', 'чаты')}
                ${btn('feeds', 'лента')}
                ${canPost && page === 'feeds' ? btn('post-create', '+ пост') : ''}
                ${page === 'feeds' ? `<button class="btn nav-refresh-btn" id="nav-refresh-btn" title="Обновить ленту">↻</button>` : ''}
            </div>
            ${viewerTabsHtml}
            <div class="right-pane">
                ${isAuth && page == "profile" ? btn('profile', rep("btn-profile")) : ''}
                ${isAuth ? btn('settings', 'настройки') : ''}
                ${isAdmin ? btn('terminal', 'терминал') : ''}
            </div>
        </div>`;

        this._bindRefresh();
        this._bindViewerTabs();
    }
}
