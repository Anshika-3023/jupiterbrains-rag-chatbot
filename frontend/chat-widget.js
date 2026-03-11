/**
 * JupiterBrains RAG Chat Widget  v1.2.0
 * ─────────────────────────────────────────────────────────────────
 * Self-contained floating chat widget that connects to the FastAPI
 * RAG backend. Zero dependencies — pure vanilla JS.
 *
 * USAGE (any HTML page):
 *   <link rel="stylesheet" href="chat-widget.css">
 *   <script>
 *     window.JBChatConfig = {
 *       apiUrl: "http://localhost:8000"   // your backend URL
 *     };
 *   </script>
 *   <script src="chat-widget.js" defer></script>
 *
 * FUTURE FRAMER INTEGRATION:
 *   1. Host both files on a CDN.
 *   2. Add an Embed component in Framer.
 *   3. Paste the snippet above with your live backend URL.
 *   4. Set ALLOWED_ORIGINS in backend .env to your Framer domain.
 *   No code changes needed — CORS and API are already ready.
 *
 * PUBLIC API:
 *   window.JBChat.open()         — open the chat window
 *   window.JBChat.close()        — close the chat window
 *   window.JBChat.send("text")   — programmatically send a message
 * ─────────────────────────────────────────────────────────────────
 */

(function () {
  "use strict";

  /* ── Config ─────────────────────────────────────────────────────────────── */
  const cfg = Object.assign(
    {
      apiUrl:         "http://localhost:8000",
      botName:        "Jupiter",
      botSubtitle:    "JupiterBrains AI Assistant",
      welcomeMessage: "Hi there 👋 I'm Jupiter, your AI guide to JupiterBrains. Ask me about our products, on-premise AI deployment, industries we serve, or our performance guarantee!",
      suggestions: [
        "What products do you offer?",
        "How does on-premise deployment work?",
        "What is your money-back guarantee?",
        "Which industries do you support?",
      ],
      showSources: true,
      maxHistory:  30,
    },
    window.JBChatConfig || {}
  );

  /* ── State ──────────────────────────────────────────────────────────────── */
  let isOpen    = false;
  let isLoading = false;
  let history   = [];

  /* ── SVG icons ──────────────────────────────────────────────────────────── */
  const ICON_CHAT  = `<svg viewBox="0 0 24 24"><path d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`;
  const ICON_CLOSE = `<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
  const ICON_SEND  = `<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`;

  /* ── Tiny DOM helper ────────────────────────────────────────────────────── */
  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === "class") e.className = v;
      else if (k === "html") e.innerHTML = v;
      else e.setAttribute(k, v);
    });
    (children || []).forEach(c => c && e.appendChild(c));
    return e;
  }
  const txt = s => document.createTextNode(s);

  /* ── Build DOM ──────────────────────────────────────────────────────────── */
  function build() {
    const root = el("div", { id: "jb-chat-root" });

    /* Launcher */
    const badge    = el("span", { id: "jb-badge" }, [txt("1")]);
    const launcher = el("button", { id: "jb-launcher", "aria-label": "Open chat", html: ICON_CHAT });
    launcher.appendChild(badge);
    launcher.addEventListener("click", toggle);

    /* Window */
    const win = el("div", {
      id: "jb-chat-window",
      role: "dialog",
      "aria-label": "JupiterBrains chat assistant",
    });

    /* Header */
    const avatar = el("div", { class: "jb-avatar" }, [txt("🪐")]);
    const info   = el("div", { class: "jb-header-info" });
    info.appendChild(el("div", { class: "jb-header-name" }, [txt(cfg.botName)]));
    const sub = el("div", { class: "jb-header-sub" });
    sub.appendChild(el("span", { class: "jb-online-dot" }));
    sub.appendChild(txt(cfg.botSubtitle));
    info.appendChild(sub);
    const closeBtn = el("button", { id: "jb-close-btn", "aria-label": "Close", html: "×" });
    closeBtn.addEventListener("click", toggle);
    const header = el("div", { id: "jb-header" }, [avatar, info, closeBtn]);

    /* Messages */
    const msgs = el("div", { id: "jb-messages", "aria-live": "polite" });

    /* Suggestions */
    const sugBar = el("div", { id: "jb-suggestions" });
    cfg.suggestions.forEach(q => {
      const chip = el("button", { class: "jb-chip" }, [txt(q)]);
      chip.addEventListener("click", () => { hideSuggestions(); sendMessage(q); });
      sugBar.appendChild(chip);
    });

    /* Input */
    const input = el("textarea", {
      id: "jb-input",
      placeholder: "Ask me anything…",
      rows: "1",
      "aria-label": "Chat input",
    });
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); triggerSend(); }
    });
    input.addEventListener("input", autoResize);

    const sendBtn = el("button", { id: "jb-send-btn", "aria-label": "Send", html: ICON_SEND });
    sendBtn.addEventListener("click", triggerSend);

    const inputArea = el("div", { id: "jb-input-area" }, [input, sendBtn]);
    win.append(header, msgs, sugBar, inputArea);
    root.append(launcher, win);
    document.body.appendChild(root);

    appendBotMessage(cfg.welcomeMessage);
  }

  /* ── Toggle ─────────────────────────────────────────────────────────────── */
  function toggle() {
    isOpen = !isOpen;
    const win     = document.getElementById("jb-chat-window");
    const launcher = document.getElementById("jb-launcher");
    const badge    = document.getElementById("jb-badge");

    if (isOpen) {
      win.classList.add("jb-open");
      launcher.innerHTML = ICON_CLOSE;
      badge.style.display = "none";
      document.getElementById("jb-input").focus();
    } else {
      win.classList.remove("jb-open");
      launcher.innerHTML = ICON_CHAT;
      launcher.appendChild(badge);
    }
  }

  /* ── Render helpers ─────────────────────────────────────────────────────── */
  function appendBotMessage(text, sources) {
    const msgs   = document.getElementById("jb-messages");
    const bubble = el("div", { class: "jb-bubble" }, [txt(text)]);
    const wrap   = el("div", { class: "jb-msg bot" }, [bubble]);

    if (cfg.showSources && sources && sources.length) {
      const bar = el("div", { class: "jb-sources" });
      sources.forEach(s => bar.appendChild(el("span", { class: "jb-source-chip" }, [txt(s)])));
      wrap.appendChild(bar);
    }
    msgs.appendChild(wrap);
    scrollBottom();
    return wrap;
  }

  function appendUserMessage(text) {
    const msgs = document.getElementById("jb-messages");
    msgs.appendChild(
      el("div", { class: "jb-msg user" }, [
        el("div", { class: "jb-bubble" }, [txt(text)])
      ])
    );
    scrollBottom();
  }

  function showTyping() {
    const msgs   = document.getElementById("jb-messages");
    const bubble = el("div", { class: "jb-bubble" });
    [1,2,3].forEach(() => bubble.appendChild(el("span", { class: "jb-dot" })));
    msgs.appendChild(el("div", { class: "jb-msg bot jb-typing", id: "jb-typing" }, [bubble]));
    scrollBottom();
  }

  function removeTyping() {
    document.getElementById("jb-typing")?.remove();
  }

  function hideSuggestions() {
    const bar = document.getElementById("jb-suggestions");
    if (bar) bar.style.display = "none";
  }

  function scrollBottom() {
    const m = document.getElementById("jb-messages");
    m.scrollTop = m.scrollHeight;
  }

  function autoResize() {
    const i = document.getElementById("jb-input");
    i.style.height = "auto";
    i.style.height = Math.min(i.scrollHeight, 100) + "px";
  }

  /* ── Send ───────────────────────────────────────────────────────────────── */
  function triggerSend() {
    const input = document.getElementById("jb-input");
    const text  = input.value.trim();
    if (!text || isLoading) return;
    input.value = "";
    input.style.height = "auto";
    sendMessage(text);
  }

  async function sendMessage(text) {
    if (isLoading) return;
    hideSuggestions();
    appendUserMessage(text);
    setLoading(true);
    showTyping();

    history.push({ role: "user", content: text });
    if (history.length > cfg.maxHistory) history = history.slice(-cfg.maxHistory);

    try {
      const res = await fetch(`${cfg.apiUrl}/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ question: text }),
      });
      removeTyping();

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${res.status}`);
      }

      const data    = await res.json();
      const answer  = data.answer  || "I couldn't find an answer to that.";
      const sources = data.sources || [];

      appendBotMessage(answer, sources);
      history.push({ role: "assistant", content: answer });

    } catch (err) {
      removeTyping();
      console.error("[JBChat]", err);
      appendBotMessage(
        "I'm having trouble connecting right now. Please try again or reach out via our contact form."
      );
    } finally {
      setLoading(false);
    }
  }

  function setLoading(state) {
    isLoading = state;
    const btn   = document.getElementById("jb-send-btn");
    const input = document.getElementById("jb-input");
    if (btn)   btn.disabled   = state;
    if (input) input.disabled = state;
  }

  /* ── Init ───────────────────────────────────────────────────────────────── */
  function init() {
    if (document.getElementById("jb-chat-root")) return;
    build();
    setTimeout(() => {
      if (!isOpen) {
        const badge = document.getElementById("jb-badge");
        if (badge) badge.style.display = "flex";
      }
    }, 3500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* ── Public API ─────────────────────────────────────────────────────────── */
  window.JBChat = {
    open:  () => { if (!isOpen) toggle(); },
    close: () => { if (isOpen)  toggle(); },
    send:  (text) => {
      if (!text || !text.trim()) return;
      if (!isOpen) toggle();
      sendMessage(text.trim());
    },
  };

})();