import { env } from '../config/env.js';

function buildAccessError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function getSmsSimulatorAccessState(config = env) {
  const production = config.NODE_ENV === 'production';
  const enabled = Boolean(config.ENABLE_SMS_SIMULATOR);
  const password = config.SMS_SIMULATOR_DEV_PASSWORD;
  const requiresPassword = production && enabled;

  return {
    enabled,
    production,
    protected: requiresPassword,
    ready: enabled && (!requiresPassword || Boolean(password)),
  };
}

export function assertSmsSimulatorAccess(req, config = env) {
  const state = getSmsSimulatorAccessState(config);

  if (!state.enabled) {
    throw buildAccessError(404, 'SMS simulator is disabled');
  }

  if (state.protected) {
    if (!config.SMS_SIMULATOR_DEV_PASSWORD) {
      throw buildAccessError(403, 'SMS simulator is enabled in production but no dev password is configured');
    }

    const suppliedToken =
      req.get('x-sms-simulator-token') ??
      req.get('x-dev-simulator-token') ??
      req.query.smsSimulatorToken;

    if (suppliedToken !== config.SMS_SIMULATOR_DEV_PASSWORD) {
      throw buildAccessError(403, 'SMS simulator access denied');
    }
  }

  return state;
}
