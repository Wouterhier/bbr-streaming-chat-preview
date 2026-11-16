const wait = (milliseconds, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
  const timer = setTimeout(resolve, milliseconds);
  signal?.addEventListener('abort', () => {
    clearTimeout(timer);
    reject(new DOMException('Aborted', 'AbortError'));
  }, { once: true });
});

function replyFor(message) {
  const lower = message.toLowerCase();
  if (/discovery|book|call/.test(lower)) {
    return 'A discovery call is a relaxed, 15-minute phone conversation to learn what you are looking for and explain possible next steps. It is not a surgical consultation, and there is no pressure to book treatment. You can use the discovery-call calendar here whenever you are ready.';
  }
  if (/hour|open|location|where/.test(lower)) {
    return 'I can help with general practice questions, but I do not have verified live hours or location details in this isolated preview. The practice team can confirm those details during a discovery call.';
  }
  if (/pain|emergency|bleeding|fever/.test(lower)) {
    return 'I cannot assess urgent or clinical symptoms. Please contact a qualified medical professional promptly, or emergency services if this may be an emergency. For non-urgent practice questions, the team can help on a discovery call.';
  }
  return 'Thanks for your question. In this preview I can explain the discovery-call process and show how a streamed answer will feel. A connected version would route practice-specific questions to approved information, without making clinical recommendations.';
}

export class MockChatIntegration {
  constructor({ delayMs = 24 } = {}) {
    this.delayMs = delayMs;
  }

  async *streamReply({ message, signal }) {
    const chunks = replyFor(message).match(/\S+\s*/g) || [];
    for (const chunk of chunks) {
      await wait(this.delayMs, signal);
      yield chunk;
    }
  }
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function nextBusinessDays(now, count) {
  const days = [];
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  while (days.length < count) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) {
      days.push(isoDate(cursor));
    }
  }
  return days;
}

const TIMES = [
  ['09:00', '9:00 AM'],
  ['10:30', '10:30 AM'],
  ['13:00', '1:00 PM'],
  ['15:30', '3:30 PM'],
];

export class MockDiscoveryIntegration {
  constructor({ now = () => new Date(), timeZone = 'America/Chicago', durationMinutes = 15 } = {}) {
    this.now = now;
    this.timeZone = timeZone;
    this.durationMinutes = durationMinutes;
    this.slots = new Map();
  }

  async getDiscoveryCallDays({ count = 5, signal } = {}) {
    await wait(90, signal);
    const days = nextBusinessDays(this.now(), count).map((date, dayIndex) => ({
      date,
      slots: TIMES.slice(0, dayIndex === 0 ? 3 : 4).map(([time, label]) => {
        const id = `mock-${date}-${time.replace(':', '')}`;
        const slot = { id, date, time, label, eventType: 'discovery-call' };
        this.slots.set(id, slot);
        return slot;
      }),
    }));
    return { eventType: 'discovery-call', timeZone: this.timeZone, durationMinutes: this.durationMinutes, days };
  }

  async bookDiscoveryCall({ slotId, contact, signal }) {
    await wait(120, signal);
    const slot = this.slots.get(slotId);
    if (!slot || slot.eventType !== 'discovery-call') {
      throw new Error('Select an available mock discovery-call time.');
    }
    if (!contact || ['firstName', 'lastName', 'email', 'phone'].some((field) => !contact[field])) {
      throw new Error('First name, last name, email, and phone are required at booking.');
    }
    return {
      simulated: true,
      status: 'simulated',
      confirmationCode: `DEMO-${Date.now().toString(36).toUpperCase()}`,
      eventType: 'discovery-call',
      slot,
      timeZone: this.timeZone,
    };
  }
}
