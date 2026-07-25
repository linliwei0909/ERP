FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
RUN npm run prisma:generate

COPY src ./src

CMD ["npm", "run", "worker"]
