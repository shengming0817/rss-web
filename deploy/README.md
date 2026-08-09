# RSS Web deployment foundation

The current image serves only the static SPA. It deliberately has no backend
proxy or runtime API configuration until a later issue defines the RSS edge
contract.

```bash
docker compose -f deploy/web/docker-compose.yml up -d --build
```

Open `http://localhost:8081`. The nginx health check verifies the static root;
it does not represent RSS backend health.
