use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum UserStatus {
    #[serde(rename = "pending_approval")]
    PendingApproval,
    #[serde(rename = "active")]
    Active,
    #[serde(rename = "denied")]
    Denied,
    #[serde(rename = "suspended")]
    Suspended,
}

impl ToString for UserStatus {
    fn to_string(&self) -> String {
        match self {
            UserStatus::PendingApproval => "pending_approval".to_string(),
            UserStatus::Active => "active".to_string(),
            UserStatus::Denied => "denied".to_string(),
            UserStatus::Suspended => "suspended".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum UserRole {
    #[serde(rename = "ADMIN")]
    Admin,
    #[serde(rename = "USER")]
    User,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: Uuid,
    pub org_id: Uuid,
    pub email: String,
    pub username: Option<String>,
    pub status: UserStatus,
    pub role: UserRole,
    pub department: Option<String>,
    pub presence_status: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}
