/**
 * JupiterBrains RAG Chat Widget  v3.2.0
 * CHANGES: Suggestions below greeting, visible scrollbar, hyperlink contact card,
 *          T&C dropdown in ···, padded inputs, Nilesh email shown on contact query
 */

(function () {
  "use strict";

  /* ── Config ─────────────────────────────────────────────────────────────── */
  const cfg = Object.assign(
    {
      apiUrl:            "http://localhost:8000",
      botName:           "Jupiter",
      botSubtitle:       "Active now",
      agentAvatar:       "🪐",
      welcomeMessage:    "Thank you for visiting JupiterBrains! Let me know if you have questions — I'm happy to help.",
      meetingUrl:        "https://calendly.com/nilesh-jupiterbrains/30min",
      nileshEmail:       "nilesh@jupiterbrains.com",
      termsUrl:          "https://www.jupiterbrains.com/terms",
      welcomePopupDelay: 2000,
      welcomePopupText:  "Thank you for visiting JupiterBrains! Let me know if you have questions — I'm happy to help. 🚀",
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
  let isOpen         = false;
  let isLoading      = false;
  let history        = [];
  let popupDismissed = false;

  const _saved       = localStorage.getItem("jb_user_email") || "";
  let userEmail      = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(_saved) ? _saved : "";
  let emailCaptured  = !!userEmail;

  /* ── SVG Icons ──────────────────────────────────────────────────────────── */
  const ICON_CHAT  = `<svg viewBox="0 0 24 24"><path d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`;
  const ICON_CLOSE = `<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
  const ICON_SEND  = `<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`;
  const ICON_EMOJI = `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5c-2.49 0-4.5-2.01-4.5-4.5h2c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5h2c0 2.49-2.01 4.5-4.5 4.5zM9 11c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm6 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/></svg>`;

  /* ── DOM Helper ─────────────────────────────────────────────────────────── */
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

  /* ═══════════════════════════════════════════════════════
     BUILD
  ═══════════════════════════════════════════════════════ */
  function build() {
    if (document.getElementById("jb-chat-root")) return;
    const root = el("div", { id: "jb-chat-root" });

    root.appendChild(buildWelcomePopup());

    const badge      = el("span", { id: "jb-badge" }, [txt("1")]);
    const iconOpen   = el("span", { class: "jb-icon-open",  html: ICON_CHAT  });
    const iconClose  = el("span", { class: "jb-icon-close", html: ICON_CLOSE });
    const launcher   = el("button", { id: "jb-launcher", type: "button", "aria-label": "Open chat" });
    launcher.append(iconOpen, iconClose, badge);
    launcher.addEventListener("click", (e) => { e.stopPropagation(); hidePopup(); toggle(); });
    root.appendChild(launcher);

    const win = el("div", { id: "jb-chat-window", role: "dialog" });
    win.addEventListener("click", e => e.stopPropagation());
    win.appendChild(buildHeader());

    const body = el("div", { id: "jb-body" });
    win.appendChild(body);

    if (emailCaptured) {
      body.appendChild(buildMessagesArea());
      win.appendChild(buildChatInput());
      setTimeout(() => appendBotMessage(cfg.welcomeMessage, [], true), 100);
    } else {
      body.appendChild(buildEmailScreen());
      win.appendChild(buildEmailInputBar());
    }

    root.appendChild(win);
    document.body.appendChild(root);

    setTimeout(() => {
      if (!isOpen && !popupDismissed) showPopup();
    }, cfg.welcomePopupDelay);

    setTimeout(() => {
      if (!isOpen) badge.style.display = "flex";
    }, 3500);
  }

  /* ── Header ─────────────────────────────────────────────────────────────── */
  function buildHeader() {
    const avatar = el("div", { class: "jb-h-avatar" }, [txt(cfg.agentAvatar)]);
    avatar.appendChild(el("span", { class: "jb-h-dot" }));

    const name = el("div", { class: "jb-h-name" }, [txt(cfg.botName)]);
    const sub  = el("div", { class: "jb-h-sub"  }, [txt(cfg.botSubtitle)]);
    const info = el("div", { class: "jb-h-info" }, [name, sub]);

    const moreBtn  = el("button", { type: "button", class: "jb-h-btn", html: "···" });
    const closeBtn = el("button", { type: "button", class: "jb-h-btn", html: "×" });
    closeBtn.addEventListener("click", (e) => { e.stopPropagation(); closeChat(); });

    /* ── Three-dots dropdown → Terms & Conditions ── */
    const dropdown = el("div", { class: "jb-more-dropdown" });
    const tcItem   = el("div", { class: "jb-more-item" }, [txt("📄 Terms & Conditions")]);
    tcItem.addEventListener("click", (e) => {
      e.stopPropagation();
      window.open(cfg.termsUrl, "_blank");
      dropdown.classList.remove("jb-more-open");
    });
    dropdown.appendChild(tcItem);

    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("jb-more-open");
    });
    document.addEventListener("click", () => dropdown.classList.remove("jb-more-open"));

    /* Wrap moreBtn + dropdown together for relative positioning */
    const moreWrap = el("div", { class: "jb-more-wrap" });
    moreWrap.append(moreBtn, dropdown);

    return el("div", { id: "jb-header" }, [avatar, info, moreWrap, closeBtn]);
  }

  /* ── Email Screen ───────────────────────────────────────────────────────── */
  function buildEmailScreen() {
    const screen  = el("div", { id: "jb-email-screen" });
    const hint    = el("div", { id: "jb-gate-hint" }, [txt("Ask us anything, or share your feedback.")]);

    const avatarEl = el("div", { class: "jb-msg-avatar" }, [txt(cfg.agentAvatar)]);
    const bubble   = el("div", { class: "jb-bubble" });
    bubble.appendChild(buildWelcomeBubbleContent());
    const msgWrap  = el("div", { class: "jb-msg bot" }, [bubble]);
    const label    = el("div", { class: "jb-msg-label" }, [txt(cfg.botName + " • 1m")]);
    const msgCol   = el("div", { class: "jb-msg-col" }, [msgWrap, label]);
    const msgRow   = el("div", { class: "jb-msg-row" }, [avatarEl, msgCol]);

    screen.append(hint, msgRow);
    return screen;
  }

  /* ── Email Input Bar ────────────────────────────────────────────────────── */
  function buildEmailInputBar() {
    const wrap = el("div", { id: "jb-email-input-wrap" });

    const emailInp = el("input", {
      id: "jb-email-field",
      type: "email",
      placeholder: "email@example.com",
      class: "jb-swif-input",
    });

    const msgInp = el("input", {
      id: "jb-msg-field",
      type: "text",
      placeholder: "Message...",
      class: "jb-swif-input jb-swif-input-last",
    });

    msgInp.addEventListener("keydown", e => { if (e.key === "Enter") submitEmailAndMessage(); });
    emailInp.addEventListener("keydown", e => { if (e.key === "Enter") msgInp.focus(); });

    const errorEl  = el("div", { id: "jb-field-error", class: "jb-field-error" });
    const emojiBtn = el("button", { type: "button", class: "jb-icon-btn", html: ICON_EMOJI });
    const sendBtn  = el("button", { id: "jb-gate-send", type: "button", class: "jb-send-round", html: ICON_SEND });
    sendBtn.addEventListener("click", submitEmailAndMessage);

    const row = el("div", { class: "jb-swif-row" }, [emojiBtn, sendBtn]);
    wrap.append(emailInp, msgInp, errorEl, row);
    return wrap;
  }

  /* ── Messages Area ──────────────────────────────────────────────────────── */
  /* Suggestion chips are injected INTO #jb-messages right after the welcome   */
  /* bubble so they appear immediately below the greeting, not stuck at bottom */
  function buildMessagesArea() {
    const msgs = el("div", { id: "jb-messages", "aria-live": "polite" });
    const wrap = el("div", { id: "jb-msgs-wrap" });
    wrap.appendChild(msgs);
    return wrap;
  }

  /* ── Build suggestion chips ─────────────────────────────────────────────── */
  function buildSuggestions() {
    const sugBar = el("div", { id: "jb-suggestions" });
    cfg.suggestions.forEach(q => {
      const chip = el("button", { type: "button", class: "jb-chip" }, [txt(q)]);
      chip.addEventListener("click", () => { hideSuggestions(); sendMessage(q); });
      sugBar.appendChild(chip);
    });
    return sugBar;
  }

  /* ── Chat Input ─────────────────────────────────────────────────────────── */
  function buildChatInput() {
    const input = el("textarea", {
      id: "jb-input",
      placeholder: "Ask me anything…",
      rows: "1",
    });
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); triggerSend(); }
    });
    input.addEventListener("input", autoResize);

    const sendBtn = el("button", { id: "jb-send-btn", type: "button", html: ICON_SEND });
    sendBtn.addEventListener("click", triggerSend);
    return el("div", { id: "jb-input-area" }, [input, sendBtn]);
  }

  /* ── Submit Email ───────────────────────────────────────────────────────── */
  async function submitEmailAndMessage() {
    const emailInp = document.getElementById("jb-email-field");
    const msgInp   = document.getElementById("jb-msg-field");
    const errorEl  = document.getElementById("jb-field-error");
    const sendBtn  = document.getElementById("jb-gate-send");

    const email   = (emailInp?.value || "").trim();
    const message = (msgInp?.value || "").trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errorEl.textContent = "Please enter a valid email address.";
      emailInp.style.borderBottomColor = "rgba(255,100,100,0.6)";
      emailInp.focus();
      return;
    }

    errorEl.textContent = "";
    if (sendBtn) sendBtn.disabled = true;

    localStorage.setItem("jb_user_email", email);
    userEmail     = email;
    emailCaptured = true;

    fetch(`${cfg.apiUrl}/save-email`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, name: "" }),
    }).catch(err => console.warn("[JBChat] Email save failed:", err));

    switchToChat(message || null);
  }

  /* ── Switch email screen → chat ─────────────────────────────────────────── */
  function switchToChat(firstMessage) {
    const body     = document.getElementById("jb-body");
    const emailBar = document.getElementById("jb-email-input-wrap");
    const win      = document.getElementById("jb-chat-window");

    body.style.transition = "opacity 0.2s";
    body.style.opacity    = "0";
    if (emailBar) {
      emailBar.style.transition = "opacity 0.2s";
      emailBar.style.opacity    = "0";
    }

    setTimeout(() => {
      body.innerHTML = "";
      body.appendChild(buildMessagesArea());
      body.style.opacity = "1";

      if (emailBar) emailBar.remove();
      win.appendChild(buildChatInput());

      // Welcome message; suggestions appended inside appendBotMessage(isWelcome=true)
      appendBotMessage(cfg.welcomeMessage, [], true);

      if (firstMessage) {
        setTimeout(() => sendMessage(firstMessage), 500);
      } else {
        setTimeout(() => document.getElementById("jb-input")?.focus(), 300);
      }
    }, 220);
  }

  /* ── Welcome Popup ──────────────────────────────────────────────────────── */
  function buildWelcomePopup() {
    const popup = el("div", { id: "jb-welcome-popup" });

    const avatarWrap = el("div", { class: "jb-popup-avatar-wrap" });
    avatarWrap.append(
      el("div", { class: "jb-popup-avatar" }, [txt(cfg.agentAvatar)]),
      el("span", { class: "jb-popup-online" })
    );

    const content = el("div", { class: "jb-popup-content" });
    content.append(
      el("div", { class: "jb-popup-agent" },     [txt(cfg.botName)]),
      el("div", { class: "jb-popup-agent-sub" }, [txt("Just now")]),
      el("div", { class: "jb-popup-text" },      [txt(cfg.welcomePopupText)])
    );

    const closeBtn = el("button", { id: "jb-popup-close", type: "button" }, [txt("×")]);
    closeBtn.addEventListener("click", e => { e.stopPropagation(); hidePopup(); });

    popup.append(avatarWrap, content, closeBtn);
    popup.addEventListener("click", () => { hidePopup(); if (!isOpen) toggle(); });
    return popup;
  }

  function showPopup() { document.getElementById("jb-welcome-popup")?.classList.add("jb-popup-visible"); }
  function hidePopup() {
    popupDismissed = true;
    document.getElementById("jb-welcome-popup")?.classList.remove("jb-popup-visible");
  }

  /* ── Open / Close ─────────────────────────────────────────────────────── */
  function openChat() {
    if (isOpen) return;
    isOpen = true;
    document.getElementById("jb-chat-window")?.classList.add("jb-open");
    document.getElementById("jb-launcher")?.classList.add("jb-launcher-open");
    const badge = document.getElementById("jb-badge");
    if (badge) badge.style.display = "none";
    setTimeout(() => {
      (document.getElementById("jb-email-field") ||
       document.getElementById("jb-input"))?.focus();
    }, 320);
  }

  function closeChat() {
    if (!isOpen) return;
    isOpen = false;
    document.getElementById("jb-chat-window")?.classList.remove("jb-open");
    document.getElementById("jb-launcher")?.classList.remove("jb-launcher-open");
    const badge = document.getElementById("jb-badge");
    if (badge) badge.style.display = "none";
  }

  function toggle() { if (isOpen) closeChat(); else openChat(); }

  /* ── Welcome bubble content ─────────────────────────────────────────────── */
  function buildWelcomeBubbleContent() {
    const frag = document.createDocumentFragment();
    frag.appendChild(txt(cfg.welcomeMessage));
    frag.appendChild(document.createElement("br"));
    frag.appendChild(document.createElement("br"));

    const link = el("a", {
      href:   cfg.meetingUrl,
      target: "_blank",
      rel:    "noopener noreferrer",
      class:  "jb-meeting-btn",
    }, [txt("📅 Book a meeting with our team")]);

    frag.appendChild(link);
    return frag;
  }

  /* ── Contact card — hyperlink + response note + Nilesh email ────────────── */
  function buildMeetingCard() {
    const card = el("div", { class: "jb-meeting-card" });

    // "Book a Call" hyperlink
    const line1    = el("div", { class: "jb-meeting-line" });
    const bookLink = el("a", {
      href:   cfg.meetingUrl,
      target: "_blank",
      rel:    "noopener noreferrer",
      class:  "jb-meeting-hyperlink",
    }, [txt("📅 Book a Call")]);
    line1.appendChild(bookLink);

    // Response-time message
    const line2 = el("div", { class: "jb-meeting-card-sub" },
      [txt("Our team will get back to you within 24 hrs.")]);

    // Nilesh's email
    const line3      = el("div", { class: "jb-meeting-line" });
    const emailLink  = el("a", {
      href:  "mailto:" + cfg.nileshEmail,
      class: "jb-meeting-hyperlink jb-meeting-email",
    }, [txt("📧 " + cfg.nileshEmail)]);
    line3.appendChild(emailLink);

    card.append(line1, line2, line3);
    return card;
  }

  /* ── Detect contact/booking intent ──────────────────────────────────────── */
  function isContactQuery(text) {
    const keywords = ["contact", "book", "meeting", "schedule", "call", "talk",
                      "reach", "demo", "connect", "calendly", "email", "touch"];
    return keywords.some(k => text.toLowerCase().includes(k));
  }

  /* ── Chat helpers ───────────────────────────────────────────────────────── */
  function appendBotMessage(text, sources, isWelcome) {
    const msgs = document.getElementById("jb-messages");
    if (!msgs) return;

    const bubble = el("div", { class: "jb-bubble" });
    if (isWelcome) {
      bubble.appendChild(buildWelcomeBubbleContent());
    } else {
      bubble.appendChild(txt(text));
    }

    const wrap = el("div", { class: "jb-msg bot" }, [bubble]);

    if (cfg.showSources && sources?.length) {
      const bar = el("div", { class: "jb-sources" });
      sources.forEach(s => bar.appendChild(el("span", { class: "jb-source-chip" }, [txt(s)])));
      wrap.appendChild(bar);
    }
    msgs.appendChild(wrap);

    /* ── Suggestion chips appear INSIDE the messages area, right below greeting ── */
    if (isWelcome) {
      msgs.appendChild(buildSuggestions());
    }

    scrollBottom();
  }

  function appendUserMessage(text) {
    const msgs = document.getElementById("jb-messages");
    if (!msgs) return;
    msgs.appendChild(
      el("div", { class: "jb-msg user" }, [el("div", { class: "jb-bubble" }, [txt(text)])])
    );
    scrollBottom();
  }

  function showTyping() {
    const msgs = document.getElementById("jb-messages");
    if (!msgs) return;
    const bubble = el("div", { class: "jb-bubble" });
    [1,2,3].forEach(() => bubble.appendChild(el("span", { class: "jb-dot" })));
    msgs.appendChild(el("div", { id: "jb-typing", class: "jb-msg bot jb-typing" }, [bubble]));
    scrollBottom();
  }

  function removeTyping()    { document.getElementById("jb-typing")?.remove(); }
  function hideSuggestions() {
    const b = document.getElementById("jb-suggestions");
    if (b) b.style.display = "none";
  }
  function scrollBottom() {
    const m = document.getElementById("jb-messages");
    if (m) m.scrollTop = m.scrollHeight;
  }
  function autoResize() {
    const i = document.getElementById("jb-input");
    if (!i) return;
    i.style.height = "auto";
    i.style.height = Math.min(i.scrollHeight, 100) + "px";
  }

  /* ── Send message ───────────────────────────────────────────────────────── */
  function triggerSend() {
    const input = document.getElementById("jb-input");
    const text  = (input?.value || "").trim();
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
        body:    JSON.stringify({ question: text, email: userEmail }),
      });
      removeTyping();
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      appendBotMessage(data.answer || "I couldn't find an answer.", data.sources || []);
      history.push({ role: "assistant", content: data.answer });

      // Contact query → show hyperlink card (no button)
      if (isContactQuery(text)) {
        const msgs = document.getElementById("jb-messages");
        if (msgs) {
          const cardWrap = el("div", { class: "jb-msg bot" });
          cardWrap.appendChild(buildMeetingCard());
          msgs.appendChild(cardWrap);
          scrollBottom();
        }
      }
    } catch (err) {
      removeTyping();
      appendBotMessage("I'm having trouble connecting right now. Please try again shortly.");
    } finally {
      setLoading(false);
    }
  }

  function setLoading(v) {
    isLoading = v;
    const btn   = document.getElementById("jb-send-btn");
    const input = document.getElementById("jb-input");
    if (btn)   btn.disabled   = v;
    if (input) input.disabled = v;
  }

  /* ── Init ───────────────────────────────────────────────────────────────── */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }

  /* ── Public API ─────────────────────────────────────────────────────────── */
  window.JBChat = {
    open:      () => { openChat(); },
    close:     () => { closeChat(); },
    resetUser: () => { localStorage.removeItem("jb_user_email"); location.reload(); },
  };

})();
