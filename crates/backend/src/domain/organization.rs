use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Organization {
    pub id: Uuid,
    pub domain: String,
    pub name: String,
    pub audit_retention_days: i32,
    pub force_rls: bool,
    pub branding: serde_json::Value,
    pub is_maintenance_mode: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub struct OrganizationRegistration {
    pub domain: String,
    pub name: String,
}
