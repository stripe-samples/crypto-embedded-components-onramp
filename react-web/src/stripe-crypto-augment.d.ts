import "@stripe/crypto";

declare module "@stripe/crypto" {
  export interface WalletOwnershipChallenge {
    challengeId: string;
    message: string;
  }

  interface OnrampCoordinator {
    getWalletOwnershipChallenge(params: {
      walletAddress: string;
      network: string;
    }): Promise<WalletOwnershipChallenge>;

    submitWalletOwnershipSignature(params: {
      challengeId: string;
      signature: string;
    }): Promise<void>;
  }
}
