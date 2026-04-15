//! Database helpers for RLS context and tenant isolation.

use sqlx::{Executor, Postgres};
use uuid::Uuid;

pub async fn with_rls_context<F, T>(
    pool: &sqlx::PgPool,
    org_id: uuid::Uuid,
    f: F,
) -> Result<T, sqlx::Error>
where
    F: for<'c> FnOnce(
        &'c mut sqlx::PgConnection,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<T, sqlx::Error>> + Send + 'c>,
    >,
{
    let mut tx = pool.begin().await?;
    sqlx::query("SELECT set_config('app.current_org_id', $1, true)")
        .bind(org_id.to_string())
        .execute(&mut *tx)
        .await?;
    let result = f(&mut *tx).await?;
    tx.commit().await?;
    Ok(result)
}

/// Set the RLS context for the current transaction/connection.
/// Leaving this for legacy code until fully migrated.
pub async fn set_rls_context<'e, E>(executor: E, org_id: Uuid) -> Result<(), sqlx::Error>
where
    E: Executor<'e, Database = Postgres>,
{
    sqlx::query("SELECT set_config('app.current_org_id', $1, true)")
        .bind(org_id.to_string())
        .execute(executor)
        .await?;
    Ok(())
}
