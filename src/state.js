export const CONTACT_FIELDS = ['firstName', 'lastName', 'email', 'phone'];

export function createChatState() {
  return {
    open: false,
    minimized: false,
    closed: false,
    phase: 'welcome',
    intent: null,
    contact: null,
    preChatSkipped: false,
    preChatError: '',
    messages: [],
    calendar: null,
    streaming: false,
    status: '',
  };
}

export function normalizeContact(fields = {}) {
  return {
    firstName: String(fields.firstName || '').trim(),
    lastName: String(fields.lastName || '').trim(),
    email: String(fields.email || '').trim(),
    phone: String(fields.phone || '').trim(),
  };
}

export function validateContact(fields = {}) {
  const contact = normalizeContact(fields);
  const errors = {};
  if (!contact.firstName) errors.firstName = 'Enter your first name.';
  if (!contact.lastName) errors.lastName = 'Enter your last name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
    errors.email = 'Enter a valid email address.';
  }
  const digits = contact.phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15 || !/^[+()\-\.\s\d]+$/.test(contact.phone)) {
    errors.phone = 'Enter a valid phone number.';
  }
  for (const field of CONTACT_FIELDS) {
    if (contact[field].length > 120) errors[field] = 'This entry is too long.';
  }
  return { contact, errors, valid: Object.keys(errors).length === 0 };
}

export function chooseIntent(state, intent) {
  if (!['book', 'ask'].includes(intent)) throw new Error('Unknown chat intent.');
  return {
    ...state,
    intent,
    phase: 'prechat',
    preChatError: '',
    status: intent === 'book' ? 'Discovery call selected.' : 'Ask a question selected.',
  };
}

export function submitPreChat(state, fields) {
  const result = validateContact(fields);
  if (!result.valid) {
    return { ...state, preChatError: 'Please complete the highlighted fields.' };
  }
  return {
    ...state,
    contact: result.contact,
    preChatSkipped: false,
    preChatError: '',
    phase: 'chat',
    status: 'Details saved for this session.',
  };
}

export function skipPreChat(state) {
  if (state.preChatMode === 'mandatory') {
    return {
      ...state,
      preChatError: 'Please share your details to continue in mandatory mode.',
    };
  }
  return {
    ...state,
    contact: null,
    preChatSkipped: true,
    preChatError: '',
    phase: 'chat',
    status: 'Continuing without sharing contact details.',
  };
}

export function missingBookingDetails(contact) {
  const normalized = normalizeContact(contact || {});
  return CONTACT_FIELDS.filter((field) => !normalized[field]);
}
