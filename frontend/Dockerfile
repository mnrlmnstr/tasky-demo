FROM node:26-slim

RUN mkdir /app && chown node:node /app
WORKDIR /app

USER node

# Dependencies first: this layer is rebuilt only when package.json or package-lock.json change.
COPY --chown=node:node package.json package-lock.json ./
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    npm ci

COPY --chown=node:node . .

EXPOSE 5173

# Vite is started directly, not through `npm run dev`: as PID 1 it receives SIGTERM itself,
# so `docker compose down` stops the container at once. Host and port come from vite.config.ts.
CMD ["node_modules/.bin/vite"]
