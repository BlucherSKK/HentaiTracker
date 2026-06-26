import { User } from "./app";
import { bindPostCardClicks, PostCardData, renderPostCard } from "./post-card";
import { HntWsConnection } from "./ws";
import {
    BannerAlg, BANNER_ALGS, BANNER_LABELS,
    attachBanner, detachBanner,
    parseBannerAlg, setBannerInSoftRef,
} from "./banner-alg";

const TAG_LABELS: Record<string, string> = {
    hnt: 'Хентай',
    any: 'Любой',
};

const AVAILABLE_TAGS = Object.keys(TAG_LABELS);

interface ProfileData {
    id:       number;
    name:     string;
    avatar:   string | null;
    tags:     string | null;
    roles:    string | null;
    score:    number;
    soft_ref: string | null;
}

interface PostItem {
    id:      number;
    title:   string | null;
    content: string;
    tags:    string | null;
    files:   string | null;
    time:    string;
}

export class ProfilePage extends HTMLElement {
    private _ws?: HntWsConnection;
    user?: User;
    private _data: ProfileData | null = null;
    private _postCount = 0;
    private _pendingAvatarFile: File | null = null;
    private _pendingAvatarPreview: string | null = null;
    private _isEditing = false;
    private _bannerAlg: BannerAlg | null = null;

    get ws(): HntWsConnection | undefined { return this._ws; }
    set ws(val: HntWsConnection | undefined) {
        this._ws = val;
        if (val && this.isConnected) this._loadProfile();
    }

    connectedCallback() {
        this.render();
        if (this._ws) this._loadProfile();
    }

    disconnectedCallback() {
        this._stopBanner();
    }

    private render() {
        this.innerHTML = `<div id="profile-root" class="page profile"><p class="profile-loading">Загрузка профиля...</p></div>`;
    }

    private _loadProfile() {
        if (!this._ws) return;

        this._ws.once('profile_ok', (_ev, payload) => {
            if (!this.isConnected) return;

            const rawRoles = payload.roles;
            const rolesStr = Array.isArray(rawRoles)
                ? (rawRoles as string[]).join(', ')
                : (rawRoles as string | null) ?? null;

            this._data = {
                id:       payload.id       as number,
                name:     payload.name     as string,
                avatar:   (payload.avatar   ?? null) as string | null,
                tags:     (payload.tags     ?? null) as string | null,
                roles:    rolesStr,
                score:    (payload.score    ?? 0)    as number,
                soft_ref: (payload.soft_ref ?? null) as string | null,
            };
            this._bannerAlg = parseBannerAlg(this._data.soft_ref);
            this._renderPage();
            this._loadPosts();
        });

        this._ws.send('profile_get', {}).catch(console.error);
    }

    private _loadPosts() {
        if (!this._ws || !this._data) return;

        this._ws.once('user_posts', (_ev, payload) => {
            if (!this.isConnected) return;
            const posts = (payload.posts ?? []) as PostItem[];
            this._postCount = posts.length;
            this._updateStats();
            this._renderPosts(posts);
        });

        this._ws.send('user_posts', { limit: 50 }).catch(console.error);
    }

    // ----- render -----

    private _renderPage() {
        if (!this._data) return;
        const root = this.querySelector('#profile-root')!;

        root.innerHTML = `
            <div class="profile-banner" id="profile-banner"></div>
            <div class="profile-panel c-foreign" id="profile-panel">
                ${this._panelHtml()}
            </div>
            <div class="profile-posts-section" id="profile-posts-section">
                <div id="profile-posts-list">
                    <span class="profile-posts-loading">Загрузка постов...</span>
                </div>
            </div>`;

        this._startBanner();
        this._bindEvents();
    }

    private _startBanner() {
        const el = this.querySelector<HTMLElement>('#profile-banner');
        if (!el) return;
        this._stopBanner();
        if (this._bannerAlg) {
            attachBanner(el, this._bannerAlg);
        } else {
            el.innerHTML = '';
        }
    }

    private _stopBanner() {
        const el = this.querySelector<HTMLElement>('#profile-banner');
        if (el) detachBanner(el);
    }

    private _panelHtml(): string {
        return this._isEditing ? this._editPanelHtml() : this._staticPanelHtml();
    }

    private _rolesHtml(roles: string | null): string {
        if (!roles) return '';
        return roles.split(',').map(r => r.trim()).filter(Boolean)
            .map(r => `<span class="profile-role c-foreign">${escHtml(r)}</span>`).join('');
    }

    private static readonly PENCIL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`;
    private static readonly CLOSE_SVG  = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    private static readonly CAMERA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;

    private _staticPanelHtml(): string {
        const d = this._data!;
        const avatarHtml = d.avatar
            ? `<img class="profile-avatar" src="${d.avatar}" alt="avatar">`
            : `<div class="profile-avatar-placeholder">?</div>`;

        return `
            <button class="light-btn b1 btn-icon-edit" id="edit-btn" title="Изменить">${ProfilePage.PENCIL_SVG}</button>
            <div class="profile-panel-left">
                ${avatarHtml}
            </div>
            <div class="profile-panel-right">
                <div class="profile-row-1">
                    <span class="profile-name">${escHtml(d.name)}</span>
                    <span class="profile-handle">ID: ${d.id}</span>
                </div>
                <div class="profile-row-2">
                    <div class="profile-roles-row c-insert">${this._rolesHtml(d.roles)}</div>
                    <div class="profile-tags-row c-insert">${this._displayTagsHtml()}</div>
                    <div class="profile-stats" id="profile-stats">
                        <span class="profile-stat"><b>${this._postCount}</b> постов</span>
                        <span class="profile-stat"><b>${d.score}</b> очков</span>
                    </div>
                </div>
            </div>`;
    }

    private _displayTagsHtml(): string {
        const d = this._data!;
        if (!d.tags) return '';
        return d.tags.split(',').map(t => t.trim()).filter(Boolean)
            .map(t => `<span class="profile-tag-chip c-foreign">${escHtml(TAG_LABELS[t] ?? t)}</span>`)
            .join('');
    }

    private _editPanelHtml(): string {
        const d = this._data!;
        const currentTags = d.tags ? d.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
        const tagsHtml = AVAILABLE_TAGS.map(tag => `
            <label class="profile-tag-label">
                <input type="checkbox" class="tag-cb" value="${tag}" ${currentTags.includes(tag) ? 'checked' : ''}>
                <span>${TAG_LABELS[tag]}</span>
            </label>`).join('');

        const bannerHtml = [null, ...BANNER_ALGS].map(alg => {
            const active = this._bannerAlg === alg ? 'c-foreign-force-act' : '';
            const label  = alg ? BANNER_LABELS[alg] : 'Нет';
            return `<button class="btn-1 ${active}" data-banner="${alg ?? ''}">${label}</button>`;
        }).join('');

        const avatarSrc = this._pendingAvatarPreview ?? d.avatar;
        const avatarHtml = avatarSrc
            ? `<img class="profile-avatar" src="${avatarSrc}" alt="avatar">`
            : `<div class="profile-avatar-placeholder">?</div>`;

        return `
            <button class="light-btn b1 btn-icon-edit" id="edit-btn" title="Отмена">${ProfilePage.CLOSE_SVG}</button>
            <div class="profile-panel-left">
                <div class="avatar-wrap">
                    ${avatarHtml}
                    <button class="light-btn b1 avatar-change-btn" id="avatar-btn" title="Сменить аватар">${ProfilePage.CAMERA_SVG}</button>
                </div>
                <input type="file" id="avatar-file" accept="image/*" hidden>
            </div>
            <div class="profile-panel-right">
                <div class="profile-row-1">
                    <span class="profile-name">${escHtml(d.name)}</span>
                    <span class="profile-handle">ID: ${d.id}</span>
                    <button class="btn-1" id="save-btn">Сохранить</button>
                    <span class="profile-status" id="profile-status"></span>
                </div>
                <div class="profile-row-2">
                    <div class="profile-roles-row c-insert">${this._rolesHtml(d.roles)}</div>
                </div>
                <div class="profile-section-title">Теги</div>
                <div class="profile-tags-grid">${tagsHtml}</div>
                <div class="profile-section-title">Баннер</div>
                <div class="profile-banner-selector">${bannerHtml}</div>
            </div>`;
    }

    private _updateStats() {
        const el = this.querySelector('#profile-stats');
        if (!el || !this._data) return;
        el.innerHTML = `
            <span class="profile-stat"><b>${this._postCount}</b> постов</span>
            <span class="profile-stat"><b>${this._data.score}</b> очков</span>`;
    }

    private _renderPosts(posts: PostItem[]) {
        const list = this.querySelector<HTMLElement>('#profile-posts-list');
        if (!list) return;
        if (!posts.length) {
            list.innerHTML = `<span class="profile-posts-empty">Постов пока нет</span>`;
            return;
        }
        list.innerHTML = posts.map(post => renderPostCard(post as PostCardData, 'profile')).join('');
        bindPostCardClicks(list);
    }

    // ----- events -----

    private _bindEvents() {
        const editBtn = this.querySelector<HTMLButtonElement>('#edit-btn');
        if (editBtn) {
            editBtn.onclick = () => {
                if (!this._isEditing) {
                    this._isEditing = true;
                } else {
                    // cancel — restore saved banner
                    this._isEditing = false;
                    this._bannerAlg = parseBannerAlg(this._data?.soft_ref ?? null);
                    this._startBanner();
                    if (this._pendingAvatarPreview) {
                        URL.revokeObjectURL(this._pendingAvatarPreview);
                        this._pendingAvatarPreview = null;
                        this._pendingAvatarFile    = null;
                    }
                }
                const panel = this.querySelector('#profile-panel');
                if (panel) { panel.innerHTML = this._panelHtml(); this._bindEvents(); }
            };
        }

        // banner selector buttons
        this.querySelectorAll<HTMLButtonElement>('[data-banner]').forEach(btn => {
            btn.onclick = () => {
                const val = btn.dataset.banner;
                this._bannerAlg = val ? val as BannerAlg : null;
                this._startBanner();
                // update active state
                this.querySelectorAll<HTMLButtonElement>('[data-banner]').forEach(b => {
                    b.classList.toggle('c-foreign-force-act', b.dataset.banner === (val ?? ''));
                });
            };
        });

        const avatarBtn = this.querySelector<HTMLButtonElement>('#avatar-btn');
        if (avatarBtn) {
            avatarBtn.onclick = () => (this.querySelector('#avatar-file') as HTMLInputElement)?.click();
        }

        const avatarFile = this.querySelector<HTMLInputElement>('#avatar-file');
        if (avatarFile) {
            avatarFile.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;
                if (this._pendingAvatarPreview) URL.revokeObjectURL(this._pendingAvatarPreview);
                this._pendingAvatarFile    = file;
                this._pendingAvatarPreview = URL.createObjectURL(file);
                const left = this.querySelector('.profile-panel-left');
                if (left) {
                    const img = left.querySelector('.profile-avatar, .profile-avatar-placeholder');
                    if (img) img.outerHTML = `<img class="profile-avatar" src="${this._pendingAvatarPreview}" alt="avatar">`;
                }
            };
        }

        const saveBtn = this.querySelector<HTMLButtonElement>('#save-btn');
        if (saveBtn) saveBtn.onclick = () => this._save();
    }

    // ----- save -----

    private async _save() {
        if (!this._ws || !this._data) return;
        const status = this.querySelector('#profile-status') as HTMLElement;
        const btn    = this.querySelector('#save-btn')       as HTMLButtonElement;
        if (!status || !btn) return;

        btn.disabled = true;

        const checked  = Array.from(this.querySelectorAll('.tag-cb:checked')) as HTMLInputElement[];
        const tags     = checked.map(el => el.value).join(',');
        const soft_ref = setBannerInSoftRef(this._data.soft_ref, this._bannerAlg);
        const payload: Record<string, unknown> = { tags, soft_ref };

        if (this._pendingAvatarFile) {
            try {
                payload.avatar = await this._uploadAvatar(this._pendingAvatarFile);
            } catch (err: any) {
                status.textContent = `Ошибка загрузки аватара: ${err.message}`;
                btn.disabled = false;
                return;
            }
        }

        const cleanup: Array<() => void> = [];
        const done = () => { cleanup.forEach(f => f()); btn.disabled = false; };

        const offOk = this._ws.once('profile_updated', (_ev, p) => {
            done();
            if (!this.isConnected) return;
            if (this._data) {
                this._data.tags     = p.tags     as string | null;
                this._data.avatar   = p.avatar   as string | null;
                this._data.soft_ref = (p.soft_ref ?? this._data.soft_ref) as string | null;
            }
            if (this._pendingAvatarPreview) {
                URL.revokeObjectURL(this._pendingAvatarPreview);
                this._pendingAvatarPreview = null;
            }
            this._pendingAvatarFile = null;
            this._isEditing = false;
            status.textContent = 'Сохранено!';
            setTimeout(() => {
                if (!this.isConnected) return;
                const panel = this.querySelector('#profile-panel');
                if (panel) { panel.innerHTML = this._panelHtml(); this._bindEvents(); }
            }, 800);
        });

        const offErr = this._ws.once('error', (_ev, p) => {
            done();
            if (!this.isConnected) return;
            status.textContent = `Ошибка: ${p.code}`;
        });

        cleanup.push(offOk, offErr);
        this._ws.send('profile_update', payload).catch(err => {
            done();
            if (this.isConnected) status.textContent = `Ошибка: ${err}`;
        });
    }

    // ----- upload -----

    private async _uploadAvatar(file: File): Promise<string> {
        const token = await new Promise<string>((resolve, reject) => {
            const unsub = this._ws!.once('upload_token', (_ev, p) => {
                clearTimeout(timer);
                resolve(p.token as string);
            });
            const timer = setTimeout(() => { unsub(); reject(new Error('upload_token timeout')); }, 8_000);
            this._ws!.send('get_upload_token', {}).catch(err => { clearTimeout(timer); unsub(); reject(err); });
        });

        const fd = new FormData();
        fd.append('token', token);
        fd.append('file',  file);

        const res  = await fetch('/api/upload', { method: 'POST', body: fd });
        const json = await res.json() as { url?: string; error?: string };
        if (json.url) return json.url;
        throw new Error(json.error ?? 'upload_failed');
    }
}

function escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
