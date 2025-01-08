# Build stage
FROM node:20 as builder
WORKDIR /app
COPY package*.json ./

# Clear npm cache and use clean install
RUN npm cache clean --force
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html
COPY prod/nginx/nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]