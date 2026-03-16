// ==============================================
// VSB Bot - Script.js (v3.0 - Final Fix)
// ==============================================

const getCurrentTime = () => {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Append a message bubble to the chat
const appendMessage = (text, sender) => {
    const chatBody = document.getElementById('chatBody');
    if (!chatBody) return;

    const div = document.createElement('div');
    div.classList.add('message', sender);

    const avatar = sender === 'incoming'
        ? `<div class="avatar"><img src="https://ui-avatars.com/api/?name=VSB+Bot&background=FF6600&color=fff&rounded=true" alt="Bot"></div>`
        : '';

    div.innerHTML = `
        ${avatar}
        <div class="message-content">
            <p>${text}</p>
            <span class="message-time">${getCurrentTime()}</span>
        </div>
    `;

    chatBody.appendChild(div);
    chatBody.scrollTop = chatBody.scrollHeight;
};

// Show typing dots
const showTypingIndicator = () => {
    const chatBody = document.getElementById('chatBody');
    if (!chatBody) return;
    const div = document.createElement('div');
    div.classList.add('typing-indicator');
    div.id = 'typingIndicator';
    div.innerHTML = `<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>`;
    chatBody.appendChild(div);
    chatBody.scrollTop = chatBody.scrollHeight;
};

const removeTypingIndicator = () => {
    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
};

// ===========================================
// Main chat submit handler (const for direct
// assignment to window.sendSuggestion)
// ===========================================
const handleChatSubmit = async (message) => {
    const text = String(message || '').trim();
    if (!text) return;

    // Remove suggestions from DOM immediately
    const suggestions = document.getElementById('suggestions');
    if (suggestions) suggestions.remove();

    // Show user message
    appendMessage(text, 'outgoing');

    // Lock input
    const userInput = document.getElementById('userInput');
    const sendBtn   = document.getElementById('sendBtn');
    if (userInput) { userInput.value = ''; userInput.disabled = true; }
    if (sendBtn)   { sendBtn.disabled = true; }

    showTypingIndicator();

    try {
        const res  = await fetch('/api/chat', {
            method : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body   : JSON.stringify({ message: text })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        removeTypingIndicator();
        appendMessage(data.reply, 'incoming');
    } catch (err) {
        console.error('Chat error:', err);
        removeTypingIndicator();
        appendMessage("Sorry, I couldn't connect to my knowledge base. Please try again.", 'incoming');
    } finally {
        if (userInput) { userInput.disabled = false; userInput.focus(); }
        if (sendBtn)   { sendBtn.disabled = false; }
    }
};

// *** CRITICAL: assign before DOMContentLoaded fires ***
// This ensures onclick="sendSuggestion(...)" in HTML always finds this function
window.sendSuggestion = handleChatSubmit;

// ========================
// DOM setup after load
// ========================
document.addEventListener('DOMContentLoaded', () => {

    // Stamp time on welcome message
    const welcomeMsg = document.querySelector('.message.incoming .message-content');
    if (welcomeMsg && !welcomeMsg.querySelector('.message-time')) {
        const s = document.createElement('span');
        s.classList.add('message-time');
        s.textContent = getCurrentTime();
        welcomeMsg.appendChild(s);
    }

    const chatboxContainer = document.getElementById('chatboxContainer');
    const chatToggleBtn    = document.getElementById('chatToggleBtn');
    const closeChatBtn     = document.getElementById('closeChatBtn');
    const chatForm         = document.getElementById('chatForm');
    const userInput        = document.getElementById('userInput');
    const syncBtn          = document.getElementById('syncBtn');

    // === Wire suggestion buttons via data-suggestion ===
    document.querySelectorAll('.suggestion-btn[data-suggestion]').forEach(btn => {
        btn.addEventListener('click', () => {
            const text = btn.getAttribute('data-suggestion');
            if (text) handleChatSubmit(text);
        });
    });

    // Open chat
    if (chatToggleBtn) {
        chatToggleBtn.addEventListener('click', () => {
            chatboxContainer.classList.add('active');
            chatToggleBtn.classList.add('hidden');
            setTimeout(() => { if (userInput) userInput.focus(); }, 300);
        });
    }

    // Close chat
    if (closeChatBtn) {
        closeChatBtn.addEventListener('click', () => {
            chatboxContainer.classList.remove('active');
            if (chatToggleBtn) chatToggleBtn.classList.remove('hidden');
        });
    }

    // Submit form
    if (chatForm) {
        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('userInput');
            if (input) handleChatSubmit(input.value);
        });
    }

    // Sync button
    if (syncBtn) {
        syncBtn.addEventListener('click', async () => {
            syncBtn.classList.add('spinning');
            syncBtn.disabled = true;
            await new Promise(r => setTimeout(r, 1000));
            try {
                const res  = await fetch('/api/sync', {
                    method : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body   : JSON.stringify({ url: window.location.href })
                });
                const data = await res.json();
                if (data.message) {
                    appendMessage('✅ Knowledge Synced! My information has been updated.', 'incoming');
                } else throw new Error('Sync failed');
            } catch {
                appendMessage("⚠️ Couldn't sync right now. Using existing knowledge.", 'incoming');
            } finally {
                syncBtn.classList.remove('spinning');
                syncBtn.disabled = false;
            }
        });
    }
});
