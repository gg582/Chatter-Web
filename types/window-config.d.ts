interface ChatterRuntimeConfig {
  terminalGateway?: string;
  terminalHost?: string;
  terminalPort?: string;
}

declare global {
  interface Window {
    __CHATTER_CONFIG__?: ChatterRuntimeConfig;
  }
}

export {};
