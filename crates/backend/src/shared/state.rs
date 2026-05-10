use sqlx::PgPool;
use std::sync::Arc;
use crate::infrastructure::persistence::postgres::user_repository::PostgresUserRepository;
use crate::nats::NatsService;
use crate::ws::WsState;

pub struct ApplicationState {
    pub config: Config,
    pub user_repo: Arc<dyn crate::infrastructure::persistence::user_repository::UserRepository>,
    pub nats: NatsService,
    pub ws: WsState,
    pub pool: PgPool,
}

#[derive(Clone)]
pub struct Config {
    pub jwt_secret: String,
    pub admin_bootstrap_enabled: bool,
}

impl ApplicationState {
    pub fn new(pool: PgPool, nats: NatsService, ws: WsState, config: Config) -> Self {
        Self {
            user_repo: Arc::new(PostgresUserRepository::new(pool.clone())),
            pool,
            nats,
            ws,
            config,
        }
    }
}
