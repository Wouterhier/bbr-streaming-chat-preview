async function checkedResponse(response) {
  if (!response.ok) {
    const error = new Error(`Integration returned HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return response;
}

export class HttpChatIntegration {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  async *streamReply({ message, history, signal }) {
    const response = await fetch(`${this.baseUrl}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/plain' },
      body: JSON.stringify({ message, history }),
      signal,
    });
    await checkedResponse(response);
    if (!response.body) throw new Error('The chat integration did not return a stream.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (chunk) yield chunk;
    }
    const finalChunk = decoder.decode();
    if (finalChunk) yield finalChunk;
  }
}

export class HttpDiscoveryIntegration {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  async getDiscoveryCallDays({ count = 5, signal } = {}) {
    const response = await fetch(`${this.baseUrl}/discovery-call/slots?count=${count}`, {
      headers: { Accept: 'application/json' },
      signal,
    });
    await checkedResponse(response);
    const data = await response.json();
    const invalidSlot = !Array.isArray(data.days) || data.days.some((day) =>
      !Array.isArray(day.slots) || day.slots.some((slot) => slot.eventType !== 'discovery-call'));
    if (data.eventType !== 'discovery-call' || invalidSlot) {
      throw new Error('Unexpected calendar event type.');
    }
    return data;
  }

  async bookDiscoveryCall({ slotId, contact, signal }) {
    const response = await fetch(`${this.baseUrl}/discovery-call/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ slotId, contact, eventType: 'discovery-call' }),
      signal,
    });
    await checkedResponse(response);
    const confirmation = await response.json();
    if (confirmation.eventType !== 'discovery-call') throw new Error('Unexpected booking event type.');
    return confirmation;
  }
}
