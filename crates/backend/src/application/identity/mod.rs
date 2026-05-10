use crate::domain::user::{User, UserStatus};
use crate::shared::error::AppError;
use async_trait::async_trait;
use uuid::Uuid;

#[async_trait]
pub trait IdentityService: Send + Sync {
    async fn request_access(&self, email: &str, metadata: serde_json::Value) -> Result<User, AppError>;
    async fn approve_user(&self, admin_id: Uuid, user_id: Uuid, org_id: Uuid) -> Result<(), AppError>;
    async fn revoke_device(&self, actor_id: Uuid, device_id: Uuid, org_id: Uuid) -> Result<(), AppError>;
}
