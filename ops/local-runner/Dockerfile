# Match package-lock.json's Playwright version when updating this image.
FROM mcr.microsoft.com/playwright:v1.64.1-noble@sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea

USER root
WORKDIR /home/pwuser/actions-runner

# Official GitHub Actions runner, native ARM64, verified against release v2.338.2.
RUN curl --fail --location --retry 3 \
      https://github.com/actions/runner/releases/download/v2.338.2/actions-runner-linux-arm64-2.338.2.tar.gz \
      --output /tmp/actions-runner.tar.gz \
    && echo '670adb2f268fe21dcbb58b3db0e0aa9d5b3bddfe2c651481336e561ff86de945  /tmp/actions-runner.tar.gz' | sha256sum --check \
    && tar --extract --gzip --file /tmp/actions-runner.tar.gz \
    && rm /tmp/actions-runner.tar.gz \
    && ./bin/installdependencies.sh \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /home/pwuser/_tool \
    && chown -R pwuser:pwuser /home/pwuser

COPY --chmod=755 entrypoint.sh /usr/local/bin/modern-backend-runner

ENV RUNNER_TOOL_CACHE=/home/pwuser/_tool
USER pwuser
ENTRYPOINT ["/usr/local/bin/modern-backend-runner"]
