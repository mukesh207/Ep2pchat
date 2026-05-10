import { invoke } from "@tauri-apps/api/core";
import { storeOtpkBatch } from "./vault";

type OtpkPrivatePair = {
    key_id: string;
    private_key: number[];
};

export interface ReplenishResult {
    needed:              boolean;
    uploaded:            number;
    server_count_before: number;
    private_pairs:       OtpkPrivatePair[];
}

/**
 * Fire-and-forget OTPK replenishment check.
 *
 * Safe to call anywhere — if the server-side count is above the threshold
 * (default 10) it costs only a single GET and returns immediately.
 *
 * Trigger points:
 *   1. After a successful login (`startSession`)
 *   2. After initiating any outbound X3DH handshake (`sendMessage` first msg)
 *   3. On window focus / app resume (catches multi-device consumption)
 */
export function replenishOtpksInBackground(): void {
    invoke<ReplenishResult>("check_and_replenish_otpks")
        .then((result) => {
            if (result.private_pairs?.length) {
                void storeOtpkBatch(result.private_pairs);
            }
            if (result.needed) {
                console.info(
                    `[otpk] replenished ${result.uploaded} keys ` +
                    `(server had ${result.server_count_before} before upload)`
                );
            }
        })
        .catch((err) => {
            // This is a background maintenance task — never throw.
            // Log and let the next trigger retry.
            console.warn("[otpk] replenishment check failed:", err);
        });
}
