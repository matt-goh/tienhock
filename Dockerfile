FROM node:14

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Install nodemon and concurrently globally
RUN npm install -g nodemon concurrently

# We'll copy the rest of the code via volume mounting

EXPOSE 3000

# Start the application using nodemon and concurrently
CMD ["npm", "run", "dev"]