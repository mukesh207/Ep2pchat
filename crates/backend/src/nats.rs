#[derive(Clone, Default)]
pub struct NatsService {
    client: Option<async_nats::Client>,
}

impl NatsService {
    pub fn new(client: async_nats::Client) -> Self {
        Self {
            client: Some(client),
        }
    }

    pub fn disabled() -> Self {
        Self { client: None }
    }

    pub async fn subscribe(&self, subject: String) -> Option<async_nats::Subscriber> {
        match &self.client {
            Some(client) => client.subscribe(subject).await.ok(),
            None => None,
        }
    }

    pub async fn publish(&self, subject: String, payload: Vec<u8>) {
        if let Some(client) = &self.client {
            let _ = client.publish(subject, payload.into()).await;
        }
    }

    pub fn connection_state(&self) -> Option<async_nats::connection::State> {
        self.client.as_ref().map(|client| client.connection_state())
    }
}
