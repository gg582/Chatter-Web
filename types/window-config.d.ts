interface ChatterRuntimeConfig {
  bbsProtocol?: string;
  bbsHost?: string;
  bbsPort?: string;
  bbsPortDefault?: string;
  bbsSshUser?: string;
  bbsHostPlaceholder?: string;
  bbsHostDefault?: string;
  webServiceUrl?: string;
  webServiceDomain?: string;
  webServiceProtocol?: string;
  webServicePort?: string;
  webServicePath?: string;
}

declare global {
  interface Window {
    __CHATTER_CONFIG__?: ChatterRuntimeConfig;
  }
}

export {};
