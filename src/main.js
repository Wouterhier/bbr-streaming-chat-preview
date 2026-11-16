import { normalizeConfig } from './config.js';
import { ChatWidget } from './chat-widget.js';
import { MockChatIntegration, MockDiscoveryIntegration } from './integrations/mock.js';
import { HttpChatIntegration, HttpDiscoveryIntegration } from './integrations/http.js';

const config = normalizeConfig(window.__BBR_CHAT_CONFIG__ || {});
const chatIntegration = config.integrationMode === 'http'
  ? new HttpChatIntegration(config.apiBaseUrl)
  : new MockChatIntegration({ delayMs: config.mockStreamDelayMs });
const discoveryIntegration = config.integrationMode === 'http'
  ? new HttpDiscoveryIntegration(config.apiBaseUrl)
  : new MockDiscoveryIntegration({
      timeZone: config.timeZone,
      durationMinutes: config.discoveryDurationMinutes,
    });

new ChatWidget(document.querySelector('#bbr-chat-root'), {
  config,
  chatIntegration,
  discoveryIntegration,
});
