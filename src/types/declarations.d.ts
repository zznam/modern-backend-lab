declare module 'autocannon' {
  interface AutocannonOptions {
    url: string;
    connections?: number;
    duration?: number;
    pipelining?: number;
    method?: string;
    body?: any;
    headers?: Record<string, string>;
  }

  interface AutocannonResult {
    url: string;
    connections: number;
    duration: number;
    requests: {
      total: number;
      average: number;
    };
    latency: {
      p50: number;
      p97_5: number;
      p99: number;
    };
    errors: number;
    timeouts: number;
  }

  function autocannon(
    opts: AutocannonOptions,
    cb: (err: any, result: AutocannonResult) => void
  ): any;

  namespace autocannon {
    function track(instance: any, opts?: { renderProgressBar?: boolean }): void;
  }

  export default autocannon;
}
