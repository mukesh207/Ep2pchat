#[cfg(test)]
mod tests {
    use axum::{
        body::Body,
        http::{Request, StatusCode},
        Router,
    };
    use tower::ServiceExt;
    use uuid::Uuid;
    use jsonwebtoken::{encode, EncodingKey, Header};
    use crate::auth::Claims;
    use crate::{admin, AppState};
    use sqlx::postgres::PgPoolOptions;
    use std::sync::Arc;
    use crate::ws::WsState;

    // Helper to create a test JWT
    fn create_test_token(user_id: Uuid, org_id: Uuid, is_admin: bool) -> String {
        let jwt_secret = "super_secret_fallback_key_for_dev";
        let expiration = chrono::Utc::now()
            .checked_add_signed(chrono::Duration::hours(1))
            .expect("valid timestamp")
            .timestamp() as usize;

        let claims = Claims {
            sub: user_id,
            org_id,
            is_admin,
            exp: expiration,
        };

        encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(jwt_secret.as_bytes()),
        ).unwrap()
    }

    /// Create a mock AppState for tests that don't exercise NATS.
    /// Falls back to a lazy PG connection and an ephemeral NATS client
    /// so the struct compiles, but tests should not rely on live services.
    async fn mock_app_state() -> AppState {
        let nats_client = async_nats::connect("nats://localhost:4222")
            .await
            .expect("NATS must be running for tests");

        AppState {
            db: PgPoolOptions::new().connect_lazy("postgres://localhost/mock").unwrap(),
            webauthn: Arc::new(
                webauthn_rs::WebauthnBuilder::new(
                    "localhost",
                    &url::Url::parse("http://localhost").unwrap(),
                )
                .unwrap()
                .build()
                .unwrap(),
            ),
            ws: WsState::new(),
            nats: nats_client,
        }
    }

    #[tokio::test]
    async fn test_admin_route_unauthorized() {
        let state = mock_app_state().await;
        let app = Router::new()
            .nest("/api/v1/admin", admin::router())
            .with_state(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/admin/pending-users")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn test_admin_route_forbidden_for_non_admin() {
        let user_id = Uuid::new_v4();
        let org_id = Uuid::new_v4();
        let token = create_test_token(user_id, org_id, false);

        let state = mock_app_state().await;
        let app = Router::new()
            .nest("/api/v1/admin", admin::router())
            .with_state(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/admin/pending-users")
                    .header("Authorization", format!("Bearer {}", token))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }
}
