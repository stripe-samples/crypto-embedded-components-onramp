import { OnrampApi } from "./api";

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

  it("keeps the session token in memory and sends it as a bearer token", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, { session_token: "session-token" }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { data: [], has_more: false }));
    const api = new OnrampApi(() => {});

    await api.completeAuthIntent("flow-token", "crc_example");
    await api.listWallets("crc_example");

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/customers/crc_example/wallets",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer session-token",
        }),
      }),
    );
  });

  it("asks the app to reauthorize when Link authorization expires", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, { session_token: "session-token" }),
      )
      .mockResolvedValueOnce(
        jsonResponse(401, {
          error: {
            code: "link_reauthorization_required",
            message: "Link authorization must be renewed.",
          },
        }),
      );
    const onAuthorizationRequired = jest.fn();
    const api = new OnrampApi(onAuthorizationRequired);

    await api.completeAuthIntent("flow-token", "crc_example");
    await expect(api.retrieveCustomer("crc_example")).rejects.toEqual(
      expect.objectContaining({
        code: "link_reauthorization_required",
      }),
    );

    expect(onAuthorizationRequired).toHaveBeenCalledTimes(1);
  });
});
