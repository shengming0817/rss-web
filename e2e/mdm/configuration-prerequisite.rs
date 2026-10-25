//! Synthetic signed connection prerequisite, reusing rss-mdm's integration fixture owner.
//! This does not exercise or claim deployment/publication readiness.
use serde_json::Value;
use sqlx::{
    Connection,
    postgres::{PgConnectOptions, PgSslMode},
};
use zeroize::Zeroizing;

#[tokio::main]
async fn main() {
    if prepare().await.is_err() {
        eprintln!("configuration prerequisite failed");
        std::process::exit(1);
    }
}
async fn prepare() -> Result<(), Box<dyn std::error::Error>> {
    let input: Value =
        serde_json::from_slice(&std::fs::read(std::env::args().nth(1).ok_or("input")?)?)?;
    let text = |key: &str| input[key].as_str().ok_or("input");
    let runtime: Value = serde_json::from_slice(&std::fs::read(text("runtime")?)?)?;
    let protection = &runtime["native_protection"];
    let key = Zeroizing::new(std::fs::read(
        protection["active_file"].as_str().ok_or("key")?,
    )?);
    let fingerprint = Zeroizing::new(std::fs::read(
        protection["fingerprint_file"].as_str().ok_or("key")?,
    )?);
    let historical = protection["historical_files"]
        .as_array()
        .ok_or("keys")?
        .iter()
        .map(|path| Ok(Zeroizing::new(std::fs::read(path.as_str().ok_or("key")?)?)))
        .collect::<Result<Vec<_>, Box<dyn std::error::Error>>>()?;
    let refs = historical
        .iter()
        .map(|key| key.as_slice())
        .collect::<Vec<_>>();
    let protector =
        rss_mdm_native_protection::Protector::with_fingerprint(&key, &refs, &fingerprint)?;
    let password = Zeroizing::new(std::fs::read_to_string(text("passwordFile")?)?);
    let options = PgConnectOptions::new()
        .host("localhost")
        .port(input["port"].as_u64().ok_or("port")?.try_into()?)
        .database("mdm_dev")
        .username("postgres")
        .password(password.trim())
        .ssl_mode(PgSslMode::VerifyFull)
        .ssl_root_cert(text("ca")?);
    let mut connection = sqlx::PgConnection::connect_with(&options).await?;
    let mut tx = connection.begin().await?;
    sqlx::query("SELECT set_config('rss.tenant_id',$1,true)")
        .bind(text("tenant")?)
        .execute(&mut *tx)
        .await?;
    rss_mdm_registration_service::agent::connections::fixture_configuration_on(
        &mut tx,
        text("tenant")?.parse()?,
        &protector,
        text("origin")?,
    )
    .await?;
    tx.commit().await?;
    Ok(())
}
