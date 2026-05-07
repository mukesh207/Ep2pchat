/**
 * Unified error class for the Trustline Desktop application.
 * Categorizes errors to allow for differentiated UI feedback and logging.
 */
export enum ErrorCategory {
    NETWORK = 'NETWORK',           // API unreachable, DNS issues
    AUTH = 'AUTH',                 // 401 Unauthorized, session expired
    FORBIDDEN = 'FORBIDDEN',       // 403 Forbidden, lack of permissions
    VALIDATION = 'VALIDATION',     // 400 Bad Request, invalid input
    CRYPTO = 'CRYPTO',             // Key derivation or decryption failures
    VAULT = 'VAULT',               // Secure enclave / local storage errors
    SERVER = 'SERVER',             // 500 Internal Server Error
    MAINTENANCE = 'MAINTENANCE',   // Server is in maintenance mode
    UNKNOWN = 'UNKNOWN',
}

export class AppError extends Error {
    public readonly category: ErrorCategory;
    public readonly code?: string;
    public readonly details?: any;
    public readonly timestamp: Date;

    constructor(message: string, category: ErrorCategory = ErrorCategory.UNKNOWN, options?: { code?: string, details?: any }) {
        super(message);
        this.name = 'AppError';
        this.category = category;
        this.code = options?.code;
        this.details = options?.details;
        this.timestamp = new Date();

        // Ensure stack trace is captured correctly in modern JS engines
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, AppError);
        }
    }

    /**
     * Translates the error into a user-friendly message for display.
     */
    public getFriendlyMessage(): string {
        switch (this.category) {
            case ErrorCategory.NETWORK:
                return "Cannot connect to server. Please check your internet connection.";
            case ErrorCategory.AUTH:
                return "Your session has expired. Please log in again.";
            case ErrorCategory.FORBIDDEN:
                return "You don't have permission to perform this action.";
            case ErrorCategory.MAINTENANCE:
                return "The server is currently undergoing maintenance. Please try again later.";
            case ErrorCategory.CRYPTO:
                return "A security error occurred during encryption/decryption.";
            case ErrorCategory.VAULT:
                return "Failed to access local secure storage. Your hardware key might be required.";
            default:
                return this.message || "An unexpected error occurred.";
        }
    }
}

/**
 * Global error handler utility to log errors and prepare them for UI notification.
 */
export function handleError(error: unknown, context?: string): AppError {
    console.error(`[Error Context: ${context || 'Global'}]`, error);

    if (error instanceof AppError) {
        return error;
    }

    if (error instanceof Error) {
        // Map common error strings to categories
        if (error.message.includes('Failed to fetch')) {
            return new AppError(error.message, ErrorCategory.NETWORK);
        }
        if (error.message.includes('MAINTENANCE_MODE')) {
            return new AppError('Server is in maintenance mode', ErrorCategory.MAINTENANCE);
        }
        return new AppError(error.message, ErrorCategory.UNKNOWN, { details: error.stack });
    }

    return new AppError(String(error), ErrorCategory.UNKNOWN);
}
