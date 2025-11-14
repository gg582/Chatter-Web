// src/utils/config.ts

type EnvLookupResult = { value: string | undefined; source: string | undefined };

const readEnvValue = (...keys: string[]): EnvLookupResult => {
  for (const key of keys) {
    const raw = process.env[key];
    if (typeof raw !== 'string') {
      continue;
    }
    const trimmed = raw.trim();
    if (trimmed) {
      return { value: trimmed, source: key };
    }
  }
  return { value: undefined, source: undefined };
};

type BbsProtocol = 'telnet' | 'ssh';

export type ChatterRuntimeConfig = {
  bbsProtocol?: BbsProtocol;
  bbsHost?: string;
  bbsPort?: string;
  bbsSshUser?: string;
  bbsHostDefault?: string;
  bbsPortDefault?: string;
  bbsHostPlaceholder?: string;
  webServiceDomain?: string;
};

export const resolveChatterRuntimeConfig = (): ChatterRuntimeConfig => {
  const config: ChatterRuntimeConfig = {};

  const { value: protocolEnv } = readEnvValue('CHATTER_BBS_PROTOCOL', 'CHATTER_TERMINAL_PROTOCOL');
  const normalisedProtocolValue = (protocolEnv ?? 'telnet').toLowerCase();
  const normalisedProtocol: BbsProtocol = normalisedProtocolValue === 'ssh' ? 'ssh' : 'telnet';
  config.bbsProtocol = normalisedProtocol;

  const { value: host } = readEnvValue('CHATTER_BBS_HOST', 'CHATTER_TERMINAL_HOST');
  if (host) {
    config.bbsHost = host;
  }

  const { value: rawPort } = readEnvValue('CHATTER_BBS_PORT', 'CHATTER_TERMINAL_PORT');
  if (rawPort) {
    config.bbsPort = rawPort;
  } else {
    config.bbsPort = normalisedProtocol === 'ssh' ? '22' : '2323';
  }

  const { value: sshUser } = readEnvValue('CHATTER_BBS_SSH_USER', 'CHATTER_TERMINAL_SSH_USER');
  if (sshUser) {
    config.bbsSshUser = sshUser;
  }

  const { value: hostPlaceholder } = readEnvValue(
    'CHATTER_BBS_HOST_PLACEHOLDER',
    'CHATTER_TERMINAL_HOST_PLACEHOLDER'
  );
  if (hostPlaceholder) {
    config.bbsHostPlaceholder = hostPlaceholder;
  }

  const { value: hostDefault } = readEnvValue(
    'CHATTER_BBS_HOST_DEFAULT',
    'CHATTER_TERMINAL_HOST_DEFAULT'
  );
  if (hostDefault) {
    config.bbsHostDefault = hostDefault;
  }

  const { value: portDefault } = readEnvValue(
    'CHATTER_BBS_PORT_DEFAULT',
    'CHATTER_TERMINAL_PORT_DEFAULT'
  );
  if (portDefault) {
    config.bbsPortDefault = portDefault;
  }

  const { value: serviceDomain } = readEnvValue('CHATTER_WEB_SERVICE_DOMAIN');
  if (serviceDomain) {
    config.webServiceDomain = serviceDomain;
  }

  return config;
};
