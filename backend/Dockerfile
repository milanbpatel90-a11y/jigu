# Use latest Node Alpine image
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Copy only package files first to install dependencies
COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Copy remaining backend files
COPY . .

# Set Environment
ENV NODE_ENV=production
ENV PORT=8080

# Expose backend port
EXPOSE 8080

# Start backend server
CMD ["npm", "start"]
