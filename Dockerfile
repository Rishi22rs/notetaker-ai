FROM node:24-bookworm-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY *.js ./
COPY server ./server

ENV NODE_ENV=production
ENV HOST=0.0.0.0
CMD ["npm", "run", "start:auth"]
