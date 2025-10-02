import { useState, useEffect } from "react";
import { EligibilityResponse, ApiError } from "../types";
import { useAccount, useConnect } from "@starknet-react/core";
import Confetti from "react-confetti";
import { getCollectionReward } from "../utils/rewardsMapping";
import { useAnalytics } from "../utils/analytics";
import "./EligibilityChecker.css";

// Utility function to display truncated addresses
export function displayAddress(address: string | undefined): string {
  if (!address) return "unknown";
  return (
    address.substring(0, 6) + "..." + address.substring(address.length - 4)
  );
}

interface EligibilityCheckerProps {
  controllerConnector: any;
  onResultChange?: (hasResult: boolean) => void;
}

const EligibilityChecker = ({
  controllerConnector,
  onResultChange,
}: EligibilityCheckerProps): JSX.Element => {
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<EligibilityResponse | null>(null);
  const [error, setError] = useState<string>("");
  const [showConfetti, setShowConfetti] = useState<boolean>(false);
  const [isValidAddress, setIsValidAddress] = useState<boolean>(false);
  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const [isExpired, setIsExpired] = useState<boolean>(false);
  const [isNotStarted, setIsNotStarted] = useState<boolean>(false);
  const [timeUntilStart, setTimeUntilStart] = useState<string>("");
  const [windowDimensions, setWindowDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  // Starknet wallet hooks
  const { account } = useAccount();
  const { connect, connectors } = useConnect();

  const { identifyAddress, elegibilityEvent, claimedGamesClicked } =
    useAnalytics();

  useEffect(() => {
    if (account) {
      identifyAddress({ address: account.address });
    }
  }, [account]);

  // Check if we're in local development mode
  const isLocalDev = import.meta.env.VITE_DEV_MODE === "true";

  // Handle window resize for confetti
  useEffect(() => {
    const handleResize = () => {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Notify parent component when result changes
  useEffect(() => {
    if (onResultChange) {
      onResultChange(result !== null);
    }
  }, [result, onResultChange]);

  // Get claim start and expiration from env variables (Unix timestamp in seconds)
  // Default to Jan 1, 2025 - Jan 31, 2025 if not set
  const CLAIM_START_TIMESTAMP = import.meta.env.VITE_CLAIM_START_TIMESTAMP
    ? parseInt(import.meta.env.VITE_CLAIM_START_TIMESTAMP) * 1000 // Convert to milliseconds
    : new Date("2025-01-01T00:00:00Z").getTime();

  const CLAIM_EXPIRY_TIMESTAMP = import.meta.env.VITE_CLAIM_EXPIRY_TIMESTAMP
    ? parseInt(import.meta.env.VITE_CLAIM_EXPIRY_TIMESTAMP) * 1000 // Convert to milliseconds
    : new Date("2025-01-31T23:59:59Z").getTime();

  const CLAIM_START_DATE = new Date(CLAIM_START_TIMESTAMP);
  const CLAIM_EXPIRY_DATE = new Date(CLAIM_EXPIRY_TIMESTAMP);

  // Countdown timer effect
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date().getTime();
      const startTime = CLAIM_START_DATE.getTime();
      const expiryTime = CLAIM_EXPIRY_DATE.getTime();

      // Check if claims haven't started yet
      if (now < startTime) {
        const distanceToStart = startTime - now;
        const days = Math.floor(distanceToStart / (1000 * 60 * 60 * 24));
        const hours = Math.floor(
          (distanceToStart % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
        );
        const minutes = Math.floor(
          (distanceToStart % (1000 * 60 * 60)) / (1000 * 60)
        );
        const seconds = Math.floor((distanceToStart % (1000 * 60)) / 1000);

        setTimeUntilStart(`${days}d ${hours}h ${minutes}m ${seconds}s`);
        setIsNotStarted(true);
        setIsExpired(false);
        return;
      }

      // Check if claims have expired
      const distanceToExpiry = expiryTime - now;
      if (distanceToExpiry < 0) {
        setTimeRemaining("Expired");
        setIsExpired(true);
        setIsNotStarted(false);
        return;
      }

      // Claims are active - show time remaining
      const days = Math.floor(distanceToExpiry / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (distanceToExpiry % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      );
      const minutes = Math.floor(
        (distanceToExpiry % (1000 * 60 * 60)) / (1000 * 60)
      );
      const seconds = Math.floor((distanceToExpiry % (1000 * 60)) / 1000);

      setTimeRemaining(`${days}d ${hours}h ${minutes}m ${seconds}s`);
      setIsExpired(false);
      setIsNotStarted(false);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, []);

  const checkEligibility = async (): Promise<void> => {
    if (!walletAddress.trim()) {
      setError("Please enter a wallet address");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    // Local development mode: special addresses for testing
    if (isLocalDev) {
      setTimeout(() => {
        // Special address to test not eligible
        if (
          walletAddress.toLowerCase() === "0xnoteligible" ||
          walletAddress.toLowerCase() === "0x0"
        ) {
          setResult({
            eligible: false,
            message:
              "This wallet doesn't hold any eligible NFTs from our supported collections. But your adventure awaits!",
            walletAddress: walletAddress,
          } as EligibilityResponse);
          setLoading(false);
          return;
        }

        // Default: return 50 free games
        const eligibilityResult = {
          eligible: true,
          walletAddress: walletAddress,
          allocation: 50,
          claimed: false,
          airdropName: "Development Test",
          reasons: [
            {
              collection: "Test Collection",
              network: "Testnet",
              tokenCount: 1,
            },
          ],
        };
        setResult(eligibilityResult);
        setShowConfetti(true);
        // Stop confetti after 5 seconds
        setTimeout(() => setShowConfetti(false), 5000);
        setLoading(false);
      }, 500); // Simulate network delay
      return;
    }

    try {
      // Use relative URL for production
      const apiUrl = `/api/eligibility/${walletAddress}`;
      console.log("Fetching from:", apiUrl);
      const response = await fetch(apiUrl);
      const data: EligibilityResponse | ApiError = await response.json();

      if (response.ok) {
        const eligibilityData = data as EligibilityResponse;
        setResult(eligibilityData);

        // Track eligibility check event
        const hasOGRole = eligibilityData.reasons?.some(
          (reason) => reason.collection.toLowerCase() === "og"
        );
        const adjustedAllocation = hasOGRole
          ? Math.min(50, (eligibilityData.allocation || 0) + 8)
          : eligibilityData.allocation;

        // Calculate games breakdown by collection
        const gamesBreakdown: Record<string, number> = {};
        if (eligibilityData.eligible && eligibilityData.reasons) {
          eligibilityData.reasons.forEach((reason) => {
            const gamesPerToken = getCollectionReward(reason.collection);
            const totalGamesFromCollection = reason.tokenCount * gamesPerToken;
            gamesBreakdown[reason.collection] = totalGamesFromCollection;
          });
        }

        elegibilityEvent({
          elegibleAddress: walletAddress,
          gameAmount: eligibilityData.eligible ? adjustedAllocation! : 0,
          gamesBreakdown,
        });

        if (eligibilityData.eligible) {
          setShowConfetti(true);
          // Stop confetti after 5 seconds
          setTimeout(() => setShowConfetti(false), 5000);
        }
      } else {
        setError((data as ApiError).error || "Failed to check eligibility");
      }
    } catch (err) {
      setError(
        "Failed to connect to server. Make sure the backend is running."
      );
    } finally {
      setLoading(false);
    }
  };

  const connectController = async (): Promise<void> => {
    console.log("Attempting to connect controller...");
    setLoading(true);
    setError("");

    const controller = connectors.find((c) => c.id === "controller");
    console.log("Found controller connector:", controller);

    if (controller) {
      try {
        console.log("Connecting with controller...");
        connect({ connector: controller });
        setLoading(false);
      } catch (err) {
        console.error("Connection error:", err);
        setError("Failed to connect wallet");
        setLoading(false);
      }
    } else {
      console.error("Controller connector not found");
      setError("Controller connector not found");
      setLoading(false);
    }
  };

  const claimGames = async (): Promise<void> => {
    if (!account) {
      console.error("No account connected");
      setError("Please connect your controller first");
      return;
    }

    setLoading(true);
    setError("");

    try {
      console.log("Opening starter pack...");
      // Use the controller connector passed as prop
      if (controllerConnector && controllerConnector.controller) {
        // Track claim clicked event
        if (result && result.eligible) {
          const hasOGRole = result.reasons?.some(
            (reason) => reason.collection.toLowerCase() === "og"
          );
          const adjustedAllocation = hasOGRole
            ? Math.min(50, (result.allocation || 0) + 8)
            : result.allocation;

          // Calculate games breakdown by collection
          const gamesBreakdown: Record<string, number> = {};
          if (result.reasons) {
            result.reasons.forEach((reason) => {
              const gamesPerToken = getCollectionReward(reason.collection);
              const totalGamesFromCollection =
                reason.tokenCount * gamesPerToken;
              gamesBreakdown[reason.collection] = totalGamesFromCollection;
            });
          }

          claimedGamesClicked({
            elegibleAddress: result.walletAddress ?? "0x0",
            gameAmount: adjustedAllocation ?? 0,
            gamesBreakdown,
          });
        }

        await controllerConnector.controller.openStarterPack(
          "ls2-starterpack-mainnet"
        );

        // Don't mark as claimed - let the starter pack UI handle the flow
        setLoading(false);
      } else {
        throw new Error("Controller instance not found");
      }
    } catch (err) {
      console.error("Failed to open starter pack:", err);
      setError("Failed to open starter pack");
      setLoading(false);
    }
  };

  const openProfile = async () => {
    await controllerConnector.controller.openProfile();
  };

  const validateAddress = (address: string): boolean => {
    const addressRegex = /^0x[a-fA-F0-9]{1,64}$/;
    return addressRegex.test(address.trim());
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const value = e.target.value;
    setWalletAddress(value);
    setIsValidAddress(validateAddress(value));

    // Clear error when user starts typing
    if (error && value !== "") {
      setError("");
    }
  };

  const checkAnother = (): void => {
    setWalletAddress("");
    setResult(null);
    setError("");
    setShowConfetti(false);
    setIsValidAddress(false);
  };

  return (
    <>
      {showConfetti && (
        <Confetti
          width={windowDimensions.width}
          height={windowDimensions.height}
          recycle={false}
          numberOfPieces={200}
          gravity={0.3}
          colors={["#FFE97F", "#FFD700", "#FFA500", "#FF8C00", "#1aff5c"]}
          style={{ position: "fixed", top: 0, left: 0, zIndex: 1000 }}
        />
      )}
      <div className="eligibility-checker">
        {!isExpired && !isNotStarted && !result && (
          <div className="countdown-timer">
            <div className="countdown-label">Claim ends in:</div>
            <div className="countdown-display">{timeRemaining}</div>
          </div>
        )}

        {isExpired && (
          <div className="expired-container">
            <h2>⏰ Claim Period Has Ended</h2>
            <p>The free games claim period has expired.</p>
            <p>But don't worry, you can still play!</p>
            <a
              href="https://lootsurvivor.io"
              target="_blank"
              rel="noopener noreferrer"
              className="play-anyway-button"
            >
              Play Here
            </a>
          </div>
        )}

        {isNotStarted && (
          <div className="not-started-container">
            <h2>🚀 Coming Soon</h2>
            {/* <p>Free games claim will open in:</p>
            <div className="countdown-timer coming-soon">
              <div className="countdown-display">{timeUntilStart}</div>
            </div> */}
            <div className="checker-description">
              <div className="metrics-cards">
                <div className="metric-card">
                  <div className="metric-icon">👥</div>
                  <div className="metric-value">87K+</div>
                  <div className="metric-label">Eligible Accounts</div>
                </div>
                <div className="metric-card multi-chain-card">
                  <div className="metric-icon">🌐</div>
                  <div className="metric-value metric-value-text">
                    MULTI CHAIN
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-icon">🎮</div>
                  <div className="metric-value">588K+</div>
                  <div className="metric-label">Dungeon Keys</div>
                </div>
              </div>
              <div className="survivor-token-info">
                <p className="token-description">
                  🎮 Free games unlock Beast Mode dungeon, which has locked
                  tokens requiring levels to unlock
                </p>
              </div>
            </div>
            <p className="coming-soon-note">
              Check back soon to claim your free games!
            </p>
          </div>
        )}

        {!result && !isExpired && !isNotStarted && (
          <div className="input-section">
            <div className="checker-description">
              <div className="metrics-cards">
                <div className="metric-card">
                  <div className="metric-icon">👥</div>
                  <div className="metric-value">87K+</div>
                  <div className="metric-label">Qualifying Addresses</div>
                </div>
                <div className="metric-card multi-chain-card">
                  <div className="metric-icon">🌐</div>
                  <div className="metric-value metric-value-text">
                    MULTI CHAIN
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-icon">🎮</div>
                  <div className="metric-value">588K+</div>
                  <div className="metric-label">Free Dungeon Keys</div>
                </div>
              </div>
              <div className="survivor-token-info">
                <p className="token-highlight">
                  Be the first to explore and raid the dungeons of Loot Survivor
                  - a thrilling, verifiably random, fully onchain RPG Dungeon
                  Crawler.
                </p>
              </div>
            </div>
            <input
              type="text"
              placeholder={
                isLocalDev
                  ? "Dev mode: Use 0x0 or 0xnoteligible to test not eligible"
                  : "Enter wallet address"
              }
              value={walletAddress}
              onChange={handleInputChange}
              className="wallet-input"
            />
            <div className="buttons-row">
              <button
                onClick={checkEligibility}
                disabled={loading || !isValidAddress}
                className="check-btn"
              >
                {loading ? "Checking..." : "Check Eligibility"}
              </button>

              <span className="or-divider">OR</span>

              {!account ? (
                <button
                  onClick={connectController}
                  disabled={loading}
                  className="connect-check-btn"
                >
                  {loading ? (
                    "Connecting..."
                  ) : (
                    <>
                      <svg
                        className="button-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M11.2727 5H12.7273V6.45455H11.2727V5Z"
                          fill="currentColor"
                        />
                        <path
                          d="M11.2727 7.90909V6.45455H6.90909V7.90909H5.45455V9.36364H4V16.6364H5.45455V18.0909H8.36364V16.6364H15.6364V18.0909H18.5455V16.6364H20V9.36364H18.5455V7.90909H17.0909V6.45455H12.7273V7.90909H17.0909V9.36364H18.5455V16.6364H15.6364V15.1818H8.36364V16.6364H5.45455V9.36364H6.90909V7.90909H11.2727Z"
                          fill="currentColor"
                        />
                        <path
                          d="M8.36364 10.8182V12.2727H15.6364V10.8182H8.36364Z"
                          fill="currentColor"
                        />
                      </svg>
                      Connect
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (account.address) {
                      setWalletAddress(account.address);
                      setIsValidAddress(true);
                      // Automatically check eligibility
                      setTimeout(() => {
                        const checkBtn = document.querySelector(
                          ".check-btn"
                        ) as HTMLButtonElement;
                        if (checkBtn) checkBtn.click();
                      }, 100);
                    }
                  }}
                  className="use-controller-btn"
                >
                  <svg
                    className="button-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M11.2727 5H12.7273V6.45455H11.2727V5Z"
                      fill="currentColor"
                    />
                    <path
                      d="M11.2727 7.90909V6.45455H6.90909V7.90909H5.45455V9.36364H4V16.6364H5.45455V18.0909H8.36364V16.6364H15.6364V18.0909H18.5455V16.6364H20V9.36364H18.5455V7.90909H17.0909V6.45455H12.7273V7.90909H17.0909V9.36364H18.5455V16.6364H15.6364V15.1818H8.36364V16.6364H5.45455V9.36364H6.90909V7.90909H11.2727Z"
                      fill="currentColor"
                    />
                    <path
                      d="M8.36364 10.8182V12.2727H15.6364V10.8182H8.36364Z"
                      fill="currentColor"
                    />
                  </svg>
                  Use Wallet
                </button>
              )}
            </div>
          </div>
        )}

        {error && !result && !isExpired && (
          <div className="error-message">{error}</div>
        )}

        {result && !isExpired && (
          <div className="result-section">
            {result.eligible ? (
              <div className="eligible-result">
                <h3>🎉 You're Eligible!</h3>
                <div className="wallet-display">
                  {displayAddress(result.walletAddress)}
                </div>
                <div className="allocation-display">
                  <span className="allocation-number">
                    {(() => {
                      // Check if user has OG role and bump allocation by 8, capped at 50
                      const hasOGRole = result.reasons?.some(
                        (reason) => reason.collection.toLowerCase() === "og"
                      );
                      const adjustedAllocation = hasOGRole
                        ? Math.min(50, (result.allocation || 0) + 8)
                        : result.allocation;
                      return adjustedAllocation;
                    })()}
                  </span>
                  <span className="allocation-text">Free Games</span>
                </div>

                {result.reasons && result.reasons.length > 0 && (
                  <div className="eligibility-reasons">
                    <h4>Eligible because you hold:</h4>
                    <ul>
                      {result.reasons.map((reason, index) => {
                        const gamesPerToken = getCollectionReward(
                          reason.collection
                        );
                        const totalGamesFromCollection =
                          reason.tokenCount * gamesPerToken;

                        if (reason.collection.toLowerCase() === "og") {
                          return (
                            <li key={index}>
                              OG role holder on Discord (
                              {totalGamesFromCollection} game
                              {totalGamesFromCollection > 1 ? "s" : ""})
                            </li>
                          );
                        }

                        return (
                          <li key={index}>
                            {reason.tokenCount} {reason.collection} NFT
                            {reason.tokenCount > 1 ? "s" : ""} on{" "}
                            {reason.network} ({totalGamesFromCollection} game
                            {totalGamesFromCollection > 1 ? "s" : ""})
                          </li>
                        );
                      })}
                    </ul>
                    {(() => {
                      const hasOGRole = result.reasons?.some(
                        (reason) => reason.collection.toLowerCase() === "og"
                      );
                      const adjustedAllocation = hasOGRole
                        ? Math.min(50, (result.allocation || 0) + 8)
                        : result.allocation;
                      return adjustedAllocation === 50 ? (
                        <p className="max-allocation-note">
                          Max 50 games per wallet
                        </p>
                      ) : null;
                    })()}
                  </div>
                )}

                {result.claimed ? (
                  <div className="claimed-status">
                    <p>✅ Already Claimed</p>
                    <p>
                      <strong>Claimed At:</strong>{" "}
                      {result.claimedAt
                        ? new Date(result.claimedAt).toLocaleDateString()
                        : "Unknown"}
                    </p>
                    <a
                      href="https://lootsurvivor.io"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="play-anyway-button"
                    >
                      Play Here
                    </a>
                  </div>
                ) : (
                  <>
                    {!account ? (
                      <button
                        onClick={connectController}
                        disabled={loading}
                        className="claim-btn"
                      >
                        {loading ? "Connecting..." : "Connect to claim"}
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={claimGames}
                          disabled={loading}
                          className="claim-btn"
                        >
                          {loading ? "Claiming..." : "Claim Games"}
                        </button>
                        <button onClick={openProfile} className="see-games-btn">
                          See Games
                        </button>
                      </>
                    )}
                    <p className="after-claim-text">
                      After claiming, dive into the adventure!
                    </p>
                    <a
                      href="https://lootsurvivor.io"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="play-anyway-button"
                    >
                      Play Here
                    </a>
                  </>
                )}
              </div>
            ) : (
              <div className="ineligible-result">
                <h3>🎮 Not Eligible for Free Games</h3>
                <p className="ineligible-message">{result.message}</p>
                <p className="docs-link-container">
                  Check out the{" "}
                  <a
                    href="https://docs.provable.games/lootsurvivor/token/eligible-collections"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="docs-link"
                  >
                    eligible collections
                  </a>{" "}
                  to see which NFTs qualify for free games.
                </p>
                <div className="play-anyway-section">
                  <p className="play-anyway-title">
                    Don't worry, you can still play!
                  </p>
                  <p className="play-anyway-desc">
                    Start your adventure and enter the Dungeon!
                  </p>
                  <a
                    href="https://lootsurvivor.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="play-anyway-button"
                  >
                    Play Here
                  </a>
                  <p className="follow-us-text">
                    Follow us for more exciting updates!
                  </p>
                  <a
                    href="https://x.com/LootSurvivor"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="twitter-link"
                  >
                    @LootSurvivor
                  </a>
                </div>
              </div>
            )}
            <button onClick={checkAnother} className="check-another-btn">
              Check Another Address
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default EligibilityChecker;
