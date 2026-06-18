FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --chown=node:node src ./src
COPY --chown=node:node test ./test

USER node

EXPOSE 3000

CMD ["node", "src/server.js"]
