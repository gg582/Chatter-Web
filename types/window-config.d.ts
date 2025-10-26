interface ChatterRuntimeConfig {
  bbsProtocol?: string;
  bbsHost?: string;
  bbsPort?: string;
  bbsPortDefault?: string;
  bbsSshUser?: string;
  bbsHostPlaceholder?: string;
  bbsHostDefault?: string;
  webServiceDomain?: string;
}

declare global {
  interface Window {
    __CHATTER_CONFIG__?: ChatterRuntimeConfig;
  }
}

export {};
