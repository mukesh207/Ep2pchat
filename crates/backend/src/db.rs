//! Database helpers for RLS context and tenant isolation.

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
    let result = f(&mut tx).await?;
    tx.commit().await?;
    Ok(result)
}
