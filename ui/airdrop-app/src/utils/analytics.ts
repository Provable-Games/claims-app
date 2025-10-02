import { usePostHog } from "posthog-js/react";

export const useAnalytics = () => {
  const posthog = usePostHog();

  const identifyAddress = ({ address }: { address: string }) => {
    posthog.identify(address, {
      wallet: address, // custom property on the person
      login_method: "controller", // optional metadata
    });
  };

  const elegibilityEvent = ({
    elegibleAddress,
    gameAmount,
    gamesBreakdown,
  }: {
    elegibleAddress: string;
    gameAmount: number;
    gamesBreakdown?: Record<string, number>;
  }) => {
    // Flatten the gamesBreakdown object
    const flattenedData: Record<string, any> = {
      elegibleAddress,
      gameAmount,
    };
    
    if (gamesBreakdown) {
      Object.entries(gamesBreakdown).forEach(([collection, games]) => {
        flattenedData[`games_${collection}`] = games;
      });
    }
    
    posthog?.capture("checked_elegibility", flattenedData);
  };

  const claimedGamesClicked = ({
    elegibleAddress,
    gameAmount,
    gamesBreakdown,
  }: {
    elegibleAddress: string;
    gameAmount: number;
    gamesBreakdown?: Record<string, number>;
  }) => {
    // Flatten the gamesBreakdown object
    const flattenedData: Record<string, any> = {
      elegibleAddress,
      gameAmount,
    };
    
    if (gamesBreakdown) {
      Object.entries(gamesBreakdown).forEach(([collection, games]) => {
        flattenedData[`games_${collection}`] = games;
      });
    }
    
    posthog?.capture("claim_clicked", flattenedData);
  };

  const txRevertedEvent = ({ txHash }: { txHash: string }) => {
    posthog?.capture("tx_reverted", {
      txHash,
    });
  };

  return {
    identifyAddress,
    elegibilityEvent,
    claimedGamesClicked,
    txRevertedEvent,
  };
};
