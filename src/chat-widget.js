import {
  createChatState,
  chooseIntent,
  submitPreChat,
  skipPreChat,
  validateContact,
  normalizeContact,
} from './state.js';

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));

const icons = {
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"/></svg>',
  question: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-11.7 7.1L4 20l1.4-4.3A8 8 0 1 1 20 11.5Z"/><path d="M9.7 9a2.4 2.4 0 0 1 4.6 1c0 1.8-2.3 1.9-2.3 3.3m0 2.2h.01"/></svg>',
  minimize: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
  send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 17 8-17 8 3-8-3-8Zm3 8h14"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
};

function fieldMarkup({ name, label, type = 'text', autocomplete, values = {}, errors = {}, required = true }) {
  const value = values[name] || '';
  const error = errors[name] || '';
  return `<label class="field ${error ? 'has-error' : ''}">
    <span>${label}${required ? ' <b aria-hidden="true">*</b>' : ''}</span>
    <input name="${name}" type="${type}" autocomplete="${autocomplete}" value="${escapeHtml(value)}" ${required ? 'required' : ''} aria-invalid="${error ? 'true' : 'false'}" ${error ? `aria-describedby="${name}-error"` : ''}>
    ${error ? `<small class="field-error" id="${name}-error">${escapeHtml(error)}</small>` : ''}
  </label>`;
}

function formatDay(dateString) {
  const date = new Date(`${dateString}T12:00:00Z`);
  return {
    weekday: new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(date),
    day: new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: 'UTC' }).format(date),
    month: new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(date),
    long: new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(date),
  };
}

export class ChatWidget {
  constructor(root, { config, chatIntegration, discoveryIntegration }) {
    this.root = root;
    this.config = config;
    this.chatIntegration = chatIntegration;
    this.discoveryIntegration = discoveryIntegration;
    this.state = { ...createChatState(), preChatMode: config.preChatMode };
    this.preChatDraft = {};
    this.preChatFieldErrors = {};
    this.bookingDraft = {};
    this.bookingFieldErrors = {};
    this.abortController = null;
    this.messageId = 0;
    this.renderQueued = false;

    this.root.innerHTML = `
      <div class="chat-launcher-wrap">
        <button class="chat-launcher" type="button" data-action="open" aria-label="Open chat with the Body by Ravi preview concierge">
          <span class="launcher-avatar"><img src="./assets/stock-woman.jpg" alt="" width="112" height="112"><i aria-hidden="true"></i></span>
          <span class="launcher-copy"><strong>Hi there!</strong><span>How can we help?</span></span>
          <span class="launcher-chat-icon" aria-hidden="true">${icons.question}</span>
        </button>
      </div>
      <section class="chat-panel" role="dialog" aria-modal="false" aria-labelledby="chat-title" hidden data-streaming="false">
        <header class="chat-header">
          <div class="header-avatar"><img src="./assets/stock-woman.jpg" alt="" width="88" height="88"><i aria-hidden="true"></i></div>
          <div class="header-copy"><span class="preview-pill">TEST PREVIEW</span><h2 id="chat-title" tabindex="-1">${escapeHtml(config.brandName)}</h2><p>Here to help, at your pace</p></div>
          <div class="chat-controls">
            <button type="button" data-action="minimize" aria-label="Minimize chat" title="Minimize chat">${icons.minimize}<span>Minimize</span></button>
            <button type="button" data-action="close" aria-label="Close chat" title="Close chat">${icons.close}<span>Close</span></button>
          </div>
        </header>
        <div class="chat-body" tabindex="-1"></div>
        <div class="chat-footer"></div>
        <div class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>
      </section>`;

    this.launcherWrap = this.root.querySelector('.chat-launcher-wrap');
    this.launcher = this.root.querySelector('.chat-launcher');
    this.panel = this.root.querySelector('.chat-panel');
    this.body = this.root.querySelector('.chat-body');
    this.footer = this.root.querySelector('.chat-footer');
    this.liveRegion = this.root.querySelector('.sr-only');

    this.root.addEventListener('click', (event) => this.onClick(event));
    this.root.addEventListener('submit', (event) => this.onSubmit(event));
    this.root.addEventListener('input', (event) => this.onInput(event));
    this.root.addEventListener('keydown', (event) => this.onKeydown(event));
    document.querySelectorAll('[data-open-chat]').forEach((button) => {
      button.addEventListener('click', () => this.open());
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.state.open) this.minimize();
    });
    this.render();
  }

  onClick(event) {
    const button = event.target.closest('[data-action], [data-intent], [data-date], [data-slot]');
    if (!button) return;
    if (button.dataset.intent) return this.selectIntent(button.dataset.intent);
    if (button.dataset.date) {
      this.state.calendar.selectedDate = button.dataset.date;
      this.state.calendar.selectedSlotId = null;
      this.state.calendar.step = 'slots';
      return this.render();
    }
    if (button.dataset.slot) {
      this.state.calendar.selectedSlotId = button.dataset.slot;
      this.state.calendar.step = 'details';
      this.bookingDraft = { ...(this.state.contact || {}) };
      this.bookingFieldErrors = {};
      this.render();
      return this.focusFirstEmptyBookingField();
    }
    const actions = {
      open: () => this.open(),
      minimize: () => this.minimize(),
      close: () => this.close(),
      'skip-prechat': () => this.skipPreChat(),
      'back-welcome': () => { this.state.phase = 'welcome'; this.state.intent = null; this.render(); },
      'stop-stream': () => this.abortController?.abort(),
      'switch-ask': () => this.switchToAsk(),
      'start-over': () => this.startOver(),
    };
    actions[button.dataset.action]?.();
  }

  onSubmit(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    if (event.target.matches('[data-form="prechat"]')) {
      this.preChatDraft = normalizeContact(data);
      const validation = validateContact(data);
      this.preChatFieldErrors = validation.errors;
      this.state = submitPreChat(this.state, data);
      this.render();
      if (this.state.phase === 'chat') this.beginIntent();
    }
    if (event.target.matches('[data-form="booking"]')) this.book(data);
    if (event.target.matches('[data-form="composer"]')) this.sendMessage(String(data.message || '').trim());
  }

  onInput(event) {
    const input = event.target;
    if (!input.matches('.field input')) return;
    const form = input.closest('form');
    const values = Object.fromEntries(new FormData(form));
    const isBooking = form.matches('[data-form="booking"]');
    const draft = normalizeContact(values);
    if (isBooking) {
      this.bookingDraft = draft;
      delete this.bookingFieldErrors[input.name];
      if (this.state.calendar) this.state.calendar.bookingError = '';
    } else {
      this.preChatDraft = draft;
      delete this.preChatFieldErrors[input.name];
      this.state.preChatError = '';
    }
    const field = input.closest('.field');
    field.classList.remove('has-error');
    input.setAttribute('aria-invalid', 'false');
    input.removeAttribute('aria-describedby');
    field.querySelector('.field-error')?.remove();
    if (!form.querySelector('.field-error')) form.querySelector('.form-error')?.remove();
  }

  onKeydown(event) {
    if (event.target.matches('textarea[name="message"]') && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.target.closest('form').requestSubmit();
    }
  }

  open() {
    this.state.open = true;
    this.state.minimized = false;
    this.state.closed = false;
    this.render();
    requestAnimationFrame(() => this.panel.querySelector('#chat-title')?.focus({ preventScroll: true }));
  }

  minimize() {
    this.state.open = false;
    this.state.minimized = true;
    this.state.closed = false;
    this.render();
    this.launcher.focus({ preventScroll: true });
  }

  close() {
    this.abortController?.abort();
    this.state.open = false;
    this.state.minimized = false;
    this.state.closed = true;
    this.state.streaming = false;
    this.render();
    this.launcher.focus({ preventScroll: true });
  }

  selectIntent(intent) {
    this.state = chooseIntent(this.state, intent);
    this.preChatDraft = { ...(this.state.contact || {}) };
    this.preChatFieldErrors = {};
    this.render();
    requestAnimationFrame(() => this.body.querySelector('input')?.focus());
  }

  skipPreChat() {
    this.state = skipPreChat(this.state);
    this.preChatDraft = {};
    this.preChatFieldErrors = {};
    this.render();
    if (this.state.phase === 'chat') this.beginIntent();
  }

  startOver() {
    this.abortController?.abort();
    this.state = { ...createChatState(), preChatMode: this.config.preChatMode, open: true };
    this.preChatDraft = {};
    this.bookingDraft = {};
    this.render();
  }

  addMessage(role, content) {
    const message = { id: ++this.messageId, role, content };
    this.state.messages.push(message);
    return message;
  }

  async beginIntent() {
    if (this.state.intent === 'book') {
      this.addMessage('user', 'I’d like to book a discovery call.');
      this.addMessage('assistant', 'Absolutely. Choose a time that works for you. This is a discovery call, not a generic consultation.');
      this.state.calendar = { loading: true, error: '', step: 'slots', selectedDate: null, selectedSlotId: null };
      this.render();
      try {
        const result = await this.discoveryIntegration.getDiscoveryCallDays({ count: 5 });
        this.state.calendar = {
          ...result,
          loading: false,
          error: '',
          step: 'slots',
          selectedDate: result.days[0]?.date || null,
          selectedSlotId: null,
          booking: false,
        };
        this.state.status = 'Mock discovery-call availability loaded.';
      } catch (error) {
        this.state.calendar = { loading: false, error: error.message, step: 'slots' };
        this.state.status = 'Calendar could not be loaded.';
      }
      this.render();
      return;
    }
    this.addMessage('user', 'I have a question.');
    this.addMessage('assistant', 'Of course—what would you like to know? I’ll keep things clear and pressure-free.');
    this.state.status = 'Ready for your question.';
    this.render();
    requestAnimationFrame(() => this.footer.querySelector('textarea')?.focus());
  }

  switchToAsk() {
    this.state.intent = 'ask';
    this.state.calendar = null;
    this.addMessage('assistant', 'No problem. What question can I help with?');
    this.render();
    requestAnimationFrame(() => this.footer.querySelector('textarea')?.focus());
  }

  async sendMessage(text) {
    if (!text || this.state.streaming) return;
    if (text.length > 2000) {
      this.state.status = 'Please keep your message under 2,000 characters.';
      this.render();
      return;
    }
    const history = this.state.messages.slice(-8).map(({ role, content }) => ({ role, content }));
    this.addMessage('user', text);
    const assistant = this.addMessage('assistant', '');
    this.state.streaming = true;
    this.state.status = 'The preview concierge is responding.';
    this.abortController = new AbortController();
    this.render();
    try {
      const stream = this.chatIntegration.streamReply({
        message: text,
        history,
        signal: this.abortController.signal,
      });
      for await (const chunk of stream) {
        assistant.content += chunk;
        this.scheduleRender();
      }
      this.state.status = 'Response complete.';
    } catch (error) {
      if (error.name === 'AbortError') {
        this.state.status = 'Response stopped.';
        if (!assistant.content) assistant.content = 'Response stopped. You can send your question again when you’re ready.';
      } else {
        assistant.content = 'I couldn’t load that response. Please try again in a moment.';
        this.state.status = 'The response could not be loaded.';
      }
    } finally {
      this.state.streaming = false;
      this.abortController = null;
      this.render();
      this.footer.querySelector('textarea')?.focus({ preventScroll: true });
    }
  }

  async book(fields) {
    const calendar = this.state.calendar;
    if (!calendar?.selectedSlotId || calendar.booking) return;
    this.bookingDraft = normalizeContact(fields);
    const validation = validateContact(fields);
    this.bookingFieldErrors = validation.errors;
    if (!validation.valid) {
      calendar.bookingError = 'Please complete all four details before requesting your discovery call.';
      this.render();
      return;
    }
    calendar.booking = true;
    calendar.bookingError = '';
    this.render();
    try {
      const confirmation = await this.discoveryIntegration.bookDiscoveryCall({
        slotId: calendar.selectedSlotId,
        contact: validation.contact,
      });
      this.state.contact = validation.contact;
      calendar.confirmation = confirmation;
      calendar.step = 'confirmed';
      calendar.booking = false;
      this.state.status = confirmation.simulated
        ? 'Simulated discovery-call booking complete. No real appointment was created.'
        : 'Discovery-call booking response received.';
    } catch (error) {
      calendar.booking = false;
      calendar.bookingError = error.message;
      this.state.status = 'The discovery-call request could not be completed.';
    }
    this.render();
  }

  focusFirstEmptyBookingField() {
    requestAnimationFrame(() => {
      const inputs = [...this.body.querySelectorAll('[data-form="booking"] input')];
      (inputs.find((input) => !input.value) || inputs[0])?.focus();
    });
  }

  scheduleRender() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.render();
    });
  }

  render() {
    this.launcherWrap.hidden = this.state.open;
    this.panel.hidden = !this.state.open;
    this.panel.dataset.streaming = String(this.state.streaming);
    this.panel.dataset.phase = this.state.phase;
    this.root.dataset.integration = this.config.integrationMode;
    const copy = this.launcher.querySelector('.launcher-copy');
    copy.querySelector('strong').textContent = this.state.minimized ? 'Welcome back' : this.state.closed ? 'Chat when you’re ready' : 'Hi there!';
    copy.querySelector('span').textContent = this.state.minimized ? 'Your chat is still here' : 'How can we help?';
    this.launcher.setAttribute('aria-label', `${this.state.minimized ? 'Reopen minimized' : 'Open'} chat with the ${this.config.brandName} preview concierge`);
    this.liveRegion.textContent = this.state.status;

    if (!this.state.open) return;
    if (this.state.phase === 'welcome') this.body.innerHTML = this.renderWelcome();
    if (this.state.phase === 'prechat') this.body.innerHTML = this.renderPreChat();
    if (this.state.phase === 'chat') this.body.innerHTML = this.renderConversation();
    this.footer.innerHTML = this.renderFooter();
    requestAnimationFrame(() => {
      if (this.state.phase === 'chat') this.body.scrollTop = this.body.scrollHeight;
    });
  }

  renderWelcome() {
    return `<div class="welcome-view">
      <p class="chat-eyebrow">A HELPFUL FIRST STEP</p>
      <h3>How would you like<br>to start?</h3>
      <p class="welcome-copy">Whether you’re ready to talk or simply curious, there’s a place for you here.</p>
      <div class="quick-actions">
        <button type="button" data-intent="book">
          <span class="quick-icon">${icons.calendar}</span>
          <span><strong>Book a discovery call</strong><small>A relaxed, 15-minute phone chat</small></span>
          ${icons.arrow}
        </button>
        <button type="button" data-intent="ask">
          <span class="quick-icon">${icons.question}</span>
          <span><strong>Ask a question</strong><small>Get a clear, streamed response</small></span>
          ${icons.arrow}
        </button>
      </div>
      <p class="mock-note"><i aria-hidden="true"></i> Isolated demo · no live messages or bookings</p>
    </div>`;
  }

  renderPreChat() {
    const mandatory = this.config.preChatMode === 'mandatory';
    const book = this.state.intent === 'book';
    const common = { values: this.preChatDraft, errors: this.preChatFieldErrors, required: mandatory };
    return `<div class="prechat-view">
      <button class="text-button back-button" type="button" data-action="back-welcome">← Back</button>
      <span class="intent-chip">${book ? icons.calendar : icons.question}${book ? 'Discovery call' : 'General question'}</span>
      <h3>A little about you</h3>
      <p>${mandatory ? 'Please share your details to continue.' : 'Share your details now, or continue without sharing. If you book, we’ll ask for anything needed then.'}</p>
      ${this.state.preChatError ? `<p class="form-error" role="alert">${escapeHtml(this.state.preChatError)}</p>` : ''}
      <form data-form="prechat" novalidate>
        <div class="field-row">
          ${fieldMarkup({ name: 'firstName', label: 'First name', autocomplete: 'given-name', ...common })}
          ${fieldMarkup({ name: 'lastName', label: 'Last name', autocomplete: 'family-name', ...common })}
        </div>
        ${fieldMarkup({ name: 'email', label: 'Email', type: 'email', autocomplete: 'email', ...common })}
        ${fieldMarkup({ name: 'phone', label: 'Phone', type: 'tel', autocomplete: 'tel', ...common })}
        <button class="primary-button" type="submit">Continue ${icons.arrow}</button>
        ${mandatory ? '<p class="required-note">All four fields are required in mandatory mode.</p>' : '<button class="text-button skip-button" type="button" data-action="skip-prechat">Continue without sharing</button>'}
      </form>
      <p class="privacy-note">Preview only: details remain in memory and are never sent to a live system.</p>
    </div>`;
  }

  renderConversation() {
    const messages = this.state.messages.map((message, index) => {
      const streaming = this.state.streaming && message.role === 'assistant' && index === this.state.messages.length - 1;
      return `<div class="message-row ${message.role}">
        ${message.role === 'assistant' ? '<span class="message-monogram" aria-hidden="true">bbr</span>' : ''}
        <div><span class="message-author">${message.role === 'user' ? 'You' : 'Preview concierge'}</span>
        <p class="message-bubble">${escapeHtml(message.content)}${streaming ? '<i class="stream-caret" aria-hidden="true"></i>' : ''}</p></div>
      </div>`;
    }).join('');
    return `<div class="conversation">${messages}${this.state.calendar ? this.renderCalendar() : ''}</div>`;
  }

  renderCalendar() {
    const calendar = this.state.calendar;
    if (calendar.loading) {
      return `<section class="calendar-card" aria-label="Loading discovery-call calendar"><div class="calendar-heading"><span>${icons.calendar}</span><div><p>DISCOVERY CALL</p><h4>Finding a time for you…</h4></div></div><div class="calendar-skeleton"><i></i><i></i><i></i><i></i></div></section>`;
    }
    if (calendar.error) {
      return `<section class="calendar-card"><p class="form-error" role="alert">${escapeHtml(calendar.error)}</p></section>`;
    }
    if (calendar.step === 'confirmed') return this.renderConfirmation();

    const days = calendar.days || [];
    const selectedDay = days.find((day) => day.date === calendar.selectedDate) || days[0];
    const selectedSlot = selectedDay?.slots.find((slot) => slot.id === calendar.selectedSlotId);
    return `<section class="calendar-card" aria-labelledby="calendar-title">
      <div class="calendar-heading"><span>${icons.calendar}</span><div><p>DISCOVERY CALL · ${calendar.durationMinutes} MIN</p><h4 id="calendar-title">Choose a time to talk</h4></div></div>
      <p class="calendar-explainer">A friendly phone call about your goals and next steps—not a generic consult.</p>
      <div class="date-strip" role="group" aria-label="Available discovery-call dates">
        ${days.map((day) => {
          const formatted = formatDay(day.date);
          const selected = day.date === selectedDay?.date;
          return `<button type="button" data-date="${day.date}" class="date-button ${selected ? 'selected' : ''}" aria-pressed="${selected}" aria-label="${formatted.long}"><span>${formatted.weekday}</span><strong>${formatted.day}</strong><small>${formatted.month}</small></button>`;
        }).join('')}
      </div>
      <p class="timezone-note">Times shown in ${escapeHtml(calendar.timeZone)}</p>
      <div class="time-grid" role="group" aria-label="Available times for ${selectedDay ? formatDay(selectedDay.date).long : ''}">
        ${(selectedDay?.slots || []).map((slot) => `<button type="button" data-slot="${slot.id}" class="time-button ${slot.id === calendar.selectedSlotId ? 'selected' : ''}" aria-pressed="${slot.id === calendar.selectedSlotId}">${slot.label}</button>`).join('')}
      </div>
      ${calendar.step === 'details' && selectedSlot ? this.renderBookingForm(selectedDay, selectedSlot) : '<p class="slot-prompt">Select a time to continue.</p>'}
    </section>`;
  }

  renderBookingForm(day, slot) {
    const common = { values: this.bookingDraft, errors: this.bookingFieldErrors, required: true };
    return `<form class="booking-form" data-form="booking" novalidate>
      <div class="selected-time">${icons.check}<span><strong>${formatDay(day.date).long}</strong><small>${slot.label} · ${escapeHtml(this.state.calendar.timeZone)}</small></span></div>
      <h5>Your booking details</h5>
      <p>${this.state.preChatSkipped && !this.state.contact ? 'You continued without sharing. Please add these details now so the team can arrange your call.' : 'Review your details before requesting the call.'}</p>
      ${this.state.calendar.bookingError ? `<p class="form-error" role="alert">${escapeHtml(this.state.calendar.bookingError)}</p>` : ''}
      <div class="field-row">
        ${fieldMarkup({ name: 'firstName', label: 'First name', autocomplete: 'given-name', ...common })}
        ${fieldMarkup({ name: 'lastName', label: 'Last name', autocomplete: 'family-name', ...common })}
      </div>
      ${fieldMarkup({ name: 'email', label: 'Email', type: 'email', autocomplete: 'email', ...common })}
      ${fieldMarkup({ name: 'phone', label: 'Phone', type: 'tel', autocomplete: 'tel', ...common })}
      ${this.config.integrationMode === 'mock' ? '<p class="simulation-note">Simulation only: no real appointment will be created.</p>' : ''}
      <button class="primary-button" type="submit" ${this.state.calendar.booking ? 'disabled' : ''}>${this.state.calendar.booking ? '<span class="button-spinner"></span> Requesting…' : `Request discovery call ${icons.arrow}`}</button>
    </form>`;
  }

  renderConfirmation() {
    const confirmation = this.state.calendar.confirmation;
    return `<section class="confirmation-card" aria-labelledby="confirmation-title">
      <span class="confirmation-icon">${icons.check}</span>
      <p class="chat-eyebrow">${confirmation.simulated ? 'TEST REQUEST COMPLETE' : 'DISCOVERY CALL REQUEST'}</p>
      <h4 id="confirmation-title">${confirmation.simulated ? 'Your demo is all set.' : 'Your request was received.'}</h4>
      <p>${formatDay(confirmation.slot.date).long}<br><strong>${confirmation.slot.label} · ${escapeHtml(confirmation.timeZone)}</strong></p>
      <div class="confirmation-code"><span>Confirmation</span><strong>${escapeHtml(confirmation.confirmationCode)}</strong></div>
      ${confirmation.simulated ? '<p class="simulation-note">No real appointment was booked and no message was sent.</p>' : ''}
      <button type="button" class="text-button" data-action="switch-ask">Ask a general question instead</button>
    </section>`;
  }

  renderFooter() {
    if (this.state.phase !== 'chat' || this.state.intent !== 'ask') return '';
    return `<form class="composer" data-form="composer">
      <label class="sr-only" for="chat-message">Type your question</label>
      <textarea id="chat-message" name="message" rows="1" maxlength="2000" placeholder="Type your question…" ${this.state.streaming ? 'disabled' : ''}></textarea>
      ${this.state.streaming
        ? `<button class="send-button stop-button" type="button" data-action="stop-stream" aria-label="Stop streaming response" title="Stop response">${icons.stop}</button>`
        : `<button class="send-button" type="submit" aria-label="Send question" title="Send question">${icons.send}</button>`}
      <p>General information only · not medical advice</p>
    </form>`;
  }
}
