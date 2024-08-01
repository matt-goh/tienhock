FROM node:14

# Install Electron dependencies
RUN apt-get update && apt-get install -y \
    libgtk-3-0 \
    libx11-xcb1 \
    libxcb1 \
    libxss1 \
    libnss3 \
    libasound2 \
    xvfb

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install all dependencies, including devDependencies
RUN npm install

# Install concurrently globally
RUN npm install -g concurrently

# Copy the rest of the application
COPY . .

# Expose the port the app runs on
EXPOSE 3000