interface ChatterRuntimeConfig {
  bbsProtocol?: string;
  bbsHost?: string;
  bbsPort?: string;
  bbsSshUser?: string;
}

declare global {
  interface Window {
    __CHATTER_CONFIG__?: ChatterRuntimeConfig;
  }
}

export {};
