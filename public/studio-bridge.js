/* Small integration boundary: successful runs enter the studio; scenarios never auto-run. */
(() => {
  let storage; try { storage = localStorage; } catch { /* Keep learning without storage. */ }
  const store = new StudyStore({ topics: EXPERIMENTS_CONFIG, quizzes: QUEST_QUIZZES, storage });
  const feedback = document.createElement('p'); feedback.id = 'studio-capture-feedback'; feedback.className = 'path-description'; feedback.setAttribute('role','status');
  document.getElementById('controls-container').after(feedback);
  window.addEventListener('backend-lab:success', event => {
    const { topic, params, response } = event.detail;
    try { store.capture(topic, params, response); } catch (error) { feedback.textContent = `Experiment succeeded, but history was not saved: ${error.message}`; return; }
    feedback.textContent = store.storageError || (store.state.settings.capture ? 'Saved to Study studio → Experiment history.' : 'Studio history capture is disabled.');
  });
  const aliases = {
    'cache-stampede': { concurrency: 'param-stampede-concurrency' },
    'consistent-hashing': { keyCount: 'param-hash-keys' },
    'load-stress-benchmark': { totalRequests: 'param-stress-reqs', concurrency: 'param-stress-concurrency' },
  };
  try {
    const raw = storage?.getItem('backend-lab-pending-scenario');
    if (!raw) return;
    storage.removeItem('backend-lab-pending-scenario');
    if (raw.length > 10000) throw new Error('Scenario is too large.');
    const pending = JSON.parse(raw);
    if (!store.known(pending.topic) || !pending.params || typeof pending.params !== 'object' || Array.isArray(pending.params)) throw new Error('Scenario format is invalid.');
    selectExperiment(pending.topic);
    const entries = Object.entries(pending.params);
    const supported = EXPERIMENTS_CONFIG[pending.topic].getParams?.() || {};
    const inputs = entries.map(([key,value]) => {
      const input = document.getElementById(aliases[pending.topic]?.[key] || `param-${key}`);
      if (!Object.hasOwn(supported,key) || !input || !Number.isFinite(value)) throw new Error(`Unsupported parameter: ${key}`);
      return [input,value];
    });
    for (const [input,value] of inputs) input.value = String(value);
    if (pending.topic === 'consensus-quorum') document.getElementById('param-availableNodes').max = Number(document.getElementById('param-clusterSize').value) - 1;
    if (inputs.some(([input]) => !input.validity.valid || input.value === '')) throw new Error('A saved value is outside the current lab limits.');
    if (pending.topic === 'consensus-quorum' && Number(document.getElementById('param-availableNodes').value) >= Number(document.getElementById('param-clusterSize').value)) throw new Error('Available voters must be smaller than the cluster.');
    resetRunDisplay('Saved settings loaded. Review your prediction, then run the experiment.');
    updateScenarioSelection();
    feedback.textContent = 'Studio scenario loaded. Review the parameters and select Run when ready.';
  } catch(error) {
    // Discard the entire invalid preset, including any values applied before validation failed.
    selectExperiment(currentExpKey,false);
    feedback.textContent = `Scenario could not be loaded: ${error.message} Defaults restored.`;
  }
})();
