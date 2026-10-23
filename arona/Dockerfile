FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node server.mjs secret-input.mjs store.mjs memory.mjs web.mjs music.mjs speech.mjs game.mjs notebook.mjs chat-tools.mjs package.json ./
COPY --chown=node:node dist ./dist
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173
VOLUME ["/app/data"]
EXPOSE 4173
CMD ["node", "server.mjs"]
