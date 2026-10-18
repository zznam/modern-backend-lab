/**
 * Consumer-Driven Contract Testing (Pact / Schema Verification)
 * Validates that API Provider responses conform to Consumer expectations before deployment.
 */

export interface ContractSpecification {
  consumer: string;
  provider: string;
  endpoint: string;
  method: string;
  expectedResponse: {
    status: number;
    requiredFields: Record<string, 'string' | 'number' | 'boolean' | 'object' | 'array'>;
  };
}

export class ContractVerifier {
  public static verifyContract(
    contract: ContractSpecification,
    actualResponse: { status: number; body: any }
  ): { passed: boolean; mismatches: string[] } {
    const mismatches: string[] = [];

    // 1. Verify Status Code
    if (actualResponse.status !== contract.expectedResponse.status) {
      mismatches.push(`Status mismatch: expected ${contract.expectedResponse.status}, got ${actualResponse.status}`);
    }

    // 2. Verify Schema Fields & Types
    const body = actualResponse.body;
    if (typeof body !== 'object' || body === null) {
      mismatches.push('Response body must be an object');
      return { passed: false, mismatches };
    }

    for (const [field, expectedType] of Object.entries(contract.expectedResponse.requiredFields)) {
      if (!(field in body)) {
        mismatches.push(`Missing required field in response: '${field}'`);
      } else {
        const actualType = Array.isArray(body[field]) ? 'array' : typeof body[field];
        if (actualType !== expectedType) {
          mismatches.push(`Type mismatch on '${field}': expected ${expectedType}, received ${actualType}`);
        }
      }
    }

    return {
      passed: mismatches.length === 0,
      mismatches,
    };
  }
}
