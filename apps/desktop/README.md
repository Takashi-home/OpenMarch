# Desktop app

![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/OpenMarch/OpenMarch/total)

This is our main desktop drill writing app. [openmarch.com](https://openmarch.com)

```bash
pnpm desktop dev
```

## Environment

Optional (sign-in is disabled when either is unset):

- `VITE_CLERK_AUTHORIZATION_DOMAIN` – Clerk OAuth domain
- `VITE_CLERK_CLIENT_ID` – Clerk OAuth client ID

Set both in `.env` or `.env.production` to enable sign-in.

`pnpm desktop dev` connects to the development backend (`.env.development`).
To run the dev app against the production backend (for example, to publish to
the OpenMarch - On the Move mobile app), use:

```bash
pnpm desktop dev:prod-api
```

This uses `.env.prod-api`. It talks to real production data, so use it with care.

## License

OpenMarch is written under the [GPL-3.0 license](LICENSE).
All code written for this project will forever and always be open and accessible.
