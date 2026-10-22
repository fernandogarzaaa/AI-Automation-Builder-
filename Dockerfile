FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
USER node
# MCP stdio server: attach stdin/stdout from the host process.
CMD ["node", "src/mcp.mjs"]
