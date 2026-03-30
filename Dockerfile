FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /opt/chatter-web
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8081 \
    CHATTER_BBS_PROTOCOL=telnet \
    CHATTER_BBS_HOST=chatter.pw \
    CHATTER_BBS_PORT=2323
COPY --from=build /app/dist ./
RUN chown -R www-data:www-data /opt/chatter-web
USER www-data
EXPOSE 8081
CMD ["node", "server.js"]
