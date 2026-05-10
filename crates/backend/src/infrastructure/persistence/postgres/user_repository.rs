use crate::domain::user::{User, UserStatus, UserRole};
use crate::infrastructure::persistence::user_repository::UserRepository;
use crate::shared::error::AppError;
use async_trait::async_trait;
use sqlx::{PgPool, Row};
use uuid::Uuid;

pub struct PostgresUserRepository {
    pool: PgPool,
}

impl PostgresUserRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl UserRepository for PostgresUserRepository {
    async fn find_by_id(&self, id: Uuid, org_id: Uuid) -> Result<Option<User>, AppError> {
        let row = sqlx::query(
            "SELECT id, org_id, email, username, status, role, department, presence_status, created_at 
             FROM users WHERE id = $1 AND org_id = $2"
        )
        .bind(id)
        .bind(org_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(map_user_row))
    }

    async fn find_by_email(&self, email: &str) -> Result<Option<User>, AppError> {
        let row = sqlx::query(
            "SELECT id, org_id, email, username, status, role, department, presence_status, created_at 
             FROM users WHERE email = $1"
        )
        .bind(email)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(map_user_row))
    }

    async fn list_by_org(&self, org_id: Uuid, status: Option<UserStatus>) -> Result<Vec<User>, AppError> {
        let mut query = "SELECT id, org_id, email, username, status, role, department, presence_status, created_at FROM users WHERE org_id = $1".to_string();
        
        if status.is_some() {
            query.push_str(" AND status = $2");
        }

        let mut q = sqlx::query(&query).bind(org_id);
        if let Some(s) = status {
            q = q.bind(s.to_string());
        }

        let rows = q.fetch_all(&self.pool).await?;
        Ok(rows.into_iter().map(map_user_row).collect())
    }

    async fn update_status(&self, id: Uuid, org_id: Uuid, status: UserStatus) -> Result<(), AppError> {
        sqlx::query("UPDATE users SET status = $1 WHERE id = $2 AND org_id = $3")
            .bind(status.to_string())
            .bind(id)
            .bind(org_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn update_profile(&self, id: Uuid, org_id: Uuid, username: Option<String>, department: Option<String>) -> Result<(), AppError> {
        sqlx::query(
            "UPDATE users SET username = COALESCE($1, username), department = COALESCE($2, department) 
             WHERE id = $3 AND org_id = $4"
        )
        .bind(username)
        .bind(department)
        .bind(id)
        .bind(org_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}

fn map_user_row(row: sqlx::postgres::PgRow) -> User {
    User {
        id: row.get("id"),
        org_id: row.get("org_id"),
        email: row.get("email"),
        username: row.get("username"),
        status: match row.get::<String, _>("status").as_str() {
            "pending_approval" => UserStatus::PendingApproval,
            "active" => UserStatus::Active,
            "denied" => UserStatus::Denied,
            "suspended" => UserStatus::Suspended,
            _ => UserStatus::PendingApproval,
        },
        role: match row.get::<String, _>("role").as_str() {
            "ADMIN" => UserRole::Admin,
            _ => UserRole::User,
        },
        department: row.get("department"),
        presence_status: row.get("presence_status"),
        created_at: row.get("created_at"),
    }
}
