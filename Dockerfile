# Use official Rust image for building
FROM rust:1.80-bullseye as builder

# Install libsodium and other build dependencies
RUN apt-get update && apt-get install -y pkg-config libsodium-dev build-essential

# Create a new empty shell project
WORKDIR /usr/src/trustline

# Copy the workspace manifests and crates
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY migrations ./migrations

# Build the backend crate for release
RUN cargo build --release -p backend

# ---------------------------------------------------
# Final tiny production image
FROM debian:bullseye-slim

# Install runtime dependencies (libsodium, SSL certs)
RUN apt-get update && apt-get install -y libsodium23 ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy the compiled binary from the builder
COPY --from=builder /usr/src/trustline/target/release/backend /usr/local/bin/trustline-backend
# Copy migrations so they can be run on startup
COPY --from=builder /usr/src/trustline/migrations /migrations

# Expose the API/WebSocket port
EXPOSE 3000

# Set environment variables (these should ideally be overridden by docker-compose or Kubernetes)
ENV RUST_LOG=info
ENV DATABASE_URL=postgres://trustline:trustline_dev@postgres:5432/trustline

# Run the binary
CMD ["trustline-backend"]
