/* ══════════════════════════════════════════
   AgriFuture AI — Chat JS  v2.0
   ══════════════════════════════════════════ */

const API_URL = 'http://localhost:5000/chat';
const MAX_CHARS = 2000;

/* ── DOM refs ── */
const messagesArea  = document.getElementById('messagesArea');
const chatInput     = document.getElementById('chatInput');
const sendBtn       = document.getElementById('sendBtn');
const newChatBtn    = document.getElementById('newChatBtn');
const welcomeState  = document.getElementById('welcomeState');
const historyList   = document.getElementById('historyList');
const historySearch = document.getElementById('historySearch');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebar       = document.getElementById('sidebar');
const scrollBtn     = document.getElementById('scrollBtn');
const clearInputBtn = document.getElementById('clearInputBtn');
const clearChatBtn  = document.getElementById('clearChatBtn');
const charCounter   = document.getElementById('charCounter');
const themeToggle   = document.getElementById('themeToggle');
const themeIcon     = document.getElementById('themeIcon');
const toast         = document.getElementById('toast');
const toastMsg      = document.getElementById('toastMsg');

/* ── State ── */
let conversationHistory = [];
let chatSessions        = JSON.parse(localStorage.getItem('agri_chat_sessions') || '[]');
let lastAIBubble        = null; // for regenerate
let toastTimer          = null;

/* ══════════════════════════════════════════
   THEME (Light / Dark)
   ══════════════════════════════════════════ */
function applyTheme(light) {
    document.body.classList.toggle('light-mode', light);
    themeIcon.className = light ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    localStorage.setItem('agri_theme', light ? 'light' : 'dark');
}
const savedTheme = localStorage.getItem('agri_theme');
applyTheme(savedTheme === 'light');

themeToggle.addEventListener('click', () => {
    applyTheme(!document.body.classList.contains('light-mode'));
});

/* ══════════════════════════════════════════
   SIDEBAR TOGGLE (mobile)
   ══════════════════════════════════════════ */
sidebarToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 &&
        !sidebar.contains(e.target) &&
        e.target !== sidebarToggle) {
        sidebar.classList.remove('open');
    }
});

/* ══════════════════════════════════════════
   SCROLL TO BOTTOM BUTTON
   ══════════════════════════════════════════ */
messagesArea.addEventListener('scroll', () => {
    const distFromBottom = messagesArea.scrollHeight - messagesArea.scrollTop - messagesArea.clientHeight;
    scrollBtn.classList.toggle('visible', distFromBottom > 120);
});
scrollBtn.addEventListener('click', scrollToBottom);

/* ══════════════════════════════════════════
   INPUT CONTROLS
   ══════════════════════════════════════════ */
chatInput.addEventListener('input', () => {
    // auto-resize
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + 'px';

    // char counter
    const len = chatInput.value.length;
    charCounter.textContent = `${len} / ${MAX_CHARS}`;
    charCounter.className = 'char-counter';
    if (len > MAX_CHARS * 0.85) charCounter.classList.add('warn');
    if (len >= MAX_CHARS)        charCounter.classList.add('over');

    // clear-x button
    clearInputBtn.classList.toggle('visible', len > 0);
});

chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
});
sendBtn.addEventListener('click', handleSend);

clearInputBtn.addEventListener('click', () => {
    chatInput.value = '';
    chatInput.style.height = 'auto';
    charCounter.textContent = `0 / ${MAX_CHARS}`;
    charCounter.className = 'char-counter';
    clearInputBtn.classList.remove('visible');
    chatInput.focus();
});

/* ══════════════════════════════════════════
   CLEAR CHAT
   ══════════════════════════════════════════ */
clearChatBtn.addEventListener('click', () => {
    if (!conversationHistory.length) return;
    if (!confirm('ล้างข้อความในแชทนี้ทั้งหมด?')) return;
    resetChat();
    showToast('ล้างแชทแล้ว', 'fa-solid fa-trash-can');
});

function resetChat() {
    conversationHistory = [];
    lastAIBubble = null;
    // Remove all msg-rows
    Array.from(messagesArea.querySelectorAll('.msg-row')).forEach(el => el.remove());
    // Show welcome
    welcomeState.style.display = 'flex';
    document.getElementById('chatTitle').textContent = 'AgriFuture AI Chat';
}

/* ── New Chat ── */
newChatBtn.addEventListener('click', () => {
    resetChat();
    chatInput.value = '';
    chatInput.style.height = 'auto';
    charCounter.textContent = `0 / ${MAX_CHARS}`;
    charCounter.className = 'char-counter';
    clearInputBtn.classList.remove('visible');
});

/* ══════════════════════════════════════════
   SUGGESTION SHORTCUTS
   ══════════════════════════════════════════ */
function sendSuggestion(text) {
    chatInput.value = text;
    chatInput.dispatchEvent(new Event('input'));
    handleSend();
}

/* ══════════════════════════════════════════
   MAIN SEND HANDLER
   ══════════════════════════════════════════ */
async function handleSend() {
    const text = chatInput.value.trim();
    if (!text || sendBtn.disabled) return;
    if (text.length > MAX_CHARS) {
        showToast('ข้อความยาวเกินไป', 'fa-solid fa-triangle-exclamation');
        return;
    }

    welcomeState.style.display = 'none';
    chatInput.value = '';
    chatInput.style.height = 'auto';
    charCounter.textContent = `0 / ${MAX_CHARS}`;
    charCounter.className = 'char-counter';
    clearInputBtn.classList.remove('visible');
    sendBtn.disabled = true;

    appendMessage('user', text);
    conversationHistory.push({ role: 'user', content: text });

    const typingId = showTyping();

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: conversationHistory })
        });

        const data = await res.json();
        removeTyping(typingId);

        if (data.error) {
            showWarning(data.error);
        } else {
            const reply = data.reply;
            lastAIBubble = appendMessage('ai', reply);
            conversationHistory.push({ role: 'assistant', content: reply });
            saveChatSession(text);
        }

    } catch (err) {
        removeTyping(typingId);
        showWarning('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาตรวจสอบว่า Python backend กำลังทำงานอยู่');
        console.error(err);
    }

    sendBtn.disabled = false;
    scrollToBottom();
}

/* ══════════════════════════════════════════
   REGENERATE LAST AI RESPONSE
   ══════════════════════════════════════════ */
async function regenerateLastResponse() {
    if (sendBtn.disabled) return;
    // Remove last AI message from UI and history
    if (lastAIBubble) {
        lastAIBubble.remove();
        lastAIBubble = null;
    }
    if (conversationHistory.length && conversationHistory[conversationHistory.length - 1].role === 'assistant') {
        conversationHistory.pop();
    }
    if (!conversationHistory.length) return;

    sendBtn.disabled = true;
    const typingId = showTyping();

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: conversationHistory })
        });
        const data = await res.json();
        removeTyping(typingId);

        if (data.error) {
            showWarning(data.error);
        } else {
            lastAIBubble = appendMessage('ai', data.reply);
            conversationHistory.push({ role: 'assistant', content: data.reply });
        }
    } catch (err) {
        removeTyping(typingId);
        showWarning('ไม่สามารถสร้างคำตอบใหม่ได้');
    }

    sendBtn.disabled = false;
    scrollToBottom();
}

/* ══════════════════════════════════════════
   APPEND MESSAGE BUBBLE
   ══════════════════════════════════════════ */
function appendMessage(role, text) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

    const row = document.createElement('div');
    row.className = `msg-row ${role}`;

    // Avatar
    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    if (role === 'ai') {
        avatar.innerHTML = '<i class="fa-solid fa-seedling"></i>';
    } else {
        const img = document.getElementById('profileImg');
        if (img && img.src && img.style.display !== 'none') {
            avatar.innerHTML = `<img src="${img.src}" alt="">`;
        } else {
            avatar.innerHTML = '<i class="fa-solid fa-user"></i>';
        }
    }

    // Content wrapper
    const content = document.createElement('div');
    content.className = 'msg-content';

    // Bubble
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.innerHTML = formatMarkdown(text);

    // Wrap code blocks with copy buttons
    bubble.querySelectorAll('pre').forEach(pre => {
        const wrap = document.createElement('div');
        wrap.className = 'code-block-wrap';
        const code = pre.querySelector('code');
        const copyBtn = document.createElement('button');
        copyBtn.className = 'code-copy-btn';
        copyBtn.textContent = 'คัดลอก';
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(code ? code.innerText : pre.innerText);
            copyBtn.textContent = '✓ คัดลอกแล้ว';
            setTimeout(() => copyBtn.textContent = 'คัดลอก', 2000);
        });
        pre.parentNode.insertBefore(wrap, pre);
        wrap.appendChild(pre);
        wrap.appendChild(copyBtn);
    });

    // Meta row (time + actions)
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.innerHTML = `<span class="msg-time">${timeStr}</span>`;

    // Copy button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'msg-action-btn';
    copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> คัดลอก';
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(text).then(() => {
            copyBtn.classList.add('copied');
            copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> คัดลอกแล้ว';
            setTimeout(() => {
                copyBtn.classList.remove('copied');
                copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> คัดลอก';
            }, 2000);
            showToast('คัดลอกข้อความแล้ว');
        });
    });
    meta.appendChild(copyBtn);

    // Regenerate button (AI only)
    if (role === 'ai') {
        const regenBtn = document.createElement('button');
        regenBtn.className = 'msg-action-btn';
        regenBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> สร้างใหม่';
        regenBtn.addEventListener('click', regenerateLastResponse);
        meta.appendChild(regenBtn);
    }

    content.appendChild(bubble);
    content.appendChild(meta);
    row.appendChild(avatar);
    row.appendChild(content);
    messagesArea.appendChild(row);
    scrollToBottom();

    return row; // return reference for regenerate
}

/* ══════════════════════════════════════════
   TYPING INDICATOR
   ══════════════════════════════════════════ */
function showTyping() {
    const id = 'typing-' + Date.now();
    const row = document.createElement('div');
    row.className = 'msg-row ai';
    row.id = id;
    row.innerHTML = `
        <div class="msg-avatar"><i class="fa-solid fa-seedling"></i></div>
        <div class="msg-content">
            <div class="msg-bubble ai typing-bubble">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </div>
        </div>`;
    messagesArea.appendChild(row);
    scrollToBottom();
    return id;
}
function removeTyping(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

/* ══════════════════════════════════════════
   WARNING BUBBLE
   ══════════════════════════════════════════ */
function showWarning(msg) {
    const row = document.createElement('div');
    row.className = 'msg-row ai';
    row.innerHTML = `
        <div class="msg-avatar"><i class="fa-solid fa-seedling"></i></div>
        <div class="msg-content">
            <div class="msg-warning">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <span>${msg}</span>
            </div>
        </div>`;
    messagesArea.appendChild(row);
    scrollToBottom();
}

/* ══════════════════════════════════════════
   MARKDOWN FORMATTER
   ══════════════════════════════════════════ */
function formatMarkdown(text) {
    // Escape HTML first
    let s = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Code blocks (``` lang\n...```)
    s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
        `<pre><code class="lang-${lang}">${code.trim()}</code></pre>`
    );

    // Inline code
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Headings
    s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    s = s.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
    s = s.replace(/^# (.+)$/gm,   '<h1>$1</h1>');

    // Bold & italic
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    s = s.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g,         '<em>$1</em>');

    // Blockquote
    s = s.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // Horizontal rule
    s = s.replace(/^---$/gm, '<hr>');

    // Unordered list
    s = s.replace(/(^[*\-] .+(\n|$))+/gm, match => {
        const items = match.trim().split('\n').map(l =>
            `<li>${l.replace(/^[*\-] /, '')}</li>`
        ).join('');
        return `<ul>${items}</ul>`;
    });

    // Ordered list
    s = s.replace(/(^\d+\. .+(\n|$))+/gm, match => {
        const items = match.trim().split('\n').map(l =>
            `<li>${l.replace(/^\d+\. /, '')}</li>`
        ).join('');
        return `<ol>${items}</ol>`;
    });

    // Simple table (| a | b | c |)
    s = s.replace(/(^\|.+\|\n)(^\|[-| :]+\|\n)((?:^\|.+\|\n?)+)/gm, (_, header, sep, body) => {
        const parseRow = row => row.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        const heads = parseRow(header).map(h => `<th>${h}</th>`).join('');
        const rows  = body.trim().split('\n').map(r =>
            `<tr>${parseRow(r).map(c => `<td>${c}</td>`).join('')}</tr>`
        ).join('');
        return `<table><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table>`;
    });

    // Links
    s = s.replace(/\[(.+?)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Line breaks (only outside block elements)
    s = s.replace(/\n(?!<\/?(ul|ol|li|h[1-3]|pre|table|thead|tbody|tr|th|td|blockquote|hr))/g, '<br>');

    return s;
}

/* ══════════════════════════════════════════
   SCROLL
   ══════════════════════════════════════════ */
function scrollToBottom() {
    messagesArea.scrollTop = messagesArea.scrollHeight;
}

/* ══════════════════════════════════════════
   TOAST
   ══════════════════════════════════════════ */
function showToast(msg = 'คัดลอกแล้ว', icon = 'fa-solid fa-check') {
    toastMsg.textContent = msg;
    toast.querySelector('i').className = icon;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

/* ══════════════════════════════════════════
   CHAT SESSION HISTORY
   ══════════════════════════════════════════ */
function saveChatSession(firstMessage) {
    if (conversationHistory.length === 2) {
        const title = firstMessage.substring(0, 42) + (firstMessage.length > 42 ? '…' : '');
        chatSessions.unshift({
            id:    Date.now(),
            title: title,
            time:  new Date().toLocaleDateString('th-TH', { day:'numeric', month:'short' })
        });
        if (chatSessions.length > 30) chatSessions.pop();
        localStorage.setItem('agri_chat_sessions', JSON.stringify(chatSessions));
        document.getElementById('chatTitle').textContent = title;
        renderHistory();
    }
}

function renderHistory(filter = '') {
    historyList.innerHTML = '';
    const filtered = filter
        ? chatSessions.filter(s => s.title.toLowerCase().includes(filter.toLowerCase()))
        : chatSessions;

    if (filtered.length === 0) {
        historyList.innerHTML = `
            <div class="history-empty">
                <i class="fa-regular fa-clock"></i>
                ${filter ? 'ไม่พบผลลัพธ์' : 'ยังไม่มีประวัติ'}
            </div>`;
        return;
    }

    filtered.slice(0, 20).forEach(session => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
            <i class="fa-regular fa-message icon"></i>
            <span class="history-title">${escHtml(session.title)}</span>
            <span class="history-time">${session.time}</span>
            <button class="del-btn" title="ลบ"><i class="fa-solid fa-xmark"></i></button>
        `;
        item.querySelector('.del-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            chatSessions = chatSessions.filter(s => s.id !== session.id);
            localStorage.setItem('agri_chat_sessions', JSON.stringify(chatSessions));
            renderHistory(historySearch.value);
            showToast('ลบประวัติแล้ว', 'fa-solid fa-trash-can');
        });
        item.addEventListener('click', () => {
            // Clicking history just sets the title (full restore would need stored messages)
            document.getElementById('chatTitle').textContent = session.title;
            if (window.innerWidth <= 768) sidebar.classList.remove('open');
        });
        historyList.appendChild(item);
    });
}

historySearch.addEventListener('input', () => renderHistory(historySearch.value));

function escHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ══════════════════════════════════════════
   FIREBASE AUTH — profile display
   ══════════════════════════════════════════ */
firebase.auth().onAuthStateChanged(user => {
    if (user) {
        const name = user.displayName || user.email?.split('@')[0] || 'ผู้ใช้';
        document.getElementById('profileName').textContent = name;
        const initEl = document.getElementById('profileInitial');
        const imgEl  = document.getElementById('profileImg');
        if (user.photoURL) {
            imgEl.src = user.photoURL;
            imgEl.style.display = 'block';
            initEl.style.display = 'none';
        } else {
            imgEl.style.display = 'none';
            initEl.style.display = 'flex';
            initEl.textContent = name.charAt(0).toUpperCase();
        }
    }
});

/* ── Init ── */
renderHistory();