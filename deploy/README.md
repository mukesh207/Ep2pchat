# Deployment Assets

This folder contains the hosted deployment assets for the backend stack.

Files:
- `docker-compose.production.yml`: production stack for `traefik`, `backend`, `postgres`, and `nats`
- `.env.production.example`: environment template for VPS deployment

Typical flow:
```bash
cp deploy/.env.production.example .env.production
make prod-config
make prod-up
```
