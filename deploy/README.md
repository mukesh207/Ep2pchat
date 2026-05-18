# Trustline Deployment Guide

This guide outlines the process for deploying the Trustline backend stack (Axum, PostgreSQL 16, NATS, Traefik) to a production environment.

## 1. Prerequisites

*   A Linux VPS (Ubuntu 22.04 / Debian 12 recommended)
*   Docker & Docker Compose v2 installed
*   Domain name pointing to the VPS IP (e.g., `api.trustline.in`)
*   Ports `80`, `443`, and `4222` open on the firewall

## 2. Infrastructure Setup

The `deploy` folder contains the Docker Compose configurations.

1.  **Copy the Environment Template:**
    ```bash
    cp deploy/.env.production.example deploy/.env.production
    ```

2.  **Configure Environment Variables:**
    Edit `deploy/.env.production` and set the following critical variables:
    *   `POSTGRES_USER` & `POSTGRES_PASSWORD`
    *   `DATABASE_URL` (Must match the Postgres credentials)
    *   `JWT_SECRET` (Generate a secure random string)
    *   `ADMIN_EMAIL` (For initial bootstrap)
    *   `DOMAIN` (Your API domain for Traefik TLS)

## 3. Deployment Commands

We use a `Makefile` to simplify deployment execution. Run these commands from the root of the repository.

1.  **Validate Configuration:**
    Ensure the compose file parses correctly.
    ```bash
    make prod-config
    ```

2.  **Deploy the Stack:**
    This will pull/build the images and start the services.
    ```bash
    make prod-up
    ```

3.  **Check Logs:**
    ```bash
    make prod-logs
    ```

## 4. Stack Architecture

The production stack utilizes `docker-compose.production.yml`:

*   **Traefik:** Reverse proxy handling incoming HTTPS traffic, terminating TLS via Let's Encrypt, and routing to the backend.
*   **Backend (Axum):** The core Rust API and WebSocket router.
*   **PostgreSQL 16:** Stores users, keys, and encrypted blobs. Protected by a private Docker network.
*   **NATS JetStream:** Handles pub/sub routing between backend instances.

## 5. Post-Deployment Checks

Verify the services are running correctly:

*   **Health Endpoint:** `curl https://<YOUR_DOMAIN>/api/v1/health`
*   **DB Health:** `curl https://<YOUR_DOMAIN>/api/v1/health/db`
*   **NATS Health:** `curl https://<YOUR_DOMAIN>/api/v1/health/nats`

## 6. Backup Strategy

*   **PostgreSQL:** Setup a cron job to run `pg_dump` daily. A script is provided in `scripts/setup_postgres_backup.sh`.
*   **NATS:** Ensure the `/data` volume mounted to NATS is backed up if persistent queues are required long-term.
