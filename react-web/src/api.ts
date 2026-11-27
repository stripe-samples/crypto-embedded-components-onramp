import type { CustomerKycData, OnrampSession, Wallet } from "./types";

const backendUrl = (
  import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3001"
).replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type PublicConfig = {
  link_sso_enabled: boolean;
  livemode: boolean;
  publishable_key: string;
  supported_modes: Array<"test" | "live">;
};

type AuthIntent = {
  auth_intent_id: string;
  flow_token: string;
};

export type AuthSession = {
  authIntentId: string;
  cryptoCustomerId: string;
  expiresAt: number;
  mode: "test" | "live";
};

type ListResponse<T> = {
  data: T[];
  has_more: boolean;
};

type TransactionLimits = {
  object: string;
  crypto_customer_id?: string;
  livemode: boolean;
  limits: {
    "usd.fiat"?: {
      card?: Array<{ limit: number; settlement_speed: string }>;
      us_bank_account?: Array<{ limit: number; settlement_speed: string }>;
    };
  };
};

type RawCustomer = Omit<CustomerKycData, "kyc_level">;

type CreateSessionParams = {
  crypto_customer_id: string;
  payment_token: string;
  source_currency: string;
  destination_currency: string;
  source_amount: string;
  wallet_address: string;
  destination_network: string;
  fee_responsibility?: "merchant";
};

const authorizationErrorCodes = new Set([
  "invalid_session_token",
  "link_authorization_required",
  "link_reauthorization_required",
]);

export function isAuthorizationRequiredError(error: unknown): boolean {
  return (
    error instanceof ApiError && authorizationErrorCodes.has(error.code)
  );
}

export function decodeSessionToken(sessionToken: string): AuthSession {
  try {
    const parts = sessionToken.split(".");
    if (parts.length !== 3) throw new Error();

    const payloadSegment = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(
      atob(
        payloadSegment.padEnd(Math.ceil(payloadSegment.length / 4) * 4, "="),
      ),
    ) as Record<string, unknown>;

    if (
      payload.token_type !== "session" ||
      typeof payload.auth_intent_id !== "string" ||
      typeof payload.crypto_customer_id !== "string" ||
      (payload.mode !== "test" && payload.mode !== "live") ||
      typeof payload.exp !== "number"
    ) {
      throw new Error();
    }

    return {
      authIntentId: payload.auth_intent_id,
      cryptoCustomerId: payload.crypto_customer_id,
      expiresAt: payload.exp * 1000,
      mode: payload.mode,
    };
  } catch {
    throw new Error("Invalid session token.");
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  sessionToken?: string,
): Promise<T> {
  const response = await fetch(`${backendUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
      ...(sessionToken === undefined
        ? {}
        : { Authorization: `Bearer ${sessionToken}` }),
      ...init.headers,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error?.code ?? "request_failed",
      data?.error?.message ?? `Request failed with status ${response.status}.`,
    );
  }
  return data as T;
}

export function getPublicConfig(livemode: boolean): Promise<PublicConfig> {
  return request(`/config?livemode=${livemode}`);
}

export class OnrampApi {
  private notifyingAuthorizationRequired = false;

  constructor(
    private readonly sessionToken: string | undefined,
    private readonly onAuthorizationRequired: () => void,
  ) {}

  async createAuthIntent(
    email: string,
    livemode: boolean,
  ): Promise<AuthIntent> {
    return request("/link/auth_intent", {
      body: JSON.stringify({ email, livemode }),
      method: "POST",
    });
  }

  async completeAuthIntent(
    flowToken: string,
    cryptoCustomerId: string,
  ): Promise<string> {
    const result = await request<{ session_token: string }>(
      "/link/auth_intent/complete",
      {
        body: JSON.stringify({ crypto_customer_id: cryptoCustomerId }),
        headers: { Authorization: `Bearer ${flowToken}` },
        method: "POST",
      },
    );
    return result.session_token;
  }

  retrieveCustomer(customerId: string): Promise<RawCustomer> {
    return this.authenticatedRequest(`/customers/${customerId}`);
  }

  listWallets(
    customerId: string,
    params: { limit?: number; startingAfter?: string } = {},
  ): Promise<ListResponse<Wallet>> {
    const query = new URLSearchParams();
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.startingAfter) query.set("starting_after", params.startingAfter);
    const queryString = query.toString();
    const suffix = queryString ? `?${queryString}` : "";
    return this.authenticatedRequest(
      `/customers/${customerId}/wallets${suffix}`,
    );
  }

  retrieveLimits(params: {
    walletAddress?: string | null;
    destinationNetwork?: string | null;
  }): Promise<TransactionLimits> {
    const query = new URLSearchParams();
    if (params.walletAddress) query.set("wallet_address", params.walletAddress);
    if (params.destinationNetwork) {
      query.set("destination_network", params.destinationNetwork);
    }
    const queryString = query.toString();
    const suffix = queryString ? `?${queryString}` : "";
    return this.authenticatedRequest(`/onramp/limits${suffix}`);
  }

  createSession(params: CreateSessionParams): Promise<OnrampSession> {
    return this.authenticatedRequest("/onramp/sessions", {
      body: JSON.stringify(params),
      method: "POST",
    });
  }

  retrieveSession(sessionId: string): Promise<OnrampSession> {
    return this.authenticatedRequest(`/onramp/sessions/${sessionId}`);
  }

  quoteSession(sessionId: string): Promise<OnrampSession> {
    return this.authenticatedRequest(`/onramp/sessions/${sessionId}/quote`, {
      body: JSON.stringify({}),
      method: "POST",
    });
  }

  checkoutSession(sessionId: string): Promise<OnrampSession> {
    return this.authenticatedRequest(`/onramp/sessions/${sessionId}/checkout`, {
      body: JSON.stringify({}),
      method: "POST",
    });
  }

  private async authenticatedRequest<T>(
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    if (!this.sessionToken) {
      throw new ApiError(
        401,
        "invalid_session_token",
        "Sign in with Link before making this request.",
      );
    }
    try {
      return await request<T>(path, init, this.sessionToken);
    } catch (error) {
      if (isAuthorizationRequiredError(error)) {
        if (!this.notifyingAuthorizationRequired) {
          this.notifyingAuthorizationRequired = true;
          this.onAuthorizationRequired();
        }
      }
      throw error;
    }
  }
}
