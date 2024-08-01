FROM node:14

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

EXPOSE 3000

# Start the application
CMD ["npm", "run", "react"]