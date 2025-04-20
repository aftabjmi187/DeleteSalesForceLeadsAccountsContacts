# Use the official Playwright base image (includes all dependencies + browsers)
FROM mcr.microsoft.com/playwright:focal

# Set working directory in container
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the entire app
COPY . .

# Install Playwright browsers
RUN npx playwright install

# Expose the port your app uses (match PORT in server.js)
EXPOSE 2095

# Start your server
CMD ["node", "server.js"]

