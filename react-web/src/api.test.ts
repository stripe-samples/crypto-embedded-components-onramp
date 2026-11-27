import { decodeSessionToken, OnrampApi } from "./api";

function sessionToken(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.signature`;
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    json: async () => body,
    ok: status >= 200 && status < 300,
    status,
  } as Response;
}

describe("OnrampApi", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it("returns the session token after completing authentication", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { session_token: "session-token" }),
    );
    const api = new OnrampApi(undefined, () => {});

    await expect(
      api.completeAuthIntent("flow-token", "crc_example"),
    ).resolves.toBe("session-token");
  });

  it("uses an existing session token", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: "crc_example" }));
    const api = new OnrampApi("existing-session-token", () => {});

    await api.retrieveCustomer("crc_example");

    expect(fetchMock).toHaveBeenCalledWith(
      "/customers/crc_example",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer existing-session-token",
        }),
      }),
    );
  });

  it("asks the app to reauthorize when Link authorization expires", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, {
        error: {
          code: "link_reauthorization_required",
          message: "Link authorization must be renewed.",
        },
      }),
    );
    const onAuthorizationRequired = jest.fn();
    const api = new OnrampApi("session-token", onAuthorizationRequired);

    await expect(api.retrieveCustomer("crc_example")).rejects.toEqual(
      expect.objectContaining({
        code: "link_reauthorization_required",
      }),
    );

    expect(onAuthorizationRequired).toHaveBeenCalledTimes(1);
  });
});

describe("decodeSessionToken", () => {
  it("decodes the context carried by a session token", () => {
    const token = sessionToken({
      auth_intent_id: "lai_example",
      crypto_customer_id: "crc_example",
      exp: 1_800_000_000,
      mode: "test",
      token_type: "session",
    });

    expect(decodeSessionToken(token)).toEqual({
      authIntentId: "lai_example",
      cryptoCustomerId: "crc_example",
      expiresAt: 1_800_000_000_000,
      mode: "test",
    });
  });

  it("rejects tokens without the expected session claims", () => {
    expect(() => decodeSessionToken("not-a-jwt")).toThrow(
      "Invalid session token.",
    );
  });
});
