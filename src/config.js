const PRECHAT_MODES = new Set(['optional', 'mandatory']);
const INTEGRATION_MODES = new Set(['mock', 'http']);

function boundedInteger(value, fallback, minimum, maximum, name) {
  const parsed = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

export function normalizeConfig(input = {}) {
  const preChatMode = input.preChatMode ?? 'optional';
  const integrationMode = input.integrationMode ?? 'mock';
  if (!PRECHAT_MODES.has(preChatMode)) {
    throw new Error('preChatMode must be optional or mandatory.');
  }
  if (!INTEGRATION_MODES.has(integrationMode)) {
    throw new Error('integrationMode must be mock or http.');
  }

  const apiBaseUrl = input.apiBaseUrl ?? '';
  if (integrationMode === 'http') {
    if (!apiBaseUrl.startsWith('/') || apiBaseUrl.startsWith('//')) {
      throw new Error('http mode requires a same-origin apiBaseUrl beginning with one slash.');
    }
  }

  const timeZone = input.timeZone || 'America/Chicago';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
  } catch {
    throw new Error(`Unsupported discovery-call time zone: ${timeZone}`);
  }

  return Object.freeze({
    brandName: String(input.brandName || 'Body by Ravi').slice(0, 80),
    preChatMode,
    integrationMode,
    apiBaseUrl: apiBaseUrl.replace(/\/$/, ''),
    timeZone,
    discoveryDurationMinutes: boundedInteger(
      input.discoveryDurationMinutes,
      15,
      5,
      60,
      'discoveryDurationMinutes',
    ),
    mockStreamDelayMs: boundedInteger(
      input.mockStreamDelayMs,
      24,
      0,
      1000,
      'mockStreamDelayMs',
    ),
  });
}

export function configFromEnv(env = {}) {
  return normalizeConfig({
    brandName: env.BBR_CHAT_BRAND_NAME,
    preChatMode: env.BBR_CHAT_PRECHAT_MODE,
    integrationMode: env.BBR_CHAT_INTEGRATION_MODE,
    apiBaseUrl: env.BBR_CHAT_API_BASE_URL,
    timeZone: env.BBR_CHAT_DISCOVERY_TIMEZONE,
    discoveryDurationMinutes: env.BBR_CHAT_DISCOVERY_DURATION_MINUTES,
    mockStreamDelayMs: env.BBR_CHAT_MOCK_STREAM_DELAY_MS,
  });
}
