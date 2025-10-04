FROM node:18-alpine
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# CRITICAL: Set PORT explicitly
ENV PORT=3004
EXPOSE 3004
CMD ["npm", "start"]
