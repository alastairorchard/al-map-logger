FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=3800
ENV NODE_ENV=production

EXPOSE 3800

CMD ["node", "server.js"]
