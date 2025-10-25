interface ChatterRuntimeConfig {
  bbsProtocol?: string;
  bbsHost?: string;
  bbsPort?: string;
  bbsSshUser?: string;
  bbsHostPlaceholder?: string;
}

declare global {
  interface Window {
    __CHATTER_CONFIG__?: ChatterRuntimeConfig;
  }
}

export {};
