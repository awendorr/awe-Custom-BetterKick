// content.js

let videoElement = null;
let enhancerPanel = null;

const msg = (key) => {
    if (typeof chrome !== 'undefined' && chrome.i18n) {
        return chrome.i18n.getMessage(key) || key;
    }
    return key;
};

const builtinPresets = {
    [msg("preset_default") || "Varsayılan"]: { brightness: 100, contrast: 100, saturate: 100, sepia: 0, hue: 0, grayscale: 0, invert: 0, blur: 0, blackLevel: 0 },
    [msg("preset_nightVision") || "Gece Görüşü"]: { brightness: 120, contrast: 85, saturate: 110, sepia: 0, hue: 0, grayscale: 0, invert: 0, blur: 0, blackLevel: 15 },
    [msg("preset_cinematic") || "Sinematik"]: { brightness: 90, contrast: 120, saturate: 130, sepia: 15, hue: 0, grayscale: 0, invert: 0, blur: 0, blackLevel: 0 },
    [msg("preset_vibrant") || "Canlı Renkler"]: { brightness: 100, contrast: 110, saturate: 150, sepia: 0, hue: 0, grayscale: 0, invert: 0, blur: 0, blackLevel: 0 },
    [msg("preset_custom") || "Özel"]: {}
};

let state = {
    playbackRate: 1,
    brightness: 100,
    contrast: 100,
    saturate: 100,
    sepia: 0,
    hue: 0,
    grayscale: 0,
    invert: 0,
    blur: 0,
    blackLevel: 0,
    zoom: 1,
    panX: 0,
    panY: 0,
    scrollZoomEnabled: true,
    adaptiveSpeed: true,
    hoverSize: 2,
    themeColor: '#53fc18',
    activePreset: msg("preset_default") || "Varsayılan",
    customPresets: {}
};

function saveState() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ kickEnhancerState: state });
    }
}

function loadState(callback) {
    if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(['kickEnhancerState'], (result) => {
            if (result.kickEnhancerState) {
                state = { ...state, ...result.kickEnhancerState };
            }
            callback();
        });
    } else {
        callback();
    }
}

// Variables for panning
let isDragging = false;
let startX, startY;

function getStripeColor(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    let r = parseInt(hex.substring(0,2), 16);
    let g = parseInt(hex.substring(2,4), 16);
    let b = parseInt(hex.substring(4,6), 16);
    
    let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    
    let mixFactor = 0.4; // %40 oranında karıştır
    let textColor = '#000000';
    if (lum > 200) {
        // Renk çok parlaksa/beyazsa koyulaştır (badge arka planı koyu olacak, yazı beyaz olmalı)
        r = Math.round(r * (1 - mixFactor));
        g = Math.round(g * (1 - mixFactor));
        b = Math.round(b * (1 - mixFactor));
        textColor = '#ffffff';
    } else {
        // Normal/koyu bir renkse beyazlat (badge açık renk olacak, yazı siyah olmalı)
        r = Math.round(r + (255 - r) * mixFactor);
        g = Math.round(g + (255 - g) * mixFactor);
        b = Math.round(b + (255 - b) * mixFactor);
        textColor = '#000000';
    }
    return { bg: `rgb(${r}, ${g}, ${b})`, text: textColor };
}

function waitForVideo() {
    return new Promise((resolve) => {
        const check = () => {
            const video = document.querySelector('video');
            if (video) {
                resolve(video);
            } else {
                setTimeout(check, 500);
            }
        };
        check();
    });
}

function injectSVGFilter() {
    let svgContainer = document.getElementById('kick-enhancer-svg-filters');
    if (!svgContainer) {
        svgContainer = document.createElement('div');
        svgContainer.id = 'kick-enhancer-svg-filters';
        svgContainer.style.display = 'none';
        document.body.appendChild(svgContainer);
    }
    
    const intercept = state.blackLevel / 100;
    const slope = 1 - intercept;
    
    svgContainer.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg">
            <filter id="kick-enhancer-night-vision">
                <feComponentTransfer>
                    <feFuncR type="linear" slope="${slope}" intercept="${intercept}"/>
                    <feFuncG type="linear" slope="${slope}" intercept="${intercept}"/>
                    <feFuncB type="linear" slope="${slope}" intercept="${intercept}"/>
                </feComponentTransfer>
            </filter>
        </svg>
    `;
}

function applyStyles() {
    if (!videoElement) return;

    injectSVGFilter();

    let cssFilter = `brightness(${state.brightness}%) contrast(${state.contrast}%) saturate(${state.saturate}%) sepia(${state.sepia}%) hue-rotate(${state.hue}deg) grayscale(${state.grayscale}%) invert(${state.invert}%) blur(${state.blur}px)`;
    
    if (state.blackLevel > 0) {
        cssFilter += ` url(#kick-enhancer-night-vision)`;
    }

    videoElement.style.filter = cssFilter;
    videoElement.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    videoElement.style.transformOrigin = 'center center';
    videoElement.style.transition = isDragging ? 'none' : 'transform 0.2s ease, filter 0.2s ease';

    if (state.zoom > 1) {
        videoElement.classList.add('kick-enhancer-zoomed');
    } else {
        videoElement.classList.remove('kick-enhancer-zoomed');
    }
}

async function updateFavicon() {
    let originalIconUrl = '/favicon.ico';
    const iconLinks = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
    if (iconLinks.length > 0) {
        const svgIcon = Array.from(iconLinks).find(l => l.href.includes('.svg') || l.type === 'image/svg+xml');
        if (svgIcon) originalIconUrl = svgIcon.href;
        else originalIconUrl = iconLinks[0].href;
        iconLinks.forEach(link => link.remove());
    }

    try {
        if (state.themeColor.toLowerCase() === '#53fc18') {
            let link = document.createElement('link');
            link.rel = 'icon';
            link.href = originalIconUrl;
            document.head.appendChild(link);
            return;
        }

        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = originalIconUrl;
        
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });

        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        ctx.drawImage(img, 0, 0);
        
        let themeHex = state.themeColor.replace('#', '');
        if(themeHex.length === 3) themeHex = themeHex.split('').map(x=>x+x).join('');
        const tR = parseInt(themeHex.substr(0, 2), 16);
        const tG = parseInt(themeHex.substr(2, 2), 16);
        const tB = parseInt(themeHex.substr(4, 2), 16);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            if (a > 0) {
                // Kick'in yeşil kısmını bul (Yeşil, Kırmızı ve Maviden bariz yüksekse)
                if (g > r + 10 && g > b + 10) {
                    const lumRatio = g / 255; 
                    data[i] = tR * lumRatio;
                    data[i + 1] = tG * lumRatio;
                    data[i + 2] = tB * lumRatio;
                }
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
        const newIconUrl = canvas.toDataURL('image/png');
        
        let link = document.createElement('link');
        link.rel = 'icon';
        link.href = newIconUrl;
        document.head.appendChild(link);

    } catch(e) {
        console.error("[Kick Enhancer] Favicon boyanamadı:", e);
        let link = document.createElement('link');
        link.rel = 'icon';
        link.href = originalIconUrl;
        document.head.appendChild(link);
    }
}

function applyThemeColor() {
    let styleEl = document.getElementById('kick-enhancer-theme-style');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'kick-enhancer-theme-style';
        document.documentElement.appendChild(styleEl);

        const protectObserver = new MutationObserver(() => {
            if (!document.getElementById('kick-enhancer-theme-style')) {
                document.documentElement.appendChild(styleEl);
            }
        });
        protectObserver.observe(document.documentElement, { childList: true });
        if (document.head) protectObserver.observe(document.head, { childList: true });
    }

    updateFavicon();

    // Sadece Kick yeşiliyse eklenti CSS'ini boşalt (performans)
    if (state.themeColor.toLowerCase() === '#53fc18' || state.themeColor === '') {
        styleEl.innerHTML = '';
        return;
    }

    // Çizgili animasyonlar ve sayılar için kontrast bir vurgu rengi oluştur
    const stripeTheme = getStripeColor(state.themeColor);
    const stripeColor = stripeTheme.bg;
    const stripeText = stripeTheme.text;

    styleEl.innerHTML = `
        :root {
            --colors-primary: ${state.themeColor} !important;
            --colors-green: ${state.themeColor} !important;
            --colors-green-400: ${state.themeColor} !important;
            --colors-green-500: ${state.themeColor} !important;
            --colors-green-600: ${state.themeColor} !important;
            --brand-primary: ${state.themeColor} !important;
            --kick-green: ${state.themeColor} !important;
        }
        
        /* Arka Planlar ve Butonlar */
        .bg-brand, .bg-primary-base, .bg-surface-onSurfacePrimary,
        .hover\\:bg-green-500:hover, .hover\\:bg-primary-base:hover,
        [class^="bg-green"], [class*=" bg-green"],
        [class^="bg-[#53fc18]" i], [class*=" bg-[#53fc18]" i],
        [class^="bg-[#00e701]" i], [class*=" bg-[#00e701]" i],
        [class^="bg-[#22c55e]" i], [class*=" bg-[#22c55e]" i],
        [class^="bg-[#4ade80]" i], [class*=" bg-[#4ade80]" i],
        [style*="background-color: #53fc18" i], [style*="background-color: rgb(83, 252, 24)"],
        [style*="background: #53fc18" i], [style*="background: rgb(83, 252, 24)"] {
            background-color: ${state.themeColor} !important;
        }

        /* Hover Durumları (Fare Üzerindeyken) */
        [class*="hover:bg-green"]:hover, [class*="hover:bg-[#53fc18]"]:hover, [class*="hover:bg-[#00e701]"]:hover, [class*="hover:bg-[#22c55e]"]:hover {
            background-color: ${state.themeColor} !important;
        }
        
        [class*="hover:text-green"]:hover, [class*="hover:text-[#53fc18]"]:hover, [class*="hover:text-[#00e701]"]:hover, [class*="hover:text-[#22c55e]"]:hover,
        .hover\\:text-green-500:hover {
            color: ${state.themeColor} !important;
        }

        /* Kenarlıklar (Borders) */
        [class^="border-green"], [class*=" border-green"],
        [class^="border-[#53fc18]" i], [class*=" border-[#53fc18]" i],
        [class^="border-[#00e701]" i], [class*=" border-[#00e701]" i],
        [style*="border-color: #53fc18" i] {
            border-color: ${state.themeColor} !important;
        }
        
        /* Olası Pseudo-Element LIVE Noktaları */
        [class*="live" i]::before, [class*="live" i]::after,
        [class*="indicator" i]::before, [class*="indicator" i]::after,
        [class*="status" i]::before, [class*="status" i]::after {
            background-color: ${state.themeColor} !important;
        }
        
        /* Progress Barlar (Hem yeşil hem sarı/turuncu tüm hedefler) ve Çizgili Animasyonları */
        div[style*="repeating-linear-gradient"] {
            background-image: repeating-linear-gradient(100deg, ${state.themeColor}, ${state.themeColor} 7.5px, ${stripeColor} 7.5px, ${stripeColor} 15px) !important;
        }
        
        /* Progress Bar (Hedefler vb.) Linear Gradients */
        .from-green-500, .to-green-500, .from-primary-base, .to-primary-base, [class*="from-[#53fc18]" i], [class*="to-[#53fc18]" i],
        [class*="from-surface-onSurfacePrimary"], [class*="to-surface-onSurfacePrimary"] {
            --tw-gradient-from: ${state.themeColor} !important;
            --tw-gradient-to: ${state.themeColor} !important;
            --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to) !important;
        }
        
        /* Progress Bar İçindeki Sayılar (41.058, 197 vb.) - Hiçbir renk kaçmasın diye tüm metni eziyoruz */
        .group\\/progress span, .group\\/progress strong, .group\\/progress p,
        .group\\/bar span, .group\\/bar strong, .group\\/bar p {
            color: ${stripeColor} !important;
        }
        
        /* Sadakat Puanı (Channel Points) Logosu */
        [data-testid="channel-points-button"] svg,
        [data-testid="channel-points-button"] path[fill^="url("] {
            color: ${state.themeColor} !important;
            fill: ${state.themeColor} !important;
        }
        
        /* KICKS Logoları (Navbar, Chat içinde hediye atıldığında vb. her yerdeki Çoklu Gradient Pathleri) */
        [data-testid="kicks-top-nav"] svg path[fill^="url("],
        svg[viewBox="0 0 16 16"] path[fill^="url(#paint"] {
            fill: ${state.themeColor} !important;
        }
        
        /* Yazılar (İzleyici sayısı, takipçi vb. ve Markdown Linkleri) */
        .text-brand, .text-primary-base, .text-surface-onSurfacePrimary,
        .markdown-panel a,
        [class^="text-green"], [class*=" text-green"],
        [class^="text-[#53fc18]" i], [class*=" text-[#53fc18]" i],
        [class^="text-[#00e701]" i], [class*=" text-[#00e701]" i],
        [class^="text-[#22c55e]" i], [class*=" text-[#22c55e]" i],
        [class^="text-[#4ade80]" i], [class*=" text-[#4ade80]" i],
        [class^="text-[rgb("], [class*=" text-[rgb("],
        [style*="color: #53fc18" i], [style*="color: rgb(83, 252, 24)"] {
            color: ${state.themeColor} !important;
        }
        
        /* Çerçeveler */
        .border-primary, .border-green-500, .border-green-400, .border-primary-base,
        [class*="border-[#53fc18]" i], [style*="border-color: #53fc18" i] {
            border-color: ${state.themeColor} !important;
        }
        
        /* SVG, Onay Tikleri (Verified) ve Logolar */
        .fill-primary-base,
        [class^="fill-green"], [class*=" fill-green"],
        [class^="fill-[#53fc18]" i], [class*=" fill-[#53fc18]" i],
        [style*="fill: #53fc18" i], [style*="fill: rgb(83, 252, 24)"],
        [data-testid="verified-badge"], [data-testid="verified-badge"] path,
        svg[aria-label="Verified"], svg[aria-label="Verified"] path,
        circle[cx="3"][cy="3"][r="3"] {
            fill: ${state.themeColor} !important;
            color: ${state.themeColor} !important;
        }
        
        /* Kick Verified Badge (Onay Tiki) Özel Gradient ve Path Hedefleme */
        svg[viewBox="0 0 32 32"] path[fill^="url(#paint"],
        path[d^="M14.4"], path[d^="M14.5"], path[d^="M30.8"], path[d^="M30.9"],
        svg[fill="none"] path[fill^="url(#paint0_linear"] {
            fill: ${state.themeColor} !important;
        }
        
        /* Kick Ana Logo (Resim olduğu için Mask yöntemiyle boyuyoruz) */
        img[src*="kick-logo.svg"] {
            content: url('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7') !important;
            background-color: ${state.themeColor} !important;
            -webkit-mask-image: url(/img/kick-logo.svg) !important;
            mask-image: url(/img/kick-logo.svg) !important;
            -webkit-mask-size: contain !important;
            mask-size: contain !important;
            -webkit-mask-repeat: no-repeat !important;
            mask-repeat: no-repeat !important;
            -webkit-mask-position: center !important;
            mask-position: center !important;
        }
        
        /* Hardcoded SVG Renkleri */
        svg[fill="#53fc18" i], path[fill="#53fc18" i], rect[fill="#53fc18" i], circle[fill="#53fc18" i],
        svg[fill="#00e701" i], path[fill="#00e701" i], rect[fill="#00e701" i], circle[fill="#00e701" i] {
            fill: ${state.themeColor} !important;
        }
        
        /* Eklentinin kendi slider/buton renkleri */
        #kick-enhancer-panel input[type=range]::-webkit-slider-thumb {
            background: ${state.themeColor} !important;
            box-shadow: 0 0 10px ${state.themeColor}80 !important;
        }
        #kick-enhancer-panel::-webkit-scrollbar-thumb {
            background: ${state.themeColor} !important;
        }
        #kick-enhancer-panel .enhancer-section label span {
            color: ${state.themeColor} !important;
        }
        #kick-enhancer-panel .checkbox-row input[type="checkbox"] {
            accent-color: ${state.themeColor} !important;
        }
    `;
}

function createUI() {
    if (document.getElementById('kick-enhancer-toggle')) return;

    // Toggle Button
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'kick-enhancer-toggle';
    toggleBtn.innerHTML = `<svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>`;
    toggleBtn.title = 'Kick Ayarları';

    // Try to append to player controls
    const tryAppendToControls = () => {
        // Hedef container: Takip et butonunun olduğu yer
        const followBtn = document.querySelector('[data-testid="follow-button"], [aria-label="Takibi Bırak"], [aria-label="Takip Et"]');
        let targetContainer = null;

        if (followBtn) {
            targetContainer = followBtn.parentElement;
        }

        if (targetContainer && !targetContainer.contains(toggleBtn)) {
            // Kick butonlarının tasarımını kopyala
            toggleBtn.className = 'group relative box-border shrink-0 grow-0 select-none items-center justify-center size-10 text-base leading-none flex';
            toggleBtn.style.cssText = 'color: white; border-radius: 6px; cursor: pointer; border: none; background: transparent; transition: background 0.2s;';

            // Etrafındaki diğer butonların arka plan rengini taklit et
            const siblingBtn = followBtn.closest('button');
            if (siblingBtn) {
                const bg = window.getComputedStyle(siblingBtn).backgroundColor;
                toggleBtn.style.backgroundColor = bg !== 'rgba(0, 0, 0, 0)' ? bg : 'rgba(255,255,255,0.05)';
            }

            toggleBtn.onmouseenter = () => toggleBtn.style.background = 'rgba(255,255,255,0.15)';
            toggleBtn.onmouseleave = () => {
                const bg = siblingBtn ? window.getComputedStyle(siblingBtn).backgroundColor : 'rgba(255,255,255,0.05)';
                toggleBtn.style.background = bg !== 'rgba(0, 0, 0, 0)' ? bg : 'rgba(255,255,255,0.05)';
            };

            // Konteynerin en başına ekle (Bildirim zilinin soluna)
            targetContainer.insertBefore(toggleBtn, targetContainer.firstChild);
            toggleBtn.classList.remove('fallback-pos');
        } else if (!targetContainer && !document.body.contains(toggleBtn)) {
            document.body.appendChild(toggleBtn);
            toggleBtn.style.cssText = ''; // Fallback'te CSS dosyasındaki stilleri kullan
            toggleBtn.classList.add('fallback-pos');
        }
    };

    tryAppendToControls();
    // Keep checking in case DOM changes
    setInterval(tryAppendToControls, 2000);

    // Panel
    enhancerPanel = document.createElement('div');
    enhancerPanel.id = 'kick-enhancer-panel';
    enhancerPanel.className = 'hidden';

    enhancerPanel.innerHTML = `
        <div class="enhancer-section" style="flex-direction:row; align-items:center;">
            <label style="flex:1;">${msg("ui_themeColor")}</label>
            <input type="color" id="enhancer-theme-color" value="#53fc18" style="background:transparent; border:none; cursor:pointer; width:30px; height:30px; padding:0;">
        </div>
        
        <div class="enhancer-section">
            <label>${msg("ui_videoFilterProfile")}</label>
            <div style="display:flex; gap:5px; margin-top:4px;">
                <select id="enhancer-preset" style="flex:1;"></select>
                <button id="btn-save-preset" style="background:#333; color:white; border:1px solid #555; border-radius:4px; padding:0 8px; cursor:pointer;">${msg("ui_btnSave")}</button>
            </div>
        </div>

        <div class="enhancer-section">
            <label>${msg("ui_playbackSpeed")}</label>
            <label class="checkbox-row">
                <input type="checkbox" id="enhancer-adaptive-speed"> ${msg("ui_adaptiveSpeed")}
            </label>
            <select id="enhancer-speed" style="margin-top:4px;">
                <option value="0.25">0.25x</option>
                <option value="0.5">0.5x</option>
                <option value="0.75">0.75x</option>
                <option value="1">1x</option>
                <option value="1.25">1.25x</option>
                <option value="1.5">1.5x</option>
                <option value="2">2x</option>
            </select>
        </div>
        

        <div class="enhancer-section">
            <label>${msg("ui_brightness")} <span id="val-brightness">100%</span></label>
            <input type="range" id="enhancer-brightness" min="10" max="200" value="100">
        </div>

        <div class="enhancer-section">
            <label>${msg("ui_contrast")} <span id="val-contrast">100%</span></label>
            <input type="range" id="enhancer-contrast" min="10" max="200" value="100">
        </div>
        
        <div class="enhancer-section">
            <label>${msg("ui_saturate")} <span id="val-saturate">100%</span></label>
            <input type="range" id="enhancer-saturate" min="0" max="200" value="100">
        </div>
        
        <div class="enhancer-section">
            <label>${msg("ui_blackLevel")} <span id="val-blackLevel">0%</span></label>
            <input type="range" id="enhancer-blackLevel" min="0" max="50" value="0">
        </div>
        
        <div class="enhancer-section">
            <label>${msg("ui_grayscale")} <span id="val-grayscale">0%</span></label>
            <input type="range" id="enhancer-grayscale" min="0" max="100" value="0">
        </div>
        
        <div class="enhancer-section">
            <label>${msg("ui_invert")} <span id="val-invert">0%</span></label>
            <input type="range" id="enhancer-invert" min="0" max="100" value="0">
        </div>
        
        <div class="enhancer-section">
            <label>${msg("ui_blur")} <span id="val-blur">0px</span></label>
            <input type="range" id="enhancer-blur" min="0" max="10" step="0.5" value="0">
        </div>
        
        <div class="enhancer-section">
            <label>${msg("ui_sepia")} <span id="val-sepia">0%</span></label>
            <input type="range" id="enhancer-sepia" min="0" max="100" value="0">
        </div>
        
        <div class="enhancer-section">
            <label>${msg("ui_hue")} <span id="val-hue">0°</span></label>
            <input type="range" id="enhancer-hue" min="-180" max="180" value="0">
        </div>
        
        <div class="enhancer-section">
            <label>${msg("ui_hoverSize")} <span id="val-hoverSize">2.0x</span></label>
            <input type="range" id="enhancer-hoverSize" min="0.5" max="2.5" step="0.1" value="2">
        </div>
        
        <div class="enhancer-section">
            <label>${msg("ui_zoom")} <span id="val-zoom">1.0x</span></label>
            <label class="checkbox-row" style="margin-bottom:4px;">
                <input type="checkbox" id="enhancer-scroll-zoom"> ${msg("ui_scrollZoom")}
            </label>
            <input type="range" id="enhancer-zoom" min="1" max="3" step="0.1" value="1">
            <button class="reset-btn" id="btn-reset-all">${msg("ui_resetAll")}</button>
        </div>
    `;

    document.body.appendChild(enhancerPanel);

    // Preset Populator
    function populatePresets() {
        const presetSelect = document.getElementById('enhancer-preset');
        presetSelect.innerHTML = '';
        const allPresets = { ...builtinPresets, ...state.customPresets };
        for (let name in allPresets) {
            let opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            presetSelect.appendChild(opt);
        }
        presetSelect.value = state.activePreset || msg("preset_default");
    }
    populatePresets();

    document.getElementById('enhancer-preset').addEventListener('change', (e) => {
        const name = e.target.value;
        const allPresets = { ...builtinPresets, ...state.customPresets };
        if (allPresets[name] && name !== msg("preset_custom")) {
            state.activePreset = name;
            for (let key in allPresets[name]) {
                state[key] = allPresets[name][key];
                const slider = document.getElementById(`enhancer-${key}`);
                const valDisplay = document.getElementById(`val-${key}`);
                if (slider) {
                    slider.value = state[key];
                    let suffix = key === 'blur' ? 'px' : (key === 'hue' ? '°' : '%');
                    valDisplay.textContent = state[key] + suffix;
                }
            }
            applyStyles();
            saveState();
        }
    });

    document.getElementById('btn-save-preset').addEventListener('click', () => {
        const name = prompt(msg("prompt_presetName"));
        if (name && name.trim() !== '') {
            if (builtinPresets[name]) {
                alert(msg("alert_defaultPreset"));
                return;
            }
            if (!state.customPresets) state.customPresets = {};
            state.customPresets[name] = {
                brightness: state.brightness,
                contrast: state.contrast,
                saturate: state.saturate,
                sepia: state.sepia,
                hue: state.hue,
                grayscale: state.grayscale,
                invert: state.invert,
                blur: state.blur,
                blackLevel: state.blackLevel
            };
            state.activePreset = name;
            saveState();
            populatePresets();
        }
    });

    // Event Listeners
    toggleBtn.addEventListener('click', () => {
        enhancerPanel.classList.toggle('hidden');
    });

    const speedSelect = document.getElementById('enhancer-speed');
    const adaptiveCheckbox = document.getElementById('enhancer-adaptive-speed');

    speedSelect.value = state.playbackRate;
    adaptiveCheckbox.checked = state.adaptiveSpeed;

    speedSelect.addEventListener('change', (e) => {
        state.playbackRate = parseFloat(e.target.value);
        if (videoElement && !state.adaptiveSpeed) {
            videoElement.playbackRate = state.playbackRate;
        }
        saveState();
    });

    adaptiveCheckbox.addEventListener('change', (e) => {
        state.adaptiveSpeed = e.target.checked;
        saveState();
    });


    const themeInput = document.getElementById('enhancer-theme-color');
    themeInput.value = state.themeColor || '#53fc18';
    themeInput.addEventListener('input', (e) => {
        state.themeColor = e.target.value;
        applyThemeColor();
        saveState();
    });

    const scrollZoomCb = document.getElementById('enhancer-scroll-zoom');
    scrollZoomCb.checked = state.scrollZoomEnabled !== false;
    scrollZoomCb.addEventListener('change', (e) => {
        state.scrollZoomEnabled = e.target.checked;
        saveState();
    });

    const bindSlider = (id, stateKey, suffix = '%') => {
        const slider = document.getElementById(`enhancer-${id}`);
        const valDisplay = document.getElementById(`val-${id}`);

        slider.value = state[stateKey];
        valDisplay.textContent = state[stateKey] + suffix;

        slider.addEventListener('input', (e) => {
            state[stateKey] = parseFloat(e.target.value);
            valDisplay.textContent = state[stateKey] + suffix;
            state.activePreset = "Özel";
            document.getElementById('enhancer-preset').value = "Özel";
            applyStyles();
            saveState();
        });
    };

    bindSlider('brightness', 'brightness');
    bindSlider('contrast', 'contrast');
    bindSlider('saturate', 'saturate');
    bindSlider('sepia', 'sepia');
    bindSlider('hue', 'hue', '°');
    bindSlider('blackLevel', 'blackLevel');
    bindSlider('grayscale', 'grayscale');
    bindSlider('invert', 'invert');
    bindSlider('blur', 'blur', 'px');
    bindSlider('zoom', 'zoom', 'x');
    bindSlider('hoverSize', 'hoverSize', 'x');

    document.getElementById('btn-reset-all').addEventListener('click', () => {
        state.brightness = 100;
        state.contrast = 100;
        state.saturate = 100;
        state.sepia = 0;
        state.hue = 0;
        state.zoom = 1;
        state.panX = 0;
        state.panY = 0;
        state.blackLevel = 0;
        state.grayscale = 0;
        state.invert = 0;
        state.blur = 0;
        state.activePreset = "Varsayılan";
        
        document.getElementById('enhancer-preset').value = "Varsayılan";
        
        document.getElementById('enhancer-brightness').value = 100;
        document.getElementById('enhancer-contrast').value = 100;
        document.getElementById('enhancer-saturate').value = 100;
        document.getElementById('enhancer-sepia').value = 0;
        document.getElementById('enhancer-hue').value = 0;
        document.getElementById('enhancer-zoom').value = 1;
        document.getElementById('enhancer-blackLevel').value = 0;
        document.getElementById('enhancer-grayscale').value = 0;
        document.getElementById('enhancer-invert').value = 0;
        document.getElementById('enhancer-blur').value = 0;
        
        document.getElementById('val-brightness').textContent = '100%';
        document.getElementById('val-contrast').textContent = '100%';
        document.getElementById('val-saturate').textContent = '100%';
        document.getElementById('val-sepia').textContent = '0%';
        document.getElementById('val-hue').textContent = '0°';
        document.getElementById('val-zoom').textContent = '1.0x';
        document.getElementById('val-blackLevel').textContent = '0%';
        document.getElementById('val-grayscale').textContent = '0%';
        document.getElementById('val-invert').textContent = '0%';
        document.getElementById('val-blur').textContent = '0px';

        applyStyles();
        applyThemeColor();
        saveState();
    });
}

function setupZoomAndPan() {
    if (!videoElement) return;

    videoElement.addEventListener('wheel', (e) => {
        if (state.scrollZoomEnabled === false) return; // Fare tekerleği ile zoom kapatıldıysa müdahale etme
        
        if (!e.ctrlKey && !document.getElementById('kick-enhancer-panel').classList.contains('hidden') === false) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            state.zoom = Math.max(1, Math.min(3, state.zoom + delta));

            document.getElementById('enhancer-zoom').value = state.zoom;
            document.getElementById('val-zoom').textContent = state.zoom.toFixed(1) + 'x';

            if (state.zoom === 1) {
                state.panX = 0;
                state.panY = 0;
            }
            applyStyles();
            saveState();
        }
    }, { passive: false });

    videoElement.addEventListener('mousedown', (e) => {
        if (state.zoom > 1) {
            isDragging = true;
            startX = e.clientX - state.panX;
            startY = e.clientY - state.panY;
            e.preventDefault();
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        state.panX = e.clientX - startX;
        state.panY = e.clientY - startY;
        applyStyles();
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        if (videoElement) {
            videoElement.style.transition = 'transform 0.2s ease, filter 0.2s ease';
        }
    });
}

function showOSD(text) {
    let osd = document.getElementById('kick-enhancer-osd');
    if (!osd) {
        osd = document.createElement('div');
        osd.id = 'kick-enhancer-osd';
        osd.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.6);
            color: white;
            font-size: 24px;
            font-weight: bold;
            padding: 10px 20px;
            border-radius: 8px;
            z-index: 999999;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.3s;
            font-family: sans-serif;
        `;
        const container = videoElement ? videoElement.parentElement : document.body;
        container.appendChild(osd);
    }

    osd.textContent = text;
    osd.style.opacity = '1';

    clearTimeout(osd.timeout);
    osd.timeout = setTimeout(() => {
        osd.style.opacity = '0';
    }, 1000);
}

// Adaptive Speed Logic
let adaptiveInterval;
function startAdaptiveSpeedCheck() {
    clearInterval(adaptiveInterval);
    adaptiveInterval = setInterval(() => {
        if (!state.adaptiveSpeed || !videoElement || videoElement.paused) return;
        try {
            const buffered = videoElement.buffered;
            if (buffered.length > 0) {
                const liveEdge = buffered.end(buffered.length - 1);
                const currentTime = videoElement.currentTime;
                const delay = liveEdge - currentTime;

                if (delay > 4) { // More than 4 seconds behind
                    if (videoElement.playbackRate !== 1.25) {
                        videoElement.playbackRate = 1.25;
                        showOSD("⚡ Yetişiliyor (1.25x)");
                    }
                } else if (delay < 2.5) { // Caught up
                    if (videoElement.playbackRate !== 1) {
                        videoElement.playbackRate = 1;
                        showOSD("✅ Senkronize (1x)");
                    }
                }
            }
        } catch (e) { }
    }, 2000);
}


// Hover Preview (MoKick feature)
function setupHoverPreview() {
    let hoverTimeout;
    const previewDiv = document.createElement('div');
    previewDiv.id = 'kick-hover-preview';
    document.body.appendChild(previewDiv);

    document.addEventListener('mouseover', (e) => {
        const link = e.target.closest('a[href]');
        if (link) {
            const href = link.getAttribute('href');
            // Kick channel links are usually just /username
            if (href && href.startsWith('/') && href.split('/').length === 2 && !href.includes('categories')) {
                const channelName = href.substring(1);

                // Sadece sol menüde veya chat'te çalışsın diyebiliriz ama şimdilik tüm linklerde
                hoverTimeout = setTimeout(() => {
                    const baseWidth = 320;
                    const baseHeight = 180;
                    previewDiv.style.width = `${baseWidth * state.hoverSize}px`;
                    previewDiv.style.height = `${baseHeight * state.hoverSize}px`;

                    // Sesi açmak için muted=false yaptık
                    previewDiv.innerHTML = `<iframe src="https://player.kick.com/${channelName}?autoplay=true" frameborder="0" scrolling="no" allowfullscreen="false" allow="autoplay"></iframe>`;
                    previewDiv.classList.add('show');

                    const rect = link.getBoundingClientRect();
                    // Linkin sağına koy
                    previewDiv.style.top = `${Math.max(10, rect.top - 50)}px`;
                    previewDiv.style.left = `${rect.right + 20}px`;
                }, 600);
            }
        }
    });

    document.addEventListener('mouseout', (e) => {
        const link = e.target.closest('a[href]');
        if (link) {
            clearTimeout(hoverTimeout);
            previewDiv.classList.remove('show');
            setTimeout(() => {
                if (!previewDiv.classList.contains('show')) {
                    previewDiv.innerHTML = '';
                }
            }, 200);
        }
    });
}

async function init() {
    loadState(async () => {
        videoElement = await waitForVideo();
        console.log("[Kick Enhancer] Video found, starting advanced features...");

        createUI();
        setupZoomAndPan();
        setupHoverPreview();
        startAdaptiveSpeedCheck();

        applyStyles();
        applyThemeColor();

        // SPA (Single Page Application) için Olay Güdümlü (Event-Driven) URL takibi (Sürekli kontrol yok!)
        const setupHistoryListener = () => {
            const originalPush = history.pushState;
            const originalReplace = history.replaceState;
            
            history.pushState = function() {
                originalPush.apply(this, arguments);
                window.dispatchEvent(new Event('locationchange'));
            };
            history.replaceState = function() {
                originalReplace.apply(this, arguments);
                window.dispatchEvent(new Event('locationchange'));
            };
            window.addEventListener('popstate', () => {
                window.dispatchEvent(new Event('locationchange'));
            });
        };
        setupHistoryListener();

        let lastHistoryUrl = location.href;
        window.addEventListener('locationchange', () => {
            if (location.href !== lastHistoryUrl) {
                lastHistoryUrl = location.href;
                console.log("[Kick Enhancer] URL değişti, yeni yayın algılandı (Olay Güdümlü).");
            }
        });

        function attachVideoListeners(v) {
            v.addEventListener('play', () => {
                if (!state.adaptiveSpeed && state.playbackRate !== 1) {
                    v.playbackRate = state.playbackRate;
                }
            });
            // loadedmetadata tetikleyicisi sonsuz döngü yaratabileceği için kalite zorlamasından çıkarıldı.
        }
        
        attachVideoListeners(videoElement);

        let videoCheckDebounce;
        const observer = new MutationObserver((mutations) => {
            let hasAdded = false;
            for (let i = 0; i < mutations.length; i++) {
                if (mutations[i].addedNodes.length > 0) {
                    hasAdded = true;
                    break;
                }
            }
            if (hasAdded) {
                clearTimeout(videoCheckDebounce);
                videoCheckDebounce = setTimeout(() => {
                    const newVideo = document.querySelector('video');
                    if (newVideo && newVideo !== videoElement) {
                        console.log("[Kick Enhancer] Yeni video elementi algılandı.");
                        videoElement = newVideo;
                        setupZoomAndPan();
                        applyStyles();
                        if (!state.adaptiveSpeed) videoElement.playbackRate = state.playbackRate;
                        
                        attachVideoListeners(videoElement);
                    }
                }, 1000);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    });
}



init();
