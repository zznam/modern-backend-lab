import { boundedInteger, type LabResult } from './lab-result.js';

export function runSloLab(sloBasisPoints = 9990, longErrorBasisPoints = 200, shortErrorBasisPoints = 200) {
  boundedInteger(sloBasisPoints, 'sloBasisPoints', 9000, 9999);
  boundedInteger(longErrorBasisPoints, 'longErrorBasisPoints', 0, 10000);
  boundedInteger(shortErrorBasisPoints, 'shortErrorBasisPoints', 0, 10000);
  const budgetBasisPoints = 10000 - sloBasisPoints;
  const longBurn = longErrorBasisPoints / budgetBasisPoints;
  const shortBurn = shortErrorBasisPoints / budgetBasisPoints;
  const threshold = 14.4;
  const page = longBurn >= threshold && shortBurn >= threshold;
  const monthlyBudgetConsumedPercent = longBurn * (1 / (30 * 24)) * 100;
  const round = (value: number) => Math.round(value * 10000) / 10000;
  return {
    model: 'Request-based 30-day SLO, 1-hour/5-minute fast-burn pair. Inputs are independently supplied window error ratios, not generated telemetry.',
    summary: page ? 'Both windows exceed the fast-burn threshold: page the service owner.' : 'The fast-burn pair does not fire. Other slow-burn alerts may still require action.',
    metrics: [
      { label: '1-hour burn rate', value: `${round(longBurn)}×`, hint: `Error ratio: ${longErrorBasisPoints / 100}%` },
      { label: '5-minute burn rate', value: `${round(shortBurn)}×`, hint: `Error ratio: ${shortErrorBasisPoints / 100}%` },
      { label: 'Fast-burn page', value: page ? 'Firing' : 'Quiet', hint: 'Both windows must reach 14.4×' },
    ],
    steps: [
      { title: 'Define the budget', detail: `${sloBasisPoints / 100}% SLO allows ${budgetBasisPoints / 100}% bad requests.`, state: 'ok' },
      { title: 'Normalize observed errors', detail: `Burn = error ratio / allowed error ratio: long ${round(longBurn)}×, short ${round(shortBurn)}×.`, state: longBurn >= threshold ? 'warning' : 'ok' },
      { title: 'Require both windows', detail: page ? 'Sustained and recent burn both cross 14.4×.' : 'At least one window is below 14.4×; a recovered short window suppresses the fast-burn page.', state: page ? 'blocked' : 'ok' },
      { title: 'Budget impact', detail: `The 1-hour window consumed approximately ${round(monthlyBudgetConsumedPercent)}% of a 30-day budget assuming constant request volume.`, state: 'warning' },
    ], longBurn: round(longBurn), shortBurn: round(shortBurn), page,
    monthlyBudgetConsumedPercent: round(monthlyBudgetConsumedPercent),
  } satisfies LabResult & Record<string, unknown>;
}
