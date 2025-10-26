interface ChatterRuntimeConfig {
  bbsProtocol?: string;
  bbsHost?: string;
  bbsPort?: string;
  bbsPortDefault?: string;
  bbsSshUser?: string;
  bbsHostPlaceholder?: string;
  bbsHostDefault?: string;
  terminalBridgeMode?: 'local' | 'relaydns';
  terminalSocketUrl?: string;
  terminalRelayDnsPeer?: string;
}

declare global {
  interface Window {
    __CHATTER_CONFIG__?: ChatterRuntimeConfig;
  }
}

export {};
