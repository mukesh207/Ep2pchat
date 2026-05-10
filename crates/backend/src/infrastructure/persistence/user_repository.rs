use crate::domain::user::{User, UserStatus};
use crate::shared::error::AppError;
use async_trait::async_trait;
use uuid::Uuid;

#[async_trait]
pub trait UserRepository: Send + Sync {
    async fn find_by_id(&self, id: Uuid, org_id: Uuid) -> Result<Option<User>, AppError>;
    async fn find_by_email(&self, email: &str) -> Result<Option<User>, AppError>;
    async fn list_by_org(&self, org_id: Uuid, status: Option<UserStatus>) -> Result<Vec<User>, AppError>;
    async fn update_status(&self, id: Uuid, org_id: Uuid, status: UserStatus) -> Result<(), AppError>;
    async fn update_profile(&self, id: Uuid, org_id: Uuid, username: Option<String>, department: Option<String>) -> Result<(), AppError>;
}
