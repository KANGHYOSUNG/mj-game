FROM node:24-alpine
WORKDIR /app
COPY package.json *.html ./
COPY online ./online
RUN mkdir -p /data && chown -R node:node /data
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8000 LEADERBOARD_DB=/data/leaderboard.sqlite
USER node
EXPOSE 8000
VOLUME ["/data"]
CMD ["npm", "start"]
