# Gatra

The site of Gatra Peshtaz, rebuilt from the Squarespace site as plain pages. The main address will be gatra.nl.

- `src/pages/` holds the text of each page, `src/layout.html` the header and footer around it.
- `node build.mjs` writes the finished pages to `public/`; `node build.mjs serve` also shows them
  on http://localhost:8090.
- `public/` is the whole site: any web server can serve that folder as it is.

Still to do before it can replace the old site: the forms post to `/api/form`, which does not
exist yet. Until then a visitor who sends a form is told to mail instead.

## Deploy

`.github/workflows/deploy.yml` builds the pages and copies `public/` to the server when `main` changes
(or by hand from the Actions tab). It needs the secrets `DEPLOY_HOST` and `DEPLOY_SSH_KEY`. The folder on
the server is `/srv/gatra/public` unless the variable `DEPLOY_PATH` says otherwise; the web server (Caddy,
shared with the Gamer Xperience site) has to serve that folder.

## Forms

The forms post to `/api/form`. `server/form.mjs` receives them and mails them to info@gatra.nl through the
mailbox itself (STRATO, `smtp.strato.de`). The deploy starts it on the server as the container `gatra-form`
on the Docker network `gatra`; Caddy has to pass `/api/*` to `gatra-form:8080`. The mailbox password is the
secret `SMTP_PASSWORD`.
