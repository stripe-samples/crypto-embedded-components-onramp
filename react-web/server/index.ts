import express from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const STRIPE_API_VERSION = "2025-03-31.preview";

const getLivemode = (req: express.Request): boolean => {
  const value = req.body?.livemode ?? req.query?.livemode;
  if (value === true || value === "true") {
    return true;
  } else {
    return false;
  }
};

const getBasicAuth = (secretKey: string) =>
  `Basic ${Buffer.from(secretKey + ":").toString("base64")}`;

app.use(cors());
app.use(express.json());

const getApiKeys = (
  livemode: boolean,
): { secretKey: string; publishableKey: string } => {
  if (livemode) {
    return {
      secretKey: process.env.STRIPE_SK_LIVE_KEY as string,
      publishableKey: process.env.STRIPE_PK_LIVE_KEY as string,
    };
  }
  return {
    secretKey: process.env.STRIPE_SK_TEST_KEY as string,
    publishableKey: process.env.STRIPE_PK_TEST_KEY as string,
  };
};

app.post("/api/link_auth_intent", async (req, res) => {
  try {
    const { email } = req.body;
    const { secretKey } = getApiKeys(getLivemode(req));

    const httpClient = axios.create({
      baseURL: "https://login.link.com",
    });

    const response = await httpClient.post(
      "/v1/link_auth_intent",
      {
        email,
        oauth_scopes: process.env.OAUTH_SCOPES,
        oauth_client_id: process.env.OAUTH_CLIENT_ID,
      },
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    res.status(200).send({
      id: response.data.id,
    });
  } catch (error: any) {
    console.error("Error creating link auth intent:", JSON.stringify(error));
    res.status(error.status).send({ error: error.message });
  }
});

const getAccessToken = async (linkAuthIntentId: string, secretKey: string) => {
  const response = await axios.post(
    `https://login.link.com/v1/link_auth_intent/${linkAuthIntentId}/tokens`,
    {},
    {
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    },
  );
  if (response.data.expires_in <= 0) {
    const refreshToken = response.data.refresh.refresh_token;
    const refreshTokenResponse = await axios.post(
      `https://login.link.com/auth/token`,
      new URLSearchParams({
        client_id: process.env.LINK_CLIENT_ID!,
        client_secret: process.env.LINK_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: process.env.OAUTH_SCOPES ?? "crypto:ramp,kyc.status:read",
      }),
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );
    return refreshTokenResponse.data.access_token;
  }
  return response.data.access_token;
};

app.post("/api/crypto/onramp_sessions", async (req, res) => {
  try {
    const { secretKey } = getApiKeys(getLivemode(req));
    const accessToken = await getAccessToken(req.body.lai, secretKey);

    if (!accessToken) {
      return res.status(404).json({ error: "Access Token Not Found." });
    }

    const response = await axios.post(
      "https://api.stripe.com/v1/crypto/onramp_sessions",
      new URLSearchParams({
        ui_mode: "headless",
        crypto_customer_id: req.body.crypto_customer_id,
        payment_token: req.body.payment_token,
        source_currency: req.body.source_currency,
        destination_currency: req.body.destination_currency,
        "destination_currencies[]": req.body.destination_currency,
        source_amount: req.body.source_amount,
        wallet_address: req.body.wallet_address,
        destination_network: req.body.destination_network,
        "destination_networks[]": req.body.destination_network,
        customer_ip_address: req.ip || req.socket.remoteAddress || "",
      }),
      {
        headers: {
          Authorization: getBasicAuth(secretKey),
          "Stripe-OAuth-Token": accessToken,
          "Content-Type": "application/x-www-form-urlencoded",
          "Stripe-Version": `${STRIPE_API_VERSION};crypto_onramp_beta=v2`,
        },
      },
    );
    res.json(response.data);
  } catch (error: any) {
    console.error(
      "Error creating onramp session:",
      error?.response?.data || error.message,
    );
    const status = error?.response?.status || 500;
    res.status(status).json({ error: error?.response?.data || error.message });
  }
});

app.post("/api/crypto/onramp_sessions/:sessionId/quote", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { secretKey } = getApiKeys(getLivemode(req));
    const accessToken = await getAccessToken(req.body.lai, secretKey);

    if (!accessToken) {
      return res.status(404).json({ error: "Access Token Not Found." });
    }

    const response = await axios.post(
      `https://api.stripe.com/v1/crypto/onramp_sessions/${sessionId}/quote`,
      {},
      {
        headers: {
          Authorization: getBasicAuth(secretKey),
          "Stripe-OAuth-Token": accessToken,
          "Content-Type": "application/x-www-form-urlencoded",
          "Stripe-Version": `${STRIPE_API_VERSION};crypto_onramp_beta=v2`,
        },
      },
    );
    res.json(response.data);
  } catch (error: any) {
    console.error(
      "Error refreshing onramp session quote:",
      error?.response?.data || error.message,
    );
    const status = error?.response?.status || 500;
    res.status(status).json({ error: error?.response?.data || error.message });
  }
});

app.get("/api/crypto/onramp_sessions/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { secretKey } = getApiKeys(getLivemode(req));
    const response = await axios.get(
      `https://api.stripe.com/v1/crypto/onramp_sessions/${sessionId}`,
      {
        headers: {
          Authorization: getBasicAuth(secretKey),
          "Content-Type": "application/x-www-form-urlencoded",
          "Stripe-Version": `${STRIPE_API_VERSION};crypto_onramp_beta=v2`,
        },
      },
    );
    const data = response.data;
    res.json({
      status: data.status,
      transaction_id: data.transaction_details?.transaction_id ?? null,
    });
  } catch (error: any) {
    console.error(
      "Error fetching onramp session:",
      error?.response?.data || error.message,
    );
    const status = error?.response?.status || 500;
    res.status(status).json({ error: error?.response?.data || error.message });
  }
});

app.post(
  "/api/crypto/onramp_sessions/:sessionId/checkout",
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { secretKey } = getApiKeys(getLivemode(req));
      const accessToken = await getAccessToken(req.body.lai, secretKey);

      if (!accessToken) {
        return res.status(404).json({ error: "Access Token Not Found." });
      }

      const response = await axios.post(
        `https://api.stripe.com/v1/crypto/onramp_sessions/${sessionId}/checkout`,
        {
          mandate_data: {
            customer_acceptance: {
              type: "online",
              accepted_at: Math.floor(Date.now() / 1000),
              online: {
                ip_address: req.ip || req.socket.remoteAddress || "",
                user_agent: req.headers["user-agent"] || "",
              },
            },
          },
        },
        {
          headers: {
            Authorization: getBasicAuth(secretKey),
            "Stripe-OAuth-Token": accessToken,
            "Content-Type": "application/x-www-form-urlencoded",
            "Stripe-Version": `${STRIPE_API_VERSION};crypto_onramp_beta=v2`,
          },
        },
      );
      res.json(response.data);
    } catch (error: any) {
      console.error(
        "Error checking out onramp session:",
        error?.response?.data || error.message,
      );
      const status = error?.response?.status || 500;
      res
        .status(status)
        .json({ error: error?.response?.data || error.message });
    }
  },
);

app.get("/api/crypto/customers/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;
    const { secretKey } = getApiKeys(getLivemode(req));
    const accessToken = await getAccessToken(
      req.query.lai as string,
      secretKey,
    );

    if (!accessToken) {
      return res.status(404).json({ error: "Access Token Not Found." });
    }

    const response = await axios.get(
      `https://api.stripe.com/v1/crypto/customers/${customerId}`,
      {
        headers: {
          Authorization: getBasicAuth(secretKey),
          "Stripe-OAuth-Token": accessToken,
          "Stripe-Feature": "identifier_type_lifecycle=v1",
          "Stripe-Version": "2025-05-28.preview;crypto_onramp_beta=v2",
        },
      },
    );
    const data = response.data;
    const verifications: Array<{ name: string; status: string }> =
      data.verifications || [];
    const providedFields = data.provided_fields || [];
    const kycRegion = data.kyc_region ?? null;
    const kycTiers = data.kyc_tiers ?? [];


    // Derive kyc_level from kyc_tiers (canonical source) with verifications as fallback
    let kyc_level: string;
    const getTierStatus = (tier: string) =>
      kycTiers.find((t: any) => t.tier === tier)?.verification_status;

    if (getTierStatus("l2") === "verified") {
      kyc_level = "L2";
    } else if (getTierStatus("l1") === "verified") {
      kyc_level = "L1";
    } else if (getTierStatus("l0") === "verified") {
      kyc_level = "L0";
    } else if (kycTiers.some((t: any) => t.verification_status === "pending")) {
      kyc_level = "PENDING";
    } else if (
      kycTiers.length === 0 ||
      kycTiers.every((t: any) => t.verification_status === "not_started" || t.verification_status === "not_available")
    ) {
      kyc_level = "REQUIRES_KYC";
    } else {
      kyc_level = "REJECTED";
    }

    return res.json({
      kyc_level,
      kyc_region: kycRegion,
      kyc_tiers: kycTiers,
      verifications,
      provided_fields: providedFields,
    });
  } catch (error: any) {
    console.error(
      "Error fetching crypto customer:",
      error?.response?.data || error.message,
    );
    const status = error?.response?.status || 500;
    res.status(status).json({ error: error?.response?.data || error.message });
  }
});

app.get("/api/crypto/customers/:customerId/wallets", async (req, res) => {
  try {
    const { customerId } = req.params;
    const linkAuthIntentId = req.query.lai as string;
    const { secretKey } = getApiKeys(getLivemode(req));
    const accessToken = await getAccessToken(linkAuthIntentId, secretKey);

    if (!accessToken) {
      return res.status(404).json({ error: "Access Token Not Found." });
    }

    const response = await axios.get(
      `https://api.stripe.com/v1/crypto/customers/${customerId}/crypto_consumer_wallets`,
      {
        headers: {
          Authorization: getBasicAuth(secretKey),
          "Stripe-OAuth-Token": accessToken,
        },
      },
    );
    res.json(response.data);
  } catch (error: any) {
    console.error(
      "Error fetching wallets:",
      error?.response?.data || error.message,
    );
    const status = error?.response?.status || 500;
    res.status(status).json({ error: error?.response?.data || error.message });
  }
});

app.get(
  "/api/crypto/customers/:customerId/payment_tokens",
  async (req, res) => {
    try {
      const { customerId } = req.params;
      const linkAuthIntentId = req.query.lai as string;
      const { secretKey } = getApiKeys(getLivemode(req));
      const accessToken = await getAccessToken(linkAuthIntentId, secretKey);

      if (!accessToken) {
        return res.status(404).json({ error: "Access Token Not Found." });
      }

      const response = await axios.get(
        `https://api.stripe.com/v1/crypto/customers/${customerId}/payment_tokens`,
        {
          headers: {
            Authorization: getBasicAuth(secretKey),
            "Stripe-OAuth-Token": accessToken,
          },
        },
      );
      res.json(response.data);
    } catch (error: any) {
      console.error(
        "Error fetching payment tokens:",
        error?.response?.data || error.message,
      );
      const status = error?.response?.status || 500;
      res
        .status(status)
        .json({ error: error?.response?.data || error.message });
    }
  },
);

app.get("/api/config", (req, res) => {
  const { publishableKey } = getApiKeys(getLivemode(req));
  res.json({ publishableKey });
});

// In production, serve the React build
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "..", "build")));

  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(__dirname, "..", "build", "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
