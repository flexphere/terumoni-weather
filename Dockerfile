FROM node:10

WORKDIR /workspace

COPY . .

RUN yarn install

CMD ["node", "index.js"]