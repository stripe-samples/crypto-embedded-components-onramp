import { customerKycData } from "./customer";

const customer = {
  kyc_region: "us" as const,
  kyc_tiers: [],
  provided_fields: [],
  verifications: [],
};

describe("customerKycData", () => {
  it("requires KYC when no tier has been attempted", () => {
    expect(customerKycData(customer).kyc_level).toBe("REQUIRES_KYC");
  });

  it("uses the highest attempted verified tier", () => {
    expect(
      customerKycData({
        ...customer,
        kyc_tiers: [
          { tier: "l0", verification_status: "verified" },
          { tier: "l1", verification_status: "verified" },
          { tier: "l2", verification_status: "not_started" },
        ],
      }).kyc_level,
    ).toBe("L1");
  });

  it("reports pending before a lower verified tier", () => {
    expect(
      customerKycData({
        ...customer,
        kyc_tiers: [
          { tier: "l0", verification_status: "verified" },
          { tier: "l1", verification_status: "pending" },
        ],
      }).kyc_level,
    ).toBe("PENDING");
  });

  it("reports rejection at the highest attempted tier", () => {
    expect(
      customerKycData({
        ...customer,
        kyc_tiers: [
          { tier: "l0", verification_status: "verified" },
          { tier: "l1", verification_status: "rejected" },
        ],
      }).kyc_level,
    ).toBe("REJECTED");
  });
});
