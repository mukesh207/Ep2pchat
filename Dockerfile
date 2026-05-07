# Use official Rust image for building
FROM rust:bookworm as builder

# Install libsodium and other build dependencies
RUN apt-get update && apt-get install -y pkg-config libsodium-dev build-essential

# Create a new empty shell project
WORKDIR /usr/src/trustline

# Copy the workspace manifests and crates
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY apps ./apps
COPY migrations ./migrations

# Build the backend crate for release
# CARGO_BUILD_JOBS=1 limits parallelism to reduce OOM on small EC2 instances (t3.micro)
# RUSTFLAGS=-C link-arg=-fuse-ld=gold uses the gold linker which uses less peak memory than lld
RUN apt-get install -y binutils-gold && \
    CARGO_BUILD_JOBS=1 RUSTFLAGS="-C link-arg=-fuse-ld=gold" cargo build --release -p backend

# ---------------------------------------------------
# Final tiny production image
FROM debian:bookworm-slim

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
ENV PORT=3000

# Run the binary
CMD ["trustline-backend"]
