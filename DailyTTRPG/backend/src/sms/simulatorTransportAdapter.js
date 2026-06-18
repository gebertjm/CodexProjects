import { handleSmsInbound } from './smsInboundService.js';
import {
  createSmsSimulatorSession,
  listSmsMessages,
  listSmsSimulatorSessions,
} from './smsMessageStore.js';

export function createSimulatorTransportSession(input = {}) {
  return createSmsSimulatorSession(input);
}

export function listSimulatorTransportSessions() {
  return listSmsSimulatorSessions();
}

export function listSimulatorTransportMessages(sessionId, options = {}) {
  return listSmsMessages(sessionId, options);
}

export function receiveSimulatorInbound(input = {}) {
  return handleSmsInbound({
    ...input,
    transport: 'simulator',
  });
}
